import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import config from './config.js';
import * as comfy from './comfy.js';
import * as store from './store.js';
import { gpu } from './gpu.js';
import { getWorkflow, buildGraph } from './workflows.js';
import { bodyLoras, installedLoras, applyBodyLoras, bodyFamily, applyLenovo, lenovoLora } from './body.js';

/** Bus globale degli eventi verso il frontend (SSE). */
export const bus = new EventEmitter();
bus.setMaxListeners(100);
export const emit = (conversationId, evt) => bus.emit('event', { conversationId, ...evt });

const controllers = new Map(); // mediaId -> AbortController

export function mediaUrl(file) { return file ? `/media/${file}` : null; }

export function emitMedia(conv, msg, media) {
  emit(conv.id, { type: 'media', messageId: msg.id, media: { ...media, url: mediaUrl(media.file) } });
}

/** Mette in coda la generazione di un media già preparato (prompt pronto). */
export function enqueue(conv, msg, media) {
  const ac = new AbortController();
  controllers.set(media.id, ac);
  media.status = 'queued';
  emitMedia(conv, msg, media);
  store.save(conv);

  const label = media.type === 'video' ? 'Generazione video' : 'Generazione immagine';

  return gpu.run('comfy', label, async () => {
    if (ac.signal.aborted) throw Object.assign(new Error('Annullato'), { aborted: true });
    media.status = 'running';
    media.startedAt = Date.now();
    emitMedia(conv, msg, media);

    // Video che parte dalla foto generata appena prima nello stesso messaggio (la coda GPU è in ordine)
    if (media.sourceMediaId && !media.sourceFile) {
      const src = msg.media.find((x) => x.id === media.sourceMediaId);
      if (!src?.file || src.status !== 'done') throw new Error('La foto di partenza non è riuscita');
      media.sourceFile = src.file;
      media.sourceUrl = mediaUrl(src.file);
    }
    // LoRA del corpo: nello Studio immagini quelle del personaggio scelto come soggetto, se c'è
    const card = conv.studio ? store.get(media.characterId || '')?.card : conv.card;
    await renderMedia(media, { ownerId: conv.ownerId, card, signal: ac.signal, onEvent: (e) => emit(conv.id, e) });
    // La prima foto diventa l'immagine del profilo, se il personaggio non ne ha ancora una
    if (media.type === 'image' && !conv.avatar && !conv.studio) {
      conv.avatar = media.file;
      emit(conv.id, { type: 'character', avatarUrl: mediaUrl(media.file) });
    }
    // Ritratto chiesto dalla scheda del personaggio (studio): copia sua, così cancellare lo studio non lo tocca
    const target = conv.studio && media.avatarFor && media.type === 'image' ? store.get(media.avatarFor) : null;
    if (target && target.ownerId === conv.ownerId) {
      const name = `${conv.ownerId}/ava-${randomUUID()}${path.extname(media.file).toLowerCase()}`;
      await fs.copyFile(path.join(config.paths.media, media.file), path.join(config.paths.media, name));
      target.avatar = name;
      store.save(target, { touch: false });
      emit(target.id, { type: 'character', avatarUrl: mediaUrl(name) });
    }
  }).catch((e) => {
    media.status = e.aborted || ac.signal.aborted ? 'cancelled' : 'error';
    media.error = media.status === 'cancelled' ? null : e.message;
    if (media.status === 'error') console.error(`[job ${media.id}]`, e.message);
  }).finally(() => {
    controllers.delete(media.id);
    emitMedia(conv, msg, media);
    store.save(conv, { touch: false });
  });
}

/**
 * Genera un media già preparato (prompt pronto) su ComfyUI e lo salva in data/media/<owner>/.
 * Va chiamata con la GPU già assegnata a ComfyUI (dentro gpu.run('comfy', ...)).
 * Usata dalla chat, dallo studio e dalla coda a goccia del social.
 */
export async function renderMedia(media, { ownerId, card, signal, onEvent = () => {} }) {
  const w = getWorkflow(media.workflow, media.type, media.mode);
  if (!w) throw new Error('Workflow non disponibile su ComfyUI');
  // Immagine di partenza (image to image / image to video / stessa persona): va caricata su ComfyUI
  const upload = async (file) => comfy.uploadImage(await fs.readFile(path.join(config.paths.media, file)), `chatbz_${path.basename(file)}`);
  const image = media.sourceFile ? await upload(media.sourceFile) : undefined;
  const [image2, image3] = await Promise.all((media.extraSources || []).slice(0, 2).map(upload));

  const graph = buildGraph(w, {
    prompt: media.prompt, seed: media.seed,
    width: media.width, height: media.height, frames: media.frames,
    image, image2, image3, denoise: media.denoise,
  });
  // Lenovo e LoRA del corpo del personaggio (grafi Krea 2 e Z-Image, solo LoRA installate su ComfyUI)
  const family = media.type === 'image' ? bodyFamily(graph) : null;
  if (family) {
    // Lenovo sì/no: forzato nello Studio o scelto da Gemma scrivendo il prompt, altrimenti come nel workflow
    const lenovo = typeof media.lenovo === 'boolean' ? media.lenovo : null;
    if (lenovo !== null) media.lenovoUsed = applyLenovo(graph, family, lenovo, lenovo ? await lenovoLora(family) : null);
    // fisico regolato a mano nello studio (anche tutto a 0 = nessuna LoRA), altrimenti quello del personaggio
    const loras = await installedLoras(media.manualBody ? media.manualBody : bodyLoras(card), family);
    if (applyBodyLoras(graph, loras, family)) media.loras = loras.map(({ part, strength }) => ({ part, strength }));
  }

  let lastPreview = 0;
  const { files } = await comfy.run(graph, {
    signal,
    onEvent: (e) => {
      if (e.type === 'progress') onEvent({ type: 'progress', mediaId: media.id, value: e.value, max: e.max });
      else if (e.type === 'node') onEvent({ type: 'progress', mediaId: media.id, phase: e.title });
      else if (e.type === 'preview' && Date.now() - lastPreview > 350) {
        lastPreview = Date.now();
        onEvent({ type: 'preview', mediaId: media.id, dataUrl: e.dataUrl });
      }
    },
  });

  const out = files.find((f) => /\.(mp4|webm|mov|gif)$/i.test(f.filename)) || files[0];
  if (!out) throw new Error('ComfyUI non ha restituito alcun file');
  const buf = await comfy.fetchFile(out);
  const name = `${ownerId}/${media.id}${path.extname(out.filename).toLowerCase()}`;
  await fs.mkdir(path.join(config.paths.media, ownerId), { recursive: true });
  await fs.writeFile(path.join(config.paths.media, name), buf);
  media.file = name;
  media.status = 'done';
  media.finishedAt = Date.now();
  return media;
}

export function cancel(mediaId) {
  const ac = controllers.get(mediaId);
  if (!ac) return false;
  ac.abort();
  return true;
}

/** All'avvio: i lavori rimasti a metà (server riavviato) vengono marcati come interrotti. */
export function recoverInterrupted() {
  for (const c of [...store.list(), ...store.listStudios()]) {
    let dirty = false;
    for (const m of c.messages) {
      if (m.status === 'streaming' || m.status === 'pending') { m.status = 'stopped'; dirty = true; }
      for (const md of m.media || []) {
        if (['queued', 'running', 'engineering'].includes(md.status)) {
          md.status = 'error'; md.error = 'Interrotto (server riavviato)'; dirty = true;
        }
      }
    }
    if (dirty) store.save(c, { touch: false });
  }
}

/**
 * Lettura di un'immagine con il modello visivo di ComfyUI (Qwen3-VL).
 * Va chiamata con la GPU già assegnata a ComfyUI (dentro gpu.run('comfy', ...)).
 */
export async function describeImage(file, question, { prompt: custom } = {}) {
  const w = getWorkflow(null, 'vision');
  if (!w) throw new Error('Nessun workflow di lettura immagini installato');
  const buf = await fs.readFile(path.join(config.paths.media, file));
  const image = await comfy.uploadImage(buf, `chatbz_${path.basename(file)}`);
  const prompt = custom || `Analizza questa immagine (una foto che una persona ha mandato in chat) per qualcuno che non può vederla. Descrivi in italiano, in modo oggettivo e completo: tipo di immagine (foto, screenshot, illustrazione, documento…), soggetti (aspetto, età apparente, abbigliamento, espressione, posa), oggetti, ambiente, colori, luce, stile, composizione e inquadratura. Trascrivi fedelmente tutto il testo visibile.${question ? ` Includi in particolare i dettagli utili per rispondere a questa richiesta dell'utente: «${question.slice(0, 500)}»` : ''}`;
  const { texts } = await comfy.run(buildGraph(w, { image, prompt }));
  const text = (texts[0] || '').trim();
  if (!text) throw new Error('Il modello visivo non ha restituito testo');
  return text;
}
