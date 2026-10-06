import fs from 'node:fs';
import path from 'node:path';
import config from './config.js';
import * as ollama from './ollama.js';
import * as store from './store.js';
import * as memory from './memory.js';
import { gpu } from './gpu.js';
import { emit, emitMedia, enqueue, describeImage, mediaUrl, cancel } from './jobs.js';
import { workflows, getWorkflow, dimensions, dimensionsForRatio, frameCount, randomSeed, ASPECTS } from './workflows.js';
import { promptProfile } from './auth.js';
import { systemPrompt, nowBlock, tools, promptEngineerSystem, characterMediaRequest, cleanPrompt, sceneCheckPrompt } from './prompts.js';
import { updateScene } from './relationship.js';
import * as queue from './queue.js';
import * as social from './social.js';

const running = new Map(); // characterId -> AbortController

export const isRunning = (id) => running.has(id);
export function stop(id) { running.get(id)?.abort(); }

const MAX_ATTACHMENTS = 4;

// Foto in chat ("istantanee"): il motore dipende dallo stile del personaggio
const INSTANT = { krea: 'krea2-real', zimage: 'zimage-turbo' };
const FORCE_NOTE = {
  photo: '\n\n[The user tapped «Foto»: answer by sending a photo with send_photo.]',
  video: '\n\n[The user tapped «Video»: answer by sending a video with send_video.]',
};

const attachmentNote = (atts) => atts.map((a) => (a.description
  ? `\n[they sent a photo: ${a.description}]`
  : '\n[they sent a photo that could not be read]')).join('');

const mediaNote = (md) => (md.type === 'video'
  ? `[you sent a short video: ${md.description}]`
  : `[you sent a photo: ${md.description}]`);

/** Ultima foto del personaggio (da animare con send_video). */
function lastCharacterPhoto(conv, within = 12) {
  for (let i = conv.messages.length - 1, n = 0; i >= 0 && n < within; i--, n++) {
    const m = conv.messages[i];
    if (m.role !== 'assistant') continue;
    const md = (m.media || []).findLast((x) => x.type === 'image' && x.status === 'done' && x.file);
    if (md) return md;
  }
  return null;
}

/** Cronologia nel formato di Ollama, entro il budget di contesto. */
function history(conv, upTo) {
  const msgs = [];
  for (const m of conv.messages.slice(0, upTo)) {
    if (m.role === 'user') {
      const atts = (m.attachments || []);
      const story = m.story ? `\n[they replied to your story${m.story.caption ? ` "${m.story.caption}"` : ''}: ${m.story.description || 'a photo of you'}]` : '';
      msgs.push({ role: 'user', content: `${m.content || ''}${attachmentNote(atts)}${story}`.trim() || '…', at: m.createdAt });
      continue;
    }
    if (m.status === 'pending' || m.status === 'streaming') continue;
    const notes = (m.media || []).filter((md) => !['cancelled', 'error'].includes(md.status)).map(mediaNote).join('\n');
    const content = [m.content, notes].filter(Boolean).join('\n\n');
    if (!content) continue;
    if (msgs.at(-1)?.role === 'assistant') msgs.at(-1).content += `\n\n${content}`;
    else msgs.push({ role: 'assistant', content, at: m.createdAt });
  }
  // Taglio dei messaggi più vecchi oltre il budget (~3 caratteri per token, riserva per il prompt di sistema)
  const budget = config.ollama.numCtx * 3 - 16000;
  let size = msgs.reduce((n, m) => n + m.content.length, 0);
  let trimmed = false;
  while (size > budget && msgs.length > 2) {
    size -= msgs.shift().content.length;
    trimmed = true;
  }
  while (msgs[0]?.role === 'assistant' && msgs.length > 1 && trimmed) size -= msgs.shift().content.length;
  return { msgs, trimmed };
}

/** Variante di riserva: il modello ha scritto [PHOTO: ...] / [VIDEO: ...] nel testo invece di usare lo strumento. */
const TAG = /\[\s*(PHOTO|FOTO|SELFIE|IMAGE|IMMAGINE|VIDEO|CLIP)\s*[:：\-–—]\s*([^\]]+?)\s*(?:\]|$)/i;
// Nota "[you sent a photo: ...]" copiata dalla cronologia: il modello la scrive al posto dello strumento
const SENT_NOTE = /\[\s*(?:you|tu)\s+sent\s+(?:a\s+)?(?:short\s+)?(photo|video)\s*:([^\]]*)\]?/gi;
// Gemma spesso annuncia la foto e mette la descrizione tra parentesi: "*Ti mando una foto:* [selfie allo specchio...]"
const MEDIA_WORD = /\b(?:foto\w*|selfie|scatt\w*|immagin\w*|pic|picture|photo\w*|snap|video\w*|clip)\b/i;
const VIDEO_WORD = /\b(?:video\w*|clip)\b/i;
const BRACKET = /\[([^\[\]\n]{12,})\]|\(((?:foto|selfie|photo|video|immagine)[^()\n]{8,})\)/i;
const ANNOUNCE = /\b(?:ti\s+(?:mando|invio|giro|faccio\s+vedere)|eccoti|ecco(?:mi)?\b[^.!?\n]{0,20}\b(?:foto|selfie)|guarda(?:\s+qui)?\s*[:!]|sending\s+(?:you\s+)?(?:a\s+)?(?:pic|photo)|here'?s\s+(?:a\s+)?(?:pic|photo|selfie))/i;
const ASKS_MEDIA = /\b(?:mand\w*|invi\w*|fa(?:mmi|i)\s+vedere|fammel\w*\s+vedere|scatta\w*|send|show)\b[^.!?\n]{0,40}\b(?:foto\w*|selfie|pic\w*|photo\w*|video\w*|immagin\w*)\b|\b(?:foto|selfie|pic|photo|video)\s*\?/i;

function cut(text, start, len) {
  let before = text.slice(0, start).replace(/[:：]\s*(\**)\s*$/, '$1').trimEnd();
  return `${before}${before ? ' ' : ''}${text.slice(start + len).trimStart()}`.replace(/\n{3,}/g, '\n\n').trim();
}

function extractTag(text, userText = '') {
  let noteCall = null;
  let clean = text.replace(SENT_NOTE, (all, kind, desc) => {
    if (!noteCall && desc.trim()) noteCall = { function: { name: /video/i.test(kind) ? 'send_video' : 'send_photo', arguments: { description: desc.trim() } } };
    return '';
  }).replace(/\n{3,}/g, '\n\n');
  if (noteCall) return { text: clean.trim(), call: noteCall };
  const m = clean.match(TAG);
  if (m) {
    const video = /VIDEO|CLIP/i.test(m[1]);
    return { text: cut(clean, m.index, m[0].length), call: { function: { name: video ? 'send_video' : 'send_photo', arguments: { description: m[2].trim() } } } };
  }
  // Descrizione tra parentesi accanto a un annuncio di foto
  const b = clean.match(BRACKET);
  if (b) {
    const around = clean.slice(Math.max(0, b.index - 160), b.index + b[0].length + 40);
    if (MEDIA_WORD.test(around) || ASKS_MEDIA.test(userText)) {
      const video = VIDEO_WORD.test(around) && !/\bfoto|selfie|photo\b/i.test(around);
      return { text: cut(clean, b.index, b[0].length), call: { function: { name: video ? 'send_video' : 'send_photo', arguments: { description: (b[1] || b[2]).replace(/^(?:foto|selfie|photo|video|immagine)\s*[:：\-–—]\s*/i, '').trim() } } } };
    }
  }
  // Nessuna descrizione, ma la risposta annuncia una foto che l'utente ha chiesto
  if (ASKS_MEDIA.test(userText) && ANNOUNCE.test(clean)) {
    const video = VIDEO_WORD.test(userText) && !/\bfoto|selfie|photo\b/i.test(userText);
    return { text: clean.trim(), call: { function: { name: video ? 'send_video' : 'send_photo', arguments: { description: `${userText}\n\n(reply: ${clean.trim()})` } } } };
  }
  return { text: clean.trim(), call: null };
}

// Indizi che la situazione potrebbe essere cambiata: solo in quel caso si controlla la scena
const MOVE_HINT = /\b(?:arriv\w*|pass(?:o|i|a)\s+(?:da|a\s+prender)|veng(?:o|hi)|sono\s+(?:qui|qua|fuori|sotto|davanti|arrivat\w)|sotto\s+casa|campanell\w*|suon\w*|buss\w*|citofon\w*|apr\w*\s+(?:la\s+)?porta|entr\w*|ci\s+vediamo|raggiung\w*|incontr\w*|vado\s+via|me\s+ne\s+vado|torn\w*\s+a\s+casa|esc\w*|usc\w*|mi\s+cambi\w*|mi\s+spogli\w*|vesti\w*|doccia|letto|camera|divano|bac\w*|abbracc\w*|knock\w*|doorbell|come\s+over|on\s+my\s+way|i'?m\s+here|outside|leav\w*|kiss\w*|hug\w*)\b/i;
const ACTION = /\*[^*\n]{3,}\*/;
const needsSceneCheck = (scene, user, reply) =>
  MOVE_HINT.test(user || '') || MOVE_HINT.test(reply || '') || (scene.presence === 'apart' && ACTION.test(reply || ''));

async function sceneCheck(conv, user, reply, model) {
  const out = await ollama.complete({
    model, format: 'json', timeout: 30000,
    options: { temperature: 0.1, num_predict: 160 },
    messages: sceneCheckPrompt({ card: conv.card, scene: conv.state.scene, user, reply }),
  });
  let j;
  try { j = JSON.parse(out); } catch { return null; }
  if (!j?.changed) return null;
  const { changed, ...patch } = j;
  return patch;
}

const parseArgs = (a) => {
  if (typeof a !== 'string') return a || {};
  try { return JSON.parse(a); } catch { return { description: a }; }
};

/** Trasforma send_photo / send_video in un media da generare. */
function mediaFromCall(conv, call, callIndex) {
  const name = call.function?.name;
  const args = parseArgs(call.function?.arguments);
  const description = String(args.description || '').trim();
  if (!description) return null;
  const base = { id: store.newId(), toolName: name, callIndex, args, description, prompt: '', seed: randomSeed(), status: 'engineering', createdAt: Date.now() };

  if (name === 'send_photo') {
    const w = getWorkflow(INSTANT[conv.card.style] || INSTANT.krea, 'image');
    if (!w) return null;
    const aspect = ASPECTS[args.aspect_ratio] ? args.aspect_ratio : '3:4';
    return { ...base, type: 'image', mode: 'text2img', workflow: w.id, workflowName: w.name, aspect, ...dimensions(w, aspect) };
  }
  if (name === 'send_video') {
    const photo = lastCharacterPhoto(conv);
    const w = photo ? getWorkflow(null, 'video', 'img2video') : getWorkflow(null, 'video');
    if (!w) return null;
    const { seconds, frames } = frameCount(w, args.duration || 5);
    if (photo) {
      const ratio = (photo.width || 3) / (photo.height || 4);
      return { ...base, type: 'video', mode: 'img2video', workflow: w.id, workflowName: w.name, seconds, frames,
        aspect: photo.aspect, ...dimensionsForRatio(w, ratio),
        sourceFile: photo.file, sourceUrl: mediaUrl(photo.file), sourceDescription: photo.prompt || photo.description };
    }
    // Nessuna foto recente: prima una foto della scena, poi si anima quella (così il video le somiglia, come in ChatBz 1)
    const still = mediaFromCall(conv, { function: { name: 'send_photo', arguments: { description: `Still first frame of a short video: ${description}`, aspect_ratio: '9:16' } } }, callIndex);
    const wi = getWorkflow(null, 'video', 'img2video');
    if (still && wi) {
      const f = frameCount(wi, args.duration || 5);
      return [still, { ...base, id: store.newId(), type: 'video', mode: 'img2video', workflow: wi.id, workflowName: wi.name, seconds: f.seconds, frames: f.frames,
        aspect: '9:16', ...dimensionsForRatio(wi, still.width / still.height), sourceMediaId: still.id }];
    }
    return { ...base, type: 'video', mode: 'text2video', workflow: w.id, workflowName: w.name, seconds, frames, aspect: '9:16', ...dimensions(w, '9:16') };
  }
  return null;
}

/** Riscrive la descrizione del personaggio nel prompt ottimizzato per il modello (in streaming). */
async function engineerPrompt(conv, msg, media, model, signal) {
  const w = getWorkflow(media.workflow, media.type, media.mode);
  let text = '';
  const out = await ollama.chat({
    model, signal, think: false,
    options: { temperature: 0.7 },
    messages: [
      { role: 'system', content: promptEngineerSystem(w) },
      { role: 'user', content: characterMediaRequest({ card: conv.card, state: conv.state, media, width: media.width, height: media.height, seconds: media.seconds, sourceDescription: media.sourceFile || media.sourceMediaId ? media.sourceDescription : undefined }) },
    ],
    onChunk: (c) => {
      if (!c.content) return;
      text += c.content;
      emit(conv.id, { type: 'prompt_delta', messageId: msg.id, mediaId: media.id, delta: c.content });
    },
  });
  return cleanPrompt(out.content || text) || media.description;
}

function checkAttachments(conv, list) {
  const out = [];
  for (const a of (Array.isArray(list) ? list : []).slice(0, MAX_ATTACHMENTS)) {
    const f = String(a?.file || '');
    if (!f.startsWith(`${conv.ownerId}/up-`) || f.includes('..') || !fs.existsSync(path.join(config.paths.media, f))) {
      throw Object.assign(new Error('Allegato non valido'), { status: 400 });
    }
    out.push({ id: store.newId(), kind: 'image', file: f, url: mediaUrl(f), width: Number(a.width) || 0, height: Number(a.height) || 0 });
  }
  return out;
}

/** Messaggio dell'utente: lo salva e avvia la risposta del personaggio. */
export async function send(conv, opts) {
  if (running.has(conv.id)) throw new Error('Sta già rispondendo');
  const text = String(opts.text || '').trim();
  const attachments = checkAttachments(conv, opts.attachments);
  if (!text && !attachments.length) throw new Error('Messaggio vuoto');
  const userMsg = { id: store.newId(), role: 'user', content: text, attachments: attachments.length ? attachments : undefined, tool: opts.tool || null, story: opts.story || undefined, createdAt: Date.now() };
  queue.touch();
  conv.messages.push(userMsg);
  emit(conv.id, { type: 'message', message: userMsg });
  const msg = startTurn(conv, { tool: opts.tool, model: opts.model });
  return { userMessage: userMsg, message: msg };
}

/** Rigenera l'ultima risposta del personaggio (la scena torna com'era prima). */
export function regenerate(conv, { model } = {}) {
  if (running.has(conv.id)) throw new Error('Sta già rispondendo');
  const last = conv.messages.at(-1);
  if (!last || last.role !== 'assistant') throw new Error('Nessuna risposta da rigenerare');
  for (const md of last.media || []) cancel(md.id);
  if (last.sceneBefore) conv.state.scene = last.sceneBefore;
  const prevUser = conv.messages.findLast((m) => m.role === 'user');
  store.removeMessages(conv, [last.id]);
  emit(conv.id, { type: 'removed', messageId: last.id });
  return startTurn(conv, { model, tool: prevUser?.tool, initiative: last.initiative });
}

/** Il personaggio scrive per primo (iniziativa alla riaccensione). */
export function initiate(conv, { model } = {}) {
  if (running.has(conv.id)) return null;
  return startTurn(conv, { model, initiative: true });
}

function startTurn(conv, { tool, model, initiative = false }) {
  model = model || config.ollama.model;
  const msg = { id: store.newId(), role: 'assistant', content: '', media: [], steps: [], model, status: 'pending', createdAt: Date.now(),
    sceneBefore: structuredClone(conv.state.scene), presence: conv.state.scene.presence, ...(initiative ? { initiative: true } : {}) };
  conv.messages.push(msg);
  store.save(conv);
  emit(conv.id, { type: 'message', message: msg });

  const ac = new AbortController();
  running.set(conv.id, ac);
  runTurn(conv, msg, { tool, model, initiative, signal: ac.signal }).finally(() => running.delete(conv.id));
  return msg;
}

async function runTurn(conv, msg, { tool, model, initiative, signal }) {
  const idx = conv.messages.indexOf(msg);
  const userMsg = initiative ? null : conv.messages.slice(0, idx).findLast((m) => m.role === 'user');
  const onWait = (active) => emit(conv.id, { type: 'status', messageId: msg.id, status: 'waiting', reason: active.label });
  const visionModel = (await ollama.capabilities(model).catch(() => [])).includes('vision');
  try {
    // Foto inviate dall'utente: descritte dal modello visivo di ComfyUI (Gemma uncensored non vede le immagini)
    const unread = (userMsg?.attachments || []).filter((a) => !a.description && !a.visionError);
    if (unread.length && !visionModel) {
      await gpu.run('comfy', 'Guardo la foto', async () => {
        for (const att of unread) {
          if (signal.aborted) break;
          try { att.description = await describeImage(att.file, userMsg.content); }
          catch (e) { att.visionError = e.message; }
        }
      }, { onWait });
      store.save(conv, { touch: false });
      emit(conv.id, { type: 'message', message: userMsg });
    }
    if (signal.aborted) throw new Error('Interrotto');

    const calls = [];
    await gpu.run('ollama', `Risposta di ${conv.card.name}`, async () => {
      msg.status = 'streaming';
      emit(conv.id, { type: 'status', messageId: msg.id, status: 'streaming' });

      const { msgs, trimmed } = history(conv, idx);
      const prevAt = initiative ? conv.messages[idx - 1]?.createdAt : conv.messages.slice(0, Math.max(0, idx - 1)).findLast((m) => m.status !== 'pending')?.createdAt;
      const memories = memory.forPrompt(conv.id);
      const block = nowBlock({ card: conv.card, state: conv.state, memories, lastGapMs: prevAt ? Date.now() - prevAt : null, trimmed, initiative, social: social.chatContext(conv) });
      const convo = [{ role: 'system', content: systemPrompt(conv.card, { user: promptProfile(conv.ownerId) }) }, ...msgs.map(({ role, content }) => ({ role, content }))];
      if (initiative || convo.at(-1).role !== 'user') convo.push({ role: 'user', content: block });
      else convo.at(-1).content = `${block}\n\n${convo.at(-1).content}${FORCE_NOTE[tool] || ''}`;
      // Le immagini dell'utente vanno al modello solo se le vede davvero
      if (visionModel && userMsg?.attachments?.length) {
        convo.at(-1).images = userMsg.attachments.map((a) => { try { return fs.readFileSync(path.join(config.paths.media, a.file)).toString('base64'); } catch { return null; } }).filter(Boolean);
      }

      const allTools = tools({ canAnimate: !!lastCharacterPhoto(conv) });
      let sceneChanged = false;
      for (let round = 0; round < 3; round++) {
        const result = await ollama.chat({
          model, signal, messages: convo,
          tools: round === 0 ? allTools : allTools.filter((t) => t.function.name !== 'update_scene'),
          options: { temperature: 0.85, repeat_penalty: 1.08 },
          onChunk: (c) => { if (c.content) { msg.content += c.content; emit(conv.id, { type: 'delta', messageId: msg.id, content: c.content }); } },
        });
        msg.stats = result.stats;
        const sceneCalls = result.tool_calls.filter((c) => c.function?.name === 'update_scene');
        if (sceneCalls.length) sceneChanged = true;
        calls.push(...result.tool_calls.filter((c) => c.function?.name !== 'update_scene'));
        for (const c of sceneCalls) {
          conv.state.scene = updateScene(conv.state.scene, parseArgs(c.function.arguments));
          msg.presence = conv.state.scene.presence;
          emit(conv.id, { type: 'scene', scene: conv.state.scene, messageId: msg.id, presence: msg.presence });
        }
        // Ha solo aggiornato la scena senza scrivere: continua la risposta nella nuova situazione
        if (!sceneCalls.length || msg.content.trim() || calls.length) break;
        convo.push({ role: 'assistant', content: result.content || '', tool_calls: sceneCalls.map((c) => ({ function: { name: 'update_scene', arguments: parseArgs(c.function.arguments) } })) });
        convo.push({ role: 'tool', tool_name: 'update_scene', content: JSON.stringify({ ok: true, scene: conv.state.scene, note: 'Scene updated. Now write your reply in the new situation.' }) });
      }

      // Riserva: tag o descrizione nel testo, o strumento chiesto con il pulsante e ignorato dal modello
      const tag = extractTag(msg.content, userMsg?.content || '');
      if (tag.text !== msg.content) { msg.content = tag.text; emit(conv.id, { type: 'content', messageId: msg.id, content: msg.content }); }

      // Riserva per la scena: il modello racconta un cambio di situazione senza chiamare update_scene
      if (!sceneChanged && msg.content.trim() && needsSceneCheck(conv.state.scene, userMsg?.content, msg.content)) {
        const patch = await sceneCheck(conv, userMsg?.content || '', msg.content, model).catch((e) => { console.warn('[scene]', e.message); return null; });
        if (patch && !signal.aborted) {
          conv.state.scene = updateScene(conv.state.scene, patch);
          msg.presence = conv.state.scene.presence;
          emit(conv.id, { type: 'scene', scene: conv.state.scene, messageId: msg.id, presence: msg.presence });
        }
      }
      if (!calls.length && tag.call) calls.push(tag.call);
      if (!calls.length && (tool === 'photo' || tool === 'video')) {
        calls.push({ function: { name: tool === 'photo' ? 'send_photo' : 'send_video', arguments: { description: userMsg?.content || 'a casual selfie' } } });
      }
      calls.slice(0, 2).forEach((c, i) => { const md = mediaFromCall(conv, c, i); if (md) msg.media.push(...[md].flat()); });
      for (const md of msg.media) emitMedia(conv, msg, md);

      // Prompt per il modello immagine/video (Gemma è ancora in VRAM: si fa subito)
      for (const md of msg.media) {
        const src = md.sourceMediaId && msg.media.find((x) => x.id === md.sourceMediaId);
        if (src) md.sourceDescription = src.prompt || src.description;
        md.prompt = await engineerPrompt(conv, msg, md, model, signal);
        emitMedia(conv, msg, md);
      }
    }, { onWait });
    msg.status = 'done';
  } catch (e) {
    if (signal.aborted) {
      msg.status = 'stopped';
      for (const md of msg.media) if (md.status === 'engineering') { md.status = 'cancelled'; emitMedia(conv, msg, md); }
    } else {
      msg.status = 'error';
      msg.error = e.message;
      for (const md of msg.media) if (md.status === 'engineering') { md.status = 'error'; md.error = e.message; emitMedia(conv, msg, md); }
      console.error('[chat]', e);
    }
  } finally {
    conv.state.lastActivityAt = Date.now();
    await store.save(conv);
    emit(conv.id, { type: 'done', messageId: msg.id, status: msg.status, error: msg.error, stats: msg.stats });
  }
  // Le immagini partono dopo il testo: la risposta è già visibile mentre ComfyUI lavora
  for (const md of msg.media) if (md.status === 'engineering') enqueue(conv, msg, md);
}

/** Rigenera un media: stessa impostazione, nuovo seed (o prompt modificato). Nessun passaggio da Gemma. */
export function regenerateMedia(conv, messageId, mediaId, { prompt } = {}) {
  const msg = conv.messages.find((m) => m.id === messageId);
  const src = msg?.media?.find((m) => m.id === mediaId);
  if (!src) throw new Error('Media non trovato');
  const media = {
    ...src,
    id: store.newId(),
    prompt: (prompt && String(prompt).trim()) || src.prompt,
    seed: randomSeed(),
    status: 'queued', error: null, file: null,
    createdAt: Date.now(), startedAt: null, finishedAt: null,
  };
  msg.media.push(media);
  enqueue(conv, msg, media);
  return media;
}

export { workflows };
