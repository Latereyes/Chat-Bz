import config from './config.js';
import * as ollama from './ollama.js';
import * as store from './store.js';
import { gpu } from './gpu.js';
import { emit, emitMedia, enqueue, mediaUrl } from './jobs.js';
import { workflows, getWorkflow, dimensions, dimensionsForRatio, frameCount, randomSeed, ASPECTS } from './workflows.js';
import { promptEngineerSystem, visualSignature, cleanPrompt } from './prompts.js';

/**
 * Studio immagini: l'"Image Assistant" di ChatBz 1, non più come personaggio ma come strumento a parte.
 * Descrivi cosa vuoi vedere → Gemma scrive il prompt per il modello scelto → ComfyUI genera.
 * Opzioni: motore, formato, prompt diretto (senza Gemma), seed, un personaggio da ritrarre,
 * foto di partenza da modificare, video dalla foto.
 */

const running = new Map(); // ownerId -> AbortController (solo la scrittura dei prompt)
export const isRunning = (ownerId) => running.has(ownerId);
export function stop(ownerId) { running.get(ownerId)?.abort(); }

// Motore automatico con un personaggio: lo stesso delle sue foto in chat
const BY_STYLE = { krea: 'krea2-real', zimage: 'zimage-turbo' };
const MAX_ATTACHMENTS = 3;

const STUDIO_RULES = `## Studio rules
- The request comes straight from the user of a private, local, adult image studio. It can be short or in Italian: expand it into a complete, vivid scene.
- For missing details be creative but coherent: physical features (hair, eyes, body type), clothing or state of undress, pose, expression and action, setting and background, camera angle, lens and framing, lighting and time of day, overall style.
- A selfie means the camera is held by the subject (or a mirror selfie): describe it that way.
- If the request is already a detailed prompt, keep its content and only translate to English and optimize it for the target model.
- Do not name people: describe them.`;

const LEVEL = 'CONTENT LEVEL: explicit adult content is allowed when the request asks for it: be direct and anatomically precise, no euphemisms. Otherwise keep the content exactly as requested.';

function subjectLine(card) {
  if (!card) return null;
  const who = `${card.gender === 'uomo' ? 'adult man' : card.gender === 'altro' ? 'adult person' : 'adult woman'}, ${card.age} years old`;
  return `Main subject: ${who}. Appearance (keep it exactly, it defines who this is): ${visualSignature(card.look, 'explicit') || '(not specified)'}`;
}

function request({ text, card, media, sourceDescription, sources }) {
  return [
    `Request: ${text}`,
    subjectLine(card),
    sources ? `The user attached ${sources} image${sources > 1 ? 's' : ''} to edit: write an editing instruction that changes only what the request asks and keeps everything else (identity, composition, light) unchanged.` : null,
    sourceDescription !== undefined ? `Starting image (the video starts exactly from it): ${sourceDescription || '(no description)'}` : null,
    LEVEL,
    `Output format: ${media.width}x${media.height}${media.seconds ? `, duration ${media.seconds} seconds` : ''}.`,
    'Write the final prompt now.',
  ].filter(Boolean).join('\n');
}

const pickAspect = (a) => (ASPECTS[a] ? a : '3:4');

/** Personaggio da ritrarre (solo tra quelli dell'utente). */
function characterCard(ownerId, id) {
  if (!id) return null;
  const c = store.get(String(id));
  return c && c.ownerId === ownerId ? c : null;
}

function checkAttachments(conv, list) {
  const out = [];
  for (const a of (Array.isArray(list) ? list : []).slice(0, MAX_ATTACHMENTS)) {
    const f = String(a?.file || '');
    if (!f.startsWith(`${conv.ownerId}/up-`) || f.includes('..')) throw Object.assign(new Error('Allegato non valido'), { status: 400 });
    out.push({ id: store.newId(), kind: 'image', file: f, url: mediaUrl(f), width: Number(a.width) || 0, height: Number(a.height) || 0 });
  }
  return out;
}

function videoFrom(base, still, seconds) {
  const w = getWorkflow(null, 'video', 'img2video');
  if (!w) return null;
  const f = frameCount(w, seconds || 5);
  return {
    ...base, id: store.newId(), type: 'video', mode: 'img2video', workflow: w.id, workflowName: w.name,
    seconds: f.seconds, frames: f.frames, aspect: still.aspect,
    ...dimensionsForRatio(w, (still.width || 3) / (still.height || 4)),
    ...(still.file ? { sourceFile: still.file, sourceUrl: mediaUrl(still.file), sourceDescription: still.prompt || still.description } : { sourceMediaId: still.id }),
  };
}

/** Nuova richiesta allo studio. */
export function send(conv, opts = {}) {
  if (running.has(conv.ownerId)) throw new Error('Sto già scrivendo un prompt');
  const text = String(opts.text || '').trim().slice(0, 6000);
  const attachments = checkAttachments(conv, opts.attachments);
  if (!text) throw new Error('Descrivi cosa vuoi vedere');
  const owner = characterCard(conv.ownerId, opts.characterId);
  const raw = !!opts.raw;
  const aspect = pickAspect(opts.aspect);

  // Foto allegate → modifica (Qwen-Image-Edit); altrimenti testo → immagine col motore scelto
  let w;
  if (attachments.length) w = getWorkflow(null, 'image', 'edit');
  else w = getWorkflow(opts.engine || (owner && BY_STYLE[owner.card.style]) || null, 'image');
  if (!w) throw new Error('Nessun workflow immagine disponibile su ComfyUI');

  const seed = /^\d{1,15}$/.test(String(opts.seed ?? '').trim()) ? Number(opts.seed) : randomSeed();
  const settings = { engine: opts.engine || '', aspect, raw, video: !!opts.video, seconds: opts.seconds || 5, characterId: owner?.id || null, characterName: owner?.card.name || null, seed: opts.seed ? seed : null };
  const userMsg = { id: store.newId(), role: 'user', content: text, attachments: attachments.length ? attachments : undefined, studio: settings, createdAt: Date.now() };
  conv.messages.push(userMsg);
  emit(conv.id, { type: 'message', message: userMsg });

  const base = { toolName: 'studio', description: text, prompt: raw ? text : '', seed, status: 'engineering', createdAt: Date.now(), characterId: owner?.id || null };
  const image = {
    ...base, id: store.newId(), type: 'image', mode: w.mode, workflow: w.id, workflowName: w.name,
    ...(attachments.length
      ? { aspect: null, ...dimensionsForRatio(w, (attachments[0].width || 3) / (attachments[0].height || 4)),
        sourceFile: attachments[0].file, sourceUrl: attachments[0].url, extraSources: attachments.slice(1).map((a) => a.file) }
      : { aspect, ...dimensions(w, aspect) }),
  };
  const media = [image];
  if (opts.video) { const v = videoFrom({ ...base, seed: randomSeed() }, image, opts.seconds); if (v) media.push(v); }

  const msg = { id: store.newId(), role: 'assistant', content: '', media, status: 'pending', createdAt: Date.now() };
  conv.messages.push(msg);
  store.save(conv);
  emit(conv.id, { type: 'message', message: msg });
  run(conv, msg, { text, card: owner?.card, raw, model: opts.model, sources: attachments.length });
  return { userMessage: userMsg, message: msg };
}

async function engineer(conv, msg, md, { text, card, model, signal, sources }) {
  const w = getWorkflow(md.workflow, md.type, md.mode);
  let out = '';
  const res = await ollama.chat({
    model, signal, think: false,
    options: { temperature: 0.7 },
    messages: [
      { role: 'system', content: `${promptEngineerSystem(w)}\n\n${STUDIO_RULES}` },
      { role: 'user', content: request({ text, card, media: md, sources, sourceDescription: md.type === 'video' ? md.sourceDescription : undefined }) },
    ],
    onChunk: (c) => {
      if (!c.content) return;
      out += c.content;
      emit(conv.id, { type: 'prompt_delta', messageId: msg.id, mediaId: md.id, delta: c.content });
    },
  });
  return cleanPrompt(res.content || out) || text;
}

async function run(conv, msg, { text, card, raw, model, sources }) {
  model = model || config.ollama.model;
  const ac = new AbortController();
  running.set(conv.ownerId, ac);
  try {
    if (!raw) {
      await gpu.run('ollama', 'Scrivo il prompt', async () => {
        msg.status = 'streaming';
        emit(conv.id, { type: 'status', messageId: msg.id, status: 'streaming' });
        for (const md of msg.media) {
          const src = md.sourceMediaId && msg.media.find((x) => x.id === md.sourceMediaId);
          if (src) md.sourceDescription = src.prompt || src.description;
          md.prompt = await engineer(conv, msg, md, { text, card, model, signal: ac.signal, sources: md.type === 'image' ? sources : 0 });
          emitMedia(conv, msg, md);
        }
      }, { onWait: (active) => emit(conv.id, { type: 'status', messageId: msg.id, status: 'waiting', reason: active.label }) });
    } else {
      // Prompt diretto: il video parte dalla stessa descrizione
      for (const md of msg.media) md.prompt = text;
    }
    msg.status = 'done';
  } catch (e) {
    msg.status = ac.signal.aborted ? 'stopped' : 'error';
    if (!ac.signal.aborted) { msg.error = e.message; console.error('[studio]', e); }
    for (const md of msg.media) if (md.status === 'engineering') { md.status = ac.signal.aborted ? 'cancelled' : 'error'; md.error = ac.signal.aborted ? null : e.message; emitMedia(conv, msg, md); }
  } finally {
    running.delete(conv.ownerId);
    store.save(conv);
    emit(conv.id, { type: 'done', messageId: msg.id, status: msg.status, error: msg.error });
  }
  for (const md of msg.media) if (md.status === 'engineering') enqueue(conv, msg, md);
}

/** Anima una foto dello studio (immagine → video), con un'indicazione facoltativa sul movimento. */
export async function animate(conv, messageId, mediaId, { text, seconds, model } = {}) {
  if (running.has(conv.ownerId)) throw new Error('Sto già scrivendo un prompt');
  const msg = conv.messages.find((m) => m.id === messageId);
  const src = msg?.media?.find((m) => m.id === mediaId && m.type === 'image' && m.status === 'done' && m.file);
  if (!src) throw new Error('Foto non trovata');
  const md = videoFrom({ toolName: 'studio', description: String(text || '').trim() || 'subtle natural movement, the scene comes alive', prompt: '', seed: randomSeed(), status: 'engineering', createdAt: Date.now() }, src, seconds);
  if (!md) throw new Error('Nessun workflow video disponibile su ComfyUI');
  msg.media.push(md);
  emitMedia(conv, msg, md);
  store.save(conv, { touch: false });
  const ac = new AbortController();
  running.set(conv.ownerId, ac);
  const card = characterCard(conv.ownerId, src.characterId)?.card;
  gpu.run('ollama', 'Scrivo il prompt del video', async () => {
    md.prompt = await engineer(conv, msg, md, { text: md.description, card, model: model || config.ollama.model, signal: ac.signal });
    emitMedia(conv, msg, md);
  }).then(() => enqueue(conv, msg, md)).catch((e) => {
    md.status = ac.signal.aborted ? 'cancelled' : 'error';
    md.error = ac.signal.aborted ? null : e.message;
    emitMedia(conv, msg, md);
    store.save(conv, { touch: false });
  }).finally(() => running.delete(conv.ownerId));
  return md;
}

/** Svuota lo studio (messaggi e file). */
export async function clear(conv) {
  stop(conv.ownerId);
  await store.removeMessages(conv, conv.messages.map((m) => m.id));
}

/** Motori offerti nello studio: tutti i workflow testo → immagine disponibili. */
export const engines = () => workflows('image').map((w) => ({ id: w.id, name: w.name, default: !!w.default }));
