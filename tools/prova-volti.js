// Banco di prova del ritocco del volto: rifà foto già fatte (stesso prompt, stesso seed) con varianti del ritocco,
// una accanto all'altra con l'originale. Non tocca le foto delle chat: i risultati vanno in data/prove-volti/<data>/.
//
//   node tools/prova-volti.js --personaggio "Elena Valli" --ultime 3      le ultime 3 foto Krea 2 di un personaggio
//   node tools/prova-volti.js --media <id>,<id>                           foto precise (id del media)
//
// Opzioni:
//   --varianti senza,prima,pulita    (default) vedi VARIANTI qui sotto; «tutte» = tutte
//   --elenco                         elenca le varianti ed esce
import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../src/config.js';
import * as comfy from '../src/comfy.js';
import * as store from '../src/store.js';
import { db } from '../src/db.js';
import { gpu } from '../src/gpu.js';
import { loadWorkflows, checkAvailability } from '../src/workflows.js';
import { renderMedia } from '../src/jobs.js';
import { SINGLE_FACE, DUO_FACES, FACE_CHAIN } from '../src/krea2.js';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const has = (name) => args.includes(`--${name}`);

const plus = (d) => () => {
  for (const k of Object.keys(SINGLE_FACE.denoise)) SINGLE_FACE.denoise[k] = Math.round((SINGLE_FACE.denoise[k] + d) * 100) / 100;
  DUO_FACES.denoise = Math.round((DUO_FACES.denoise + d) * 100) / 100;
  DUO_FACES.explicitDenoise = Math.round((DUO_FACES.explicitDenoise + d) * 100) / 100;
};
// Ogni variante cambia i valori di src/krea2.js solo per la sua foto (poi si rimettono come erano)
const VARIANTI = {
  senza: { label: 'Senza ritocco (come main)', noFaces: true },
  prima: { label: 'Ritocco con tutta la catena (com\'era)', set: () => { FACE_CHAIN.full = true; } },
  pulita: { label: 'Catena pulita, volti grandi lasciati com\'erano (attuale)' },
  'pulita-forte': { label: 'Catena pulita, denoise +0.1', set: plus(0.1) },
  'pulita-leggera': { label: 'Catena pulita, denoise -0.1', set: plus(-0.1) },
  'guida-768': { label: 'Catena pulita, ritaglio a 768', set: () => { DUO_FACES.guideSize = 768; } },
  'senza-lenovo': { label: 'Catena pulita senza Lenovo nel ritocco', set: () => { FACE_CHAIN.lenovo = false; } },
  'tutti-i-volti': { label: 'Catena pulita, ritocca anche i volti grandi', set: () => { SINGLE_FACE.maxFace = 0; } },
  'denoise-alto': { label: 'Catena pulita, denoise +0.25', set: plus(0.25) },
  'sampler-beta': { label: 'Catena pulita, 12 passi beta (come la foto esplicita)', set: () => { Object.assign(DUO_FACES, { steps: 12, scheduler: 'beta' }); } },
  'senza-maschera': { label: 'Catena pulita, ridisegna tutto il ritaglio (niente maschera)', set: () => { DUO_FACES.noiseMask = false; } },
  'a-due-come-prima': { label: 'Foto a due: niente espressione nel ritocco, ritocco della persona anche se si toccano', set: () => { Object.assign(DUO_FACES, { expression: false, contact: false }); } },
  'contesto-largo': { label: 'Catena pulita, più contesto (crop 3.5)', set: () => { DUO_FACES.cropFactor = 3.5; } },
};

if (has('elenco')) {
  for (const [id, v] of Object.entries(VARIANTI)) console.log(`  ${id.padEnd(16)} ${v.label}`);
  process.exit(0);
}
const variantIds = opt('varianti') === 'tutte' ? Object.keys(VARIANTI) : (opt('varianti') || 'senza,prima,pulita').split(',').map((v) => v.trim());
for (const v of variantIds) if (!VARIANTI[v]) { console.error(`Variante sconosciuta: ${v} (vedi --elenco)`); process.exit(1); }

// Tutte le foto con il personaggio a cui appartengono: chat, chat a due, Studio, social
function allPhotos() {
  const out = [];
  const add = (md, card, where) => { if (md?.type === 'image' && md.status === 'done' && md.file) out.push({ md, card, where }); };
  for (const c of store.list()) for (const m of c.messages) for (const md of m.media || []) add(md, c.card, `chat ${c.card.name}`);
  for (const c of [...store.listGroups(), ...store.listStudios()]) for (const m of c.messages) for (const md of m.media || []) {
    add(md, md.characterId ? store.get(md.characterId)?.card : null, c.studio ? 'Studio' : `chat a due ${c.card.name}`);
  }
  for (const p of db.prepare("SELECT * FROM posts WHERE status = 'published' AND media IS NOT NULL").all()) {
    let list = [];
    try { list = JSON.parse(p.media) || []; } catch {}
    for (const md of [].concat(list)) add(md, store.get(md.characterId || p.character_id)?.card, 'social');
  }
  return out.sort((a, b) => (b.md.finishedAt || 0) - (a.md.finishedAt || 0));
}

const photos = allPhotos();
const ids = opt('media')?.split(',').map((s) => s.trim()).filter(Boolean);
const who = opt('personaggio')?.toLowerCase();
// foto a due: il personaggio si riconosce dalla sua LoRA nel ritocco
const loraOf = new Map(store.list().filter((c) => c.card?.lora?.file).map((c) => [path.basename(c.card.lora.file), c.card.name.toLowerCase()]));
const named = (p) => p.card?.name?.toLowerCase() === who || (p.md.duoFaces || []).some((f) => f && loraOf.get(path.basename(f.file)) === who);
let pick = ids ? photos.filter((p) => ids.includes(p.md.id))
  : who ? photos.filter((p) => p.md.mode === 'text2img' && /krea2/.test(p.md.workflow || '') && named(p)) : [];
pick = pick.slice(0, Number(opt('ultime')) || (ids ? ids.length : 3));
if (!pick.length) { console.error('Nessuna foto trovata (usa --personaggio "Nome" o --media id)'); process.exit(1); }

loadWorkflows();
await checkAvailability(comfy.listModels);
const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
const dir = path.join(config.paths.data, 'prove-volti', stamp);
await fs.mkdir(dir, { recursive: true });
const tmpOwner = '_prove-volti';

const saved = JSON.stringify({ SINGLE_FACE, DUO_FACES, FACE_CHAIN });
const reset = (obj, from) => { for (const k of Object.keys(obj)) if (!(k in from)) delete obj[k]; Object.assign(obj, from); };
const restore = () => { const s = JSON.parse(saved); reset(SINGLE_FACE, s.SINGLE_FACE); reset(DUO_FACES, s.DUO_FACES); reset(FACE_CHAIN, s.FACE_CHAIN); };
// campi decisi da renderMedia: si tolgono, così ogni variante parte dalla stessa richiesta
const OUTPUT = ['file', 'status', 'finishedAt', 'stack', 'loras', 'lenovoUsed', 'facesFixed', 'facesError', 'error', 'sourceFile', 'sourceUrl'];

const rows = [];
for (const { md, card, where } of pick) {
  const row = { id: md.id, where, name: card?.name || md.characterName || '?', level: md.level, seed: md.seed, prompt: md.prompt, shots: [] };
  const orig = `${md.id}--originale${path.extname(md.file)}`;
  await fs.copyFile(path.join(config.paths.media, md.file), path.join(dir, orig)).then(() => row.shots.push({ variant: 'originale', file: orig, stack: md.stack }), () => {});
  console.log(`\n━━ ${row.name} · ${where} · ${md.level} · seed ${md.seed}`);
  for (const v of variantIds) {
    restore();
    VARIANTI[v].set?.();
    const clone = structuredClone(md);
    for (const k of OUTPUT) delete clone[k];
    clone.id = `${md.id}--${v}`;
    const shot = { variant: v, file: null, error: null, seconds: 0 };
    const t0 = Date.now();
    try {
      const r = await gpu.run('comfy', `Prova volto ${row.name} / ${v}`, () => renderMedia(clone, { ownerId: tmpOwner, card, noFaces: !!VARIANTI[v].noFaces }));
      shot.file = path.basename(r.file);
      await fs.rename(path.join(config.paths.media, r.file), path.join(dir, shot.file));
      shot.stack = r.stack;
      shot.facesFixed = r.facesFixed;
      shot.facesError = r.facesError;
    } catch (e) { shot.error = e.message; }
    shot.seconds = Math.round((Date.now() - t0) / 1000);
    console.log(`  [${v}] ${shot.error ? `✗ ${shot.error}` : `${shot.file} · ritocchi ${shot.facesFixed || 0}${shot.facesError ? ` · ERRORE ritocco: ${shot.facesError}` : ''} · ${shot.seconds} s`}`);
    row.shots.push(shot);
  }
  rows.push(row);
}
restore();
await fs.rm(path.join(config.paths.media, tmpOwner), { recursive: true, force: true });
await fs.writeFile(path.join(dir, 'risultati.json'), JSON.stringify(rows, null, 2));
await fs.writeFile(path.join(dir, 'index.html'), page(rows));
console.log(`\nFatto: ${path.join(dir, 'index.html')}`);
process.exit(0);

function page(list) {
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const label = (v) => (v === 'originale' ? 'Originale' : VARIANTI[v].label);
  const stack = (s) => (s || []).map((l) => `${l.label} ${l.strength}`).join(', ');
  const body = list.map((r) => `<section><h2>${esc(r.name)} · ${esc(r.where)} · ${esc(r.level)} · seed ${esc(r.seed)}</h2>
    <details><summary>Prompt</summary><pre>${esc(r.prompt)}</pre></details>
    <div class="row">${r.shots.map((s) => `<figure>${s.file ? `<a href="${esc(s.file)}" target="_blank"><img src="${esc(s.file)}" loading="lazy"></a>` : `<div class="err">${esc(s.error)}</div>`}
      <figcaption><b>${esc(label(s.variant))}</b><small>${esc(stack(s.stack))}${s.facesError ? ` · errore ritocco: ${esc(s.facesError)}` : ''}${s.seconds ? ` · ${s.seconds} s` : ''}</small></figcaption></figure>`).join('')}</div></section>`).join('');
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Prove volti ${stamp}</title>
<style>
:root { color-scheme: light dark; --bg: #faf9f7; --fg: #1d1c1a; --muted: #6b6a66; --line: #e4e2dd; }
@media (prefers-color-scheme: dark) { :root { --bg: #1b1b1a; --fg: #ececea; --muted: #a3a29d; --line: #333230; } }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, sans-serif; }
h2 { font-size: 16px; margin: 24px 0 8px; }
.row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; }
figure { margin: 0; width: 320px; max-width: 80vw; flex: none; }
img { width: 100%; border-radius: 6px; display: block; }
figcaption small { display: block; color: var(--muted); }
pre { white-space: pre-wrap; font-size: 12px; color: var(--muted); }
.err { height: 120px; display: grid; place-items: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 6px; }
</style></head><body><h1>Prove volti · ${esc(stamp)}</h1>${body}</body></html>`;
}
