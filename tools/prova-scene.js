// Banco di prova delle scene: una foto di partenza e poi le sue modifiche (espressione, posa), solo con Krea 2
// e la LoRA del personaggio, per vedere quanto restano uguali vestiti, tavolo e sfondo da una foto all'altra.
// I prompt li scrive il modello della chat (come per le foto in chat): qui ci sono solo descrizioni brevi in italiano.
//
//   node tools/prova-scene.js [--personaggio Hitomi] [--seed 123] [--solo-prompt]
//
// Tre modi di modificare una foto:
//  - base:  testo → immagine (krea2-real), come una foto in chat, ritocco del volto compreso
//  - volto: solo il ritocco del volto (YOLO + DetailerForEach) sulla foto di partenza, con l'espressione nuova:
//           il resto della foto non viene ridisegnato
//  - posa:  image to image (krea2-i2i) su tutta la foto a denoise più alto, poi il ritocco del volto
// Risultati in data/prova-scene/<data>/ (index.html per confrontarli). Non tocca le chat.
import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../src/config.js';
import * as comfy from '../src/comfy.js';
import * as ollama from '../src/ollama.js';
import * as store from '../src/store.js';
import * as models from '../src/models.js';
import { gpu } from '../src/gpu.js';
import { loadWorkflows, checkAvailability, getWorkflow, buildGraph, dimensions, randomSeed } from '../src/workflows.js';
import { renderMedia } from '../src/jobs.js';
import { engineerPhoto, applyPhotoStack, applyDuoFaces } from '../src/photo.js';
import { lenovoLora, comfyLoras } from '../src/body.js';
import { cleanPrompt } from '../src/prompts.js';
import { SINGLE_FACE } from '../src/krea2.js';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const has = (name) => args.includes(`--${name}`);

const conv = store.list().find((c) => c.card.name.toLowerCase().includes((opt('personaggio') || 'hitomi').toLowerCase()));
if (!conv?.card.lora?.file) { console.error('Personaggio non trovato o senza LoRA'); process.exit(1); }
const card = conv.card;
const seed = Number(opt('seed')) || randomSeed();
const model = models.of(conv.ownerId).chat;

// Le scene: descrizioni brevi, come le scriverebbe chi chatta. from = foto da cui parte la modifica.
const DRESS = 'un vestito da sera blu';
const STEPS = [
  { id: '1-ristorante', kind: 'base', place: 'an elegant restaurant, at dinner', activity: 'having dinner with the viewer', outfit: DRESS,
    ask: 'Siamo a cena al ristorante, sei seduta al tavolo di fronte a me col vestito da sera blu: fammi vedere come sei' },
  { id: '1a-sorride', kind: 'volto', from: '1-ristorante', ask: 'sorride, un sorriso caldo e sincero', denoise: [0.45, 0.6] },
  { id: '1b-broncio', kind: 'volto', from: '1-ristorante', ask: 'fa il broncio, labbra in fuori, un po\' offesa per scherzo', denoise: [0.45, 0.6] },
  { id: '1c-mano', kind: 'posa', from: '1-ristorante', ask: 'stesso tavolo e stesso vestito: si sporge sul tavolo con il gomito appoggiato e il viso appoggiato sulla mano, mi guarda', denoise: [0.55, 0.7] },
  { id: '2-divano', kind: 'base', place: 'her apartment, on the sofa', activity: 'sitting close beside the viewer on the sofa after dinner', outfit: DRESS, keepDress: '1-ristorante',
    ask: 'Ora siamo a casa tua, sul divano: sei seduta vicinissima accanto a me, sempre col vestito blu, con un bicchiere di vino rosso in mano' },
  { id: '3-pensierosa', kind: 'volto', from: '2-divano', ask: 'alza lo sguardo verso l\'alto, pensierosa', denoise: [0.45, 0.6] },
  { id: '3b-pensierosa-posa', kind: 'posa', from: '2-divano', ask: 'stesso divano, stesso vestito, stesso bicchiere: alza lo sguardo verso l\'alto, pensierosa', denoise: [0.45] },
];

loadWorkflows();
await checkAvailability(comfy.listModels);
const real = getWorkflow('krea2-real', 'image');
const i2i = getWorkflow('krea2-i2i', 'image', 'img2img');
if (!real || !i2i) { console.error('Mancano i workflow krea2-real o krea2-i2i su ComfyUI'); process.exit(1); }

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const dir = path.join(config.paths.data, 'prova-scene', `${stamp}-${card.name.split(' ')[0].toLowerCase()}`);
await fs.mkdir(dir, { recursive: true });
const tmpOwner = '_prova-scene';
await fs.mkdir(path.join(config.paths.media, tmpOwner), { recursive: true });
const { width, height } = dimensions(real, '3:4');
const who = `${card.gender === 'uomo' ? 'adult man' : 'adult woman'}, ${card.age} years old`;
const clip = (t, n) => { const x = String(t || '').trim(); return x.length > n ? `${x.slice(0, n)}…` : x; };
const secs = (t0) => Math.round((Date.now() - t0) / 100) / 10;

// Frasi del prompt di partenza sul vestito: passano a Gemma per la scena dopo (stesso vestito, stesse parole)
const dressOf = (prompt) => String(prompt || '').split(/(?<=[.;])\s+/).filter((s) => /\b(?:dress|gown|neckline|fabric|satin|silk|velvet|straps?|sleeve\w*)\b/i.test(s)).join(' ');

/** Prompt di una foto intera (base o posa), scritto dal modello della chat come per le foto in chat. */
async function photoPrompt(step, out) {
  const from = out.get(step.from || step.keepDress);
  const outfit = from ? clip(dressOf(from.prompt), 400) || DRESS : DRESS;
  const state = { scene: { presence: 'together', place: step.place || from?.place, activity: step.activity || from?.activity, outfit }, rel: conv.state?.rel };
  const r = await gpu.run('ollama', `Prompt scena ${step.id}`, () => engineerPhoto({
    workflow: real, card, state, user: { name: 'Andrea', gender: 'uomo' }, model,
    media: { description: step.ask, width, height }, userText: step.ask,
  }));
  return r;
}

/** Solo l'espressione, scritta dal modello: il ritocco del volto la mette sulla foto. */
async function facePrompt(step) {
  const res = await gpu.run('ollama', `Prompt volto ${step.id}`, () => ollama.chat({
    model, think: false, options: { temperature: 0.5 },
    messages: [
      { role: 'system', content: 'You write short prompts for Krea 2, an image model that redraws only the face area of an existing photo. Describe only the face: facial expression, mouth, eyes, eyebrows, gaze direction and head tilt. Never describe clothes, body, place or light. One or two plain English sentences, no names, no quotes.' },
      { role: 'user', content: `The person in the photo (${who}) now: ${step.ask} (it may be in Italian). Write the prompt now.` },
    ],
  }));
  const text = cleanPrompt(res.content || '');
  // niente descrizione del personaggio: l'identità la dà la LoRA, e la scheda («confident, warm expression», il maglione)
  // contraddiceva l'espressione nuova (prova sul PC 2026-10-12)
  return [card.lora.trigger, `close-up photo of the face of an ${who}`, text, 'natural skin texture, real photo'].filter(Boolean).join(', ');
}

/** Ritocco del solo volto sulla foto di partenza: il grafo image to image senza il suo sampler (la foto non si ridisegna). */
async function faceEdit(id, srcFile, prompt, denoise, s) {
  const graph = buildGraph(i2i, { prompt, seed: s, image: await comfy.uploadImage(await fs.readFile(path.join(config.paths.media, srcFile)), `chatbz_${path.basename(srcFile)}`), denoise: 0.5 });
  const files = await comfyLoras();
  applyPhotoStack(graph, { level: 'neutral', lenovo: true, lenovoFile: await lenovoLora('krea2'), charLora: card.lora, files, stack: true, sampler: false });
  // il ritocco parte dall'immagine caricata, non dall'uscita del sampler: ComfyUI salta i nodi che non servono
  const save = Object.keys(graph).find((id) => graph[id].class_type === 'SaveImage');
  const scale = Object.keys(graph).find((id) => graph[id].class_type === 'ImageScaleToTotalPixels');
  graph[save].inputs.images = [scale, 0];
  const keep = structuredClone(SINGLE_FACE);
  Object.assign(SINGLE_FACE, { maxFace: 0, denoise: { neutral: denoise } });   // anche i volti grandi, col denoise della prova
  const n = applyDuoFaces(graph, [{ file: card.lora.file, text: prompt }], { files, seed: s, single: true, level: 'neutral' });
  Object.assign(SINGLE_FACE, keep);
  if (!n) throw new Error('ritocco del volto non disponibile (Impact Pack o face_yolov8m mancanti)');
  const { files: outFiles } = await comfy.run(graph);
  const buf = await comfy.fetchFile(outFiles[0]);
  const name = `${tmpOwner}/${id}-d${denoise}.png`;
  await fs.writeFile(path.join(config.paths.media, name), buf);
  return name;
}

const out = new Map();   // id → { file, prompt, place, activity }
const rows = [];
for (const step of STEPS) {
  const row = { ...step, shots: [], promptSeconds: 0 };
  console.log(`\n━━ ${step.id} (${step.kind}) · ${step.ask}`);
  const t0 = Date.now();
  try {
    const p = step.kind === 'volto' ? { prompt: await facePrompt(step) } : await photoPrompt(step, out);
    row.prompt = p.prompt;
    row.level = p.level;
    row.lenovo = p.lenovo;
    row.promptSeconds = secs(t0);
    console.log(`  prompt (${row.promptSeconds} s, ${model}): ${p.prompt}`);
  } catch (e) { row.error = e.message; console.log(`  ✗ prompt: ${e.message}`); rows.push(row); continue; }
  if (has('solo-prompt')) { rows.push(row); out.set(step.id, { prompt: row.prompt, place: step.place, activity: step.activity }); continue; }

  const from = out.get(step.from);
  for (const d of step.kind === 'base' ? [null] : step.denoise) {
    const shot = { denoise: d, file: null, seconds: 0 };
    const t1 = Date.now();
    try {
      let file;
      if (step.kind === 'volto') file = await gpu.run('comfy', `Scena ${step.id} volto ${d}`, () => faceEdit(step.id, from.file, row.prompt, d, seed + 1));
      else {
        const media = {
          id: `${step.id}${d ? `-d${d}` : ''}`, type: 'image', seed: step.kind === 'base' ? seed : seed + 2, prompt: row.prompt, level: row.level || 'neutral',
          charLora: true, characterId: conv.id, lenovo: row.lenovo ?? true,
          ...(step.kind === 'base' ? { mode: 'text2img', workflow: real.id, width, height } : { mode: 'img2img', workflow: i2i.id, width, height, sourceFile: from.file, denoise: d }),
        };
        const r = await gpu.run('comfy', `Scena ${step.id}`, () => renderMedia(media, { ownerId: tmpOwner, card }));
        file = r.file;
        shot.stack = r.stack;
        shot.facesFixed = r.facesFixed;
        shot.facesError = r.facesError;
      }
      shot.file = file;
      shot.seconds = secs(t1);
      console.log(`  [${d ?? 'base'}] ${file} · ${shot.seconds} s${shot.facesError ? ` · ERRORE ritocco: ${shot.facesError}` : ''}`);
    } catch (e) { shot.error = e.message; console.log(`  [${d ?? 'base'}] ✗ ${e.message}`); }
    row.shots.push(shot);
  }
  // la foto da cui partono le modifiche dopo: la base, o la prima variante riuscita
  const first = row.shots.find((s) => s.file);
  if (first) out.set(step.id, { file: first.file, prompt: row.prompt, place: step.place || from?.place, activity: step.activity || from?.activity });
  rows.push(row);
}

// copia nella cartella della prova, con nomi leggibili
for (const r of rows) for (const s of r.shots) if (s.file) {
  const name = `${r.id}${s.denoise ? `-denoise-${s.denoise}` : ''}.png`;
  await fs.copyFile(path.join(config.paths.media, s.file), path.join(dir, name));
  s.file = name;
}
await fs.rm(path.join(config.paths.media, tmpOwner), { recursive: true, force: true });
await fs.writeFile(path.join(dir, 'risultati.json'), JSON.stringify({ personaggio: card.name, seed, model, rows }, null, 2));
await fs.writeFile(path.join(dir, 'index.html'), page(rows));
console.log(`\nFatto: ${path.join(dir, 'index.html')}`);
process.exit(0);

function page(list) {
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KIND = { base: 'Foto di partenza (testo → immagine)', volto: 'Solo ritocco del volto', posa: 'Image to image su tutta la foto' };
  const body = list.map((r) => `<section><h2>${esc(r.id)} · ${esc(KIND[r.kind])}${r.from ? ` da ${esc(r.from)}` : ''}</h2>
    <p>${esc(r.ask)} <small>(prompt in ${r.promptSeconds} s)</small></p>
    <details><summary>Prompt</summary><pre>${esc(r.prompt || r.error)}</pre></details>
    <div class="row">${r.shots.map((s) => `<figure>${s.file ? `<a href="${esc(s.file)}" target="_blank"><img src="${esc(s.file)}" loading="lazy"></a>` : `<div class="err">${esc(s.error)}</div>`}
      <figcaption><b>${s.denoise ? `denoise ${s.denoise}` : 'base'}</b> · ${s.seconds} s</figcaption></figure>`).join('')}</div></section>`).join('');
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Prova scene ${stamp}</title>
<style>
:root { color-scheme: light dark; --bg: #faf9f7; --fg: #1d1c1a; --muted: #6b6a66; --line: #e4e2dd; }
@media (prefers-color-scheme: dark) { :root { --bg: #1b1b1a; --fg: #ececea; --muted: #a3a29d; --line: #333230; } }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, sans-serif; }
h2 { font-size: 16px; margin: 24px 0 4px; }
.row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; }
figure { margin: 0; width: 320px; max-width: 80vw; flex: none; }
img { width: 100%; border-radius: 6px; display: block; }
small, figcaption { color: var(--muted); }
pre { white-space: pre-wrap; font-size: 12px; color: var(--muted); }
.err { height: 120px; display: grid; place-items: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 6px; }
</style></head><body><h1>Prova scene · ${esc(card.name)} · seed ${seed}</h1>${body}</body></html>`;
}
