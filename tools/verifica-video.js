#!/usr/bin/env node
/**
 * Verifica dei video MiniMax H3 sul PC, senza ChatBz e senza Gemma.
 *
 *   node tools/verifica-video.js
 *     Chiede a ComfyUI (acceso) l'elenco dei nodi e delle LoRA e controlla, SENZA generare niente, i grafi che ChatBz
 *     manda per i video: image to video e text to video con le LoRA di ogni filtro, la variante con lo shift e i due
 *     grafi «continua» (con MiniMaxH3AddGuide e con l'ultimo fotogramma). Per ogni nodo: che esista, che abbia tutti
 *     gli input obbligatori, che gli input abbiano i nomi giusti, che i collegamenti siano del tipo giusto, che valori
 *     e file (LoRA, sampler) siano ammessi. Sono gli stessi controlli che ComfyUI fa prima di partire.
 *
 *   node tools/verifica-video.js --genera <video.mp4> [--secondi 3] [--senza-guida] [--filtro neutral|sensual|explicit]
 *     Continua davvero un video esistente (es. uno in data/media/…) e salva il risultato in data/prova-video/.
 *     Lancialo con ChatBz spento o fermo: la GPU è una sola.
 */
import fs from 'node:fs';
import path from 'node:path';
import config from '../src/config.js';
import * as comfy from '../src/comfy.js';
import { loadWorkflows, buildGraph } from '../src/workflows.js';
import { applyVideoStack, LORAS } from '../src/minimax.js';
import { continueGraph, continueFrames, CONTINUE_NODES, GUIDE_NODE, OVERLAP } from '../src/videochain.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const base = config.comfy.url.replace(/\/$/, '');
const ok = (t) => console.log(`  OK  ${t}`);
const warn = (t) => console.log(`  !!  ${t}`);
let errors = 0;
const bad = (t) => { errors++; console.log(`  XX  ${t}`); };

// Input che sono file caricati da ChatBz al momento (foto o video di partenza): non stanno nell'elenco di ComfyUI
// Workflow per id, anche se ChatBz non ha ancora controllato che i modelli ci siano
const workflow = (id) => loadWorkflows().find((w) => w.id === id);

const UPLOADED = { LoadImage: ['image'], LoadVideo: ['file'] };

/** Tipo, opzioni ed elenco dei valori ammessi di un input, sia nel formato vecchio dei nodi che in quello nuovo (V3). */
function inputSpec(spec) {
  const [type, extra = {}] = Array.isArray(spec) ? spec : [spec];
  if (Array.isArray(type)) return { type: 'COMBO', extra, options: type };
  return { type, extra, options: type === 'COMBO' ? extra.options || [] : null };
}

/** Controlla un grafo (formato API) come fa ComfyUI prima di partire. Restituisce l'elenco dei problemi. */
function checkGraph(graph, info) {
  const problems = [];
  for (const [id, node] of Object.entries(graph)) {
    const name = `${id} ${node.class_type}${node._meta?.title ? ` («${node._meta.title}»)` : ''}`;
    const cls = info[node.class_type];
    if (!cls) { problems.push(`${name}: nodo non installato su ComfyUI`); continue; }
    const req = cls.input?.required || {}, opt = cls.input?.optional || {};
    for (const key of Object.keys(req)) if (!(key in node.inputs)) problems.push(`${name}: manca l'input obbligatorio «${key}»`);
    for (const [key, val] of Object.entries(node.inputs)) {
      const raw = req[key] ?? opt[key];
      // un input con un nome che il nodo non conosce viene ignorato da ComfyUI in silenzio: quasi sempre è un nome sbagliato
      if (raw === undefined) { problems.push(`${name}: input «${key}» sconosciuto (il nodo ha: ${[...Object.keys(req), ...Object.keys(opt)].join(', ')})`); continue; }
      const { type, extra, options } = inputSpec(raw);
      if (Array.isArray(val)) {
        const src = graph[val[0]];
        if (!src) { problems.push(`${name}: «${key}» collegato al nodo ${val[0]}, che non c'è`); continue; }
        const outs = info[src.class_type]?.output;
        if (!outs) continue;
        const got = outs[val[1]];
        if (got === undefined) { problems.push(`${name}: «${key}» usa l'uscita ${val[1]} di ${src.class_type}, che ne ha ${outs.length}`); continue; }
        const want = String(type).split(','), have = String(got).split(',');
        if (!want.includes('*') && !have.includes('*') && !want.some((t) => have.includes(t))) problems.push(`${name}: «${key}» vuole ${type} ma riceve ${got} da ${src.class_type}`);
        continue;
      }
      if (options && !(UPLOADED[node.class_type] || []).includes(key) && !options.includes(val)) {
        problems.push(`${name}: «${key}» = ${JSON.stringify(val)} non è tra i valori ammessi${options.length <= 12 ? ` (${options.join(', ')})` : ` (${options.length} valori: file mancante?)`}`);
      }
      if (typeof val === 'number' && extra.min !== undefined && val < extra.min) problems.push(`${name}: «${key}» = ${val} sotto il minimo ${extra.min}`);
      if (typeof val === 'number' && extra.max !== undefined && val > extra.max) problems.push(`${name}: «${key}» = ${val} sopra il massimo ${extra.max}`);
    }
  }
  return problems;
}

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

// Tutto quello che il video può contenere: così si agganciano tutte le LoRA del profilo
const ALL = { woman: true, vulva: true, penis: true, kiss: true, direction: 'front' };
const PROMPT = 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\nintegrated_multimodal_description: [Shot 1] test.\n\noverall_soundscape: room tone.\n\nnon_diegetic_music: N/A';

async function verifica() {
  console.log(`\nComfyUI: ${base}`);
  let info;
  try { info = await getJson(`${base}/object_info`); } catch (e) {
    console.log(`  XX  ComfyUI non risponde (${e.message}). Avvialo e rilancia.`); process.exit(1);
  }
  const loras = await comfy.listModels('loras').catch(() => []);

  console.log('\n[1] Nodi per video lunghi e «Continua»');
  for (const n of CONTINUE_NODES) (info[n] ? ok : bad)(n + (info[n] ? '' : ': MANCA, serve un ComfyUI più recente'));
  if (info[GUIDE_NODE]) ok(`${GUIDE_NODE}: i pezzi partono dagli ultimi ${OVERLAP} fotogrammi e dall'audio`);
  else warn(`${GUIDE_NODE}: manca, i pezzi partono solo dall'ultimo fotogramma (stacco più visibile). Aggiorna ComfyUI`);
  (info.MiniMaxH3SigmaShift ? ok : warn)(`MiniMaxH3SigmaShift${info.MiniMaxH3SigmaShift ? '' : ': manca, la variante «HMNSFW con shift 6» non funziona'}`);

  console.log('\n[2] LoRA dei video');
  const norm = (f) => f.replace(/\\/g, '/');
  for (const l of Object.values(LORAS)) {
    const found = loras.find((f) => norm(f) === l.file || norm(f).endsWith(`/${l.file}`));
    if (found) ok(`${l.label}: ${found}`); else warn(`${l.label}: ${l.file} MANCA (il video esce senza)`);
  }

  console.log('\n[3] Grafi che ChatBz manda a ComfyUI (controllo, niente generazione)');
  const i2v = workflow('minimax-h3-i2v');
  const t2v = workflow('minimax-h3-t2v');
  const cases = [];
  for (const level of ['neutral', 'sensual', 'explicit']) {
    cases.push([`image to video, ${level}`, () => buildGraph(i2v, { prompt: PROMPT, seed: 1, frames: 124, image: 'prova.png' }), level, null]);
    if (t2v) cases.push([`text to video, ${level}`, () => buildGraph(t2v, { prompt: PROMPT, seed: 1, frames: 124, width: 768, height: 512 }), level, null]);
  }
  cases.push(['image to video, explicit, HMNSFW con shift 6', () => buildGraph(i2v, { prompt: PROMPT, seed: 1, frames: 124, image: 'prova.png' }), 'explicit', 'hmnsfw-shift6']);
  for (const level of ['neutral', 'explicit']) {
    if (info[GUIDE_NODE]) cases.push([`continua con la clip guida, ${level}`, () => continueGraph(i2v, { video: 'prova.mp4', prompt: PROMPT, seed: 1, seconds: 10, guide: true }), level, null]);
    cases.push([`continua dall'ultimo fotogramma, ${level}`, () => continueGraph(i2v, { video: 'prova.mp4', prompt: PROMPT, seed: 1, seconds: 10, guide: false }), level, null]);
  }
  for (const [label, make, level, variant] of cases) {
    let graph;
    try { graph = make(); applyVideoStack(graph, { level, needs: ALL, files: loras, variant }); } catch (e) { bad(`${label}: il grafo non si costruisce (${e.message})`); continue; }
    const problems = checkGraph(graph, info);
    if (!problems.length) ok(`${label} (${Object.keys(graph).length} nodi)`);
    else { bad(`${label}:`); for (const p of problems) console.log(`        - ${p}`); }
  }

  console.log(errors
    ? `\n${errors} problemi: vedi piano/verifica-video.md («Se la verifica trova problemi»). I nomi giusti degli input sono quelli tra parentesi.`
    : '\nTutto a posto: ComfyUI accetterà i grafi dei video. Prova tecnica: node tools/verifica-video.js --genera <video.mp4>');
  process.exit(errors ? 1 : 0);
}

async function genera(file) {
  if (!file || !fs.existsSync(file)) { console.log(`Video non trovato: ${file || '(manca il percorso)'}`); process.exit(1); }
  const seconds = Number(opt('--secondi', 3));
  const level = opt('--filtro', 'neutral');
  const has = await comfy.hasNodes([...CONTINUE_NODES, GUIDE_NODE]);
  const missing = CONTINUE_NODES.filter((n) => !has[n]);
  if (missing.length) { console.log(`Mancano i nodi: ${missing.join(', ')}. Aggiorna ComfyUI.`); process.exit(1); }
  const guide = has[GUIDE_NODE] && !args.includes('--senza-guida');
  const prompt = opt('--prompt', 'For the target video, the shot continues exactly from the last moments of the previous video.\n\nintegrated_multimodal_description: [Shot 1] The same scene continues with no cut: the same person, clothes, place and light. She keeps moving naturally, turns her head slowly and smiles at the camera. The camera stays still.\n\noverall_soundscape: the same room tone as before, soft breathing.\n\nnon_diegetic_music: N/A');
  console.log(`Carico ${file} su ComfyUI…`);
  const video = await comfy.uploadImage(fs.readFileSync(file), `chatbz_prova_${path.basename(file)}`);
  const i2v = workflow('minimax-h3-i2v');
  const graph = continueGraph(i2v, { video, prompt, seed: Math.floor(Math.random() * 1e9), seconds, guide });
  const res = applyVideoStack(graph, { level, needs: { woman: true }, files: await comfy.listModels('loras').catch(() => null) });
  console.log(`Continua di ${seconds} s, ${guide ? `guida: ultimi ${OVERLAP} fotogrammi e audio` : 'dall\'ultimo fotogramma'}, ${continueFrames(seconds, guide)} fotogrammi da generare, filtro ${level}, LoRA: ${res.loras.map((l) => `${l.label} ${l.strength}`).join(', ') || 'quelle del workflow'}`);
  const t0 = Date.now();
  let last = '';
  const out = await comfy.run(graph, {
    onEvent: (e) => {
      const line = e.type === 'progress' ? `  passo ${e.value}/${e.max}` : e.type === 'node' ? `  ${e.title}` : '';
      if (line && line !== last) { last = line; process.stdout.write(`${line}\n`); }
    },
  });
  const f = out.files.find((x) => /\.(mp4|webm|mov)$/i.test(x.filename)) || out.files[0];
  if (!f) { console.log('ComfyUI non ha restituito il video'); process.exit(1); }
  const dir = path.join(config.paths.data, 'prova-video');
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `continua-${guide ? 'guida' : 'fotogramma'}-${Date.now()}${path.extname(f.filename)}`);
  fs.writeFileSync(dest, await comfy.fetchFile(f));
  console.log(`\nFatto in ${Math.round((Date.now() - t0) / 1000)} s: ${dest}`);
  console.log(`Deve durare quanto il video di partenza più ${seconds} s. Guarda il punto di giunzione: niente salto, niente fotogrammi ripetuti, audio continuo.`);
  process.exit(0);
}

if (args.includes('--genera')) genera(opt('--genera')).catch((e) => { console.log(`Errore: ${e.message}`); process.exit(1); });
else verifica().catch((e) => { console.log(`Errore: ${e.message}`); process.exit(1); });
