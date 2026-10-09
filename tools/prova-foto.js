// Banco di prova delle foto dei personaggi: stessi scenari, stesse regole della chat, risultati uno accanto all'altro.
//
//   node tools/prova-foto.js --solo-richieste        filtro, motivo, richiesta a Gemma e LoRA (senza modelli, gira ovunque)
//   node tools/prova-foto.js --prompt                + il prompt scritto da Gemma (serve Ollama)
//   node tools/prova-foto.js --foto                  + le foto (Ollama e ComfyUI): data/prove-foto/<data>/index.html
//
// Opzioni:
//   --scenari esplicito-pov-prima,handjob   solo questi (id o numeri, vedi l'elenco con --elenco)
//   --varianti base,realism-v2              varianti delle LoRA di Krea 2 da confrontare (src/krea2.js, default: base)
//                                           «tutte» = tutte le varianti; ogni variante usa lo stesso prompt e lo stesso seed
//   --seed 1234                             seed fisso (default: uno a caso per scenario, uguale tra le varianti)
//   --modello gemma4-12b-uncensored:latest  modello di Ollama per i prompt
//   --zimage                                anche tre scenari su Z-Image (resta grezzo)
//   --elenco                                elenca scenari e varianti ed esce
import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../src/config.js';
import * as comfy from '../src/comfy.js';
import { gpu } from '../src/gpu.js';
import { loadWorkflows, checkAvailability, getWorkflow, buildGraph, dimensions, randomSeed } from '../src/workflows.js';
import { engineerPhoto, applyPhotoStack, finishPrompt, LEVEL_LABEL } from '../src/photo.js';
import { bodyLoras, withDerived, installedLoras, bodyFamily, lenovoLora, comfyLoras } from '../src/body.js';
import { LORAS, VARIANTS, profileFor } from '../src/krea2.js';
import { SCENARIOS, ZIMAGE_SCENARIOS, USER, CHARACTERS, scenarioState, scenarioMessages } from './prova-foto/scenari.js';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const has = (name) => args.includes(`--${name}`);
const mode = has('foto') ? 'foto' : has('prompt') ? 'prompt' : 'richieste';
const model = opt('modello') || config.ollama.model;

if (has('elenco')) {
  console.log('Scenari:');
  SCENARIOS.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s.id.padEnd(20)} ${s.title}`));
  console.log('\nVarianti (src/krea2.js):');
  for (const [id, v] of Object.entries(VARIANTS)) console.log(`  ${id.padEnd(20)} ${v.label}`);
  process.exit(0);
}

const pick = opt('scenari')?.split(',').map((s) => s.trim()).filter(Boolean);
let list = SCENARIOS.filter((s, i) => !pick || pick.includes(s.id) || pick.includes(String(i + 1)));
if (has('zimage')) list = [...list, ...SCENARIOS.filter((s) => ZIMAGE_SCENARIOS.includes(s.id) && (!pick || pick.includes(s.id))).map((s) => ({ ...s, id: `${s.id}-zimage`, title: `${s.title} (Z-Image)`, char: 'zimage' }))];
const variantIds = opt('varianti') === 'tutte' ? Object.keys(VARIANTS) : (opt('varianti') || 'base').split(',').map((v) => v.trim());
for (const v of variantIds) if (!VARIANTS[v]) { console.error(`Variante sconosciuta: ${v} (vedi --elenco)`); process.exit(1); }
if (!list.length) { console.error('Nessuno scenario (vedi --elenco)'); process.exit(1); }

// Con --foto valgono i workflow installati su ComfyUI; senza, tutti (i grafi servono solo a mostrare le LoRA)
const all = loadWorkflows();
if (mode === 'foto') await checkAvailability(comfy.listModels);
else for (const w of all) w.available = true;
const INSTANT = { krea: 'krea2-real', zimage: 'zimage-turbo' };
const line = (t = '') => console.log(t);
const indent = (t, n = 4) => String(t).split('\n').map((l) => ' '.repeat(n) + l).join('\n');

// In --solo-richieste le LoRA si mostrano come se fossero tutte installate
const allFiles = [...Object.values(LORAS).map((l) => l.file), 'lenovo_krea2.safetensors', ...Object.values(CHARACTERS).map((c) => c.lora?.file).filter(Boolean)];
const files = mode === 'foto' ? await comfyLoras() : allFiles;
if (mode === 'foto' && !files) { console.error(`ComfyUI non raggiungibile su ${config.comfy.url}`); process.exit(1); }

/** Grafo di una foto con la variante: come renderMedia in jobs.js. */
async function graphFor(w, card, md, variant) {
  // variante senza HMNSFW: niente token in testa al prompt
  const prompt = 'hmnsfw' in profileFor(md.level, variant).loras ? md.prompt : finishPrompt(md.prompt, {});
  const graph = buildGraph(w, { prompt, seed: md.seed, width: md.width, height: md.height });
  const family = bodyFamily(graph);
  if (!family) return { graph, info: {} };
  const lenovo = typeof md.lenovo === 'boolean' ? md.lenovo : null;
  const body = mode === 'foto'
    ? await installedLoras(withDerived(bodyLoras(card, family)), family)
    : withDerived(bodyLoras(card, family)).map((l) => ({ ...l, name: `corpo-${l.part}.safetensors` }));
  const info = applyPhotoStack(graph, {
    level: md.level, lenovo, lenovoFile: lenovo ? (mode === 'foto' ? await lenovoLora(family) : 'lenovo_krea2.safetensors') : null,
    bodyLoras: body, charLora: md.charLora ? card.lora : null, prompt, files, variant, stack: true, sampler: true,
  });
  return { graph, info: { ...info, prompt } };
}

const loraText = (info) => [
  ...(info.loras || []).map((l) => `${l.label} ${l.strength}`),
  info.lenovo ? 'Lenovo' : null,
  ...(info.body || []).map((b) => `corpo:${b.part} ${b.strength}`),
].filter(Boolean).join(', ') || '(nessuna)';

const results = [];
for (const sc of list) {
  const { card, state } = scenarioState(sc);
  const { messages, idx, userText, reply } = scenarioMessages(sc);
  const w = getWorkflow(INSTANT[card.style], 'image');
  if (w?.id !== INSTANT[card.style]) { console.error(`Workflow ${INSTANT[card.style]} non disponibile su ComfyUI${w?.missing?.length ? `: mancano ${w.missing.join(', ')}` : ''}`); process.exit(1); }
  const md = { description: sc.description, aspect: '3:4', ...dimensions(w, '3:4'), seed: Number(opt('seed')) || randomSeed(), args: {} };
  // il prompt si scrive una volta (con la prima variante: decide se servono i token HMNSFW) e vale per tutte
  const r = await (mode === 'richieste'
    ? engineerPhoto({ workflow: w, card, state, media: md, messages, idx, userText, reply, user: USER, variant: variantIds[0], dryRun: true })
    : gpu.run('ollama', `Prompt ${sc.id}`, () => engineerPhoto({ workflow: w, card, state, media: md, messages, idx, userText, reply, user: USER, model, variant: variantIds[0] })));
  Object.assign(md, { prompt: r.prompt, level: r.level, levelReason: r.reason, hm: r.hm, charLora: r.charLora, lenovo: r.lenovo });

  line(`\n━━ ${sc.id}: ${sc.title}`);
  line(`  Motore:  ${w.name}`);
  line(`  Filtro:  ${LEVEL_LABEL[r.level]} (${r.reason})${sc.expect?.level && sc.expect.level !== r.level ? `   ⚠ atteso ${LEVEL_LABEL[sc.expect.level]}` : ''}`);
  if (r.hm) line(`  HMNSFW:  ${r.hm.position}${r.hm.angle ? `, ANGLE_${r.hm.angle}` : ''}${r.hm.cum ? ' (finale)' : ''}`);
  if (mode === 'richieste') line(`  Richiesta a Gemma:\n${indent(r.request)}`);
  else line(`  Prompt (${r.prompt.split(/\s+/).length} parole):\n${indent(r.prompt)}`);

  const row = { sc, r, md, w, shots: [] };
  for (const variant of variantIds) {
    const { graph, info } = await graphFor(w, card, md, variant);
    line(`  [${variant}] LoRA: ${loraText(info)}${info.sampler ? ` · sampler ${info.sampler.steps} passi ${info.sampler.scheduler} cfg ${info.sampler.cfg}` : ''}${info.missing?.length ? ` · mancano: ${info.missing.join(', ')}` : ''}`);
    const shot = { variant, info, file: null, error: null, seconds: 0 };
    if (mode === 'foto') {
      const t0 = Date.now();
      try {
        const { files: out } = await gpu.run('comfy', `Foto ${sc.id} / ${variant}`, () => comfy.run(graph));
        const f = out.find((x) => /\.(png|jpe?g|webp)$/i.test(x.filename)) || out[0];
        if (!f) throw new Error('ComfyUI non ha restituito alcun file');
        shot.file = `${sc.id}--${variant}${path.extname(f.filename).toLowerCase()}`;
        shot.buf = await comfy.fetchFile(f);
      } catch (e) { shot.error = e.message; line(`    ✗ ${e.message}`); }
      shot.seconds = Math.round((Date.now() - t0) / 1000);
    }
    row.shots.push(shot);
  }
  results.push(row);
}

if (mode === 'foto') {
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const dir = path.join(config.paths.data, 'prove-foto', stamp);
  await fs.mkdir(dir, { recursive: true });
  for (const row of results) for (const s of row.shots) if (s.buf) await fs.writeFile(path.join(dir, s.file), s.buf);
  await fs.writeFile(path.join(dir, 'index.html'), page(results, stamp));
  await fs.writeFile(path.join(dir, 'risultati.json'), JSON.stringify(results.map(({ sc, r, md, shots }) => ({ scenario: sc.id, level: r.level, reason: r.reason, hm: r.hm, prompt: md.prompt, seed: md.seed, lenovo: md.lenovo, shots: shots.map(({ buf, ...s }) => s) })), null, 2));
  line(`\nFatto: ${path.join(dir, 'index.html')}`);
}
process.exit(0);

function page(rows, stamp) {
  const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const head = variantIds.map((v) => `<th>${esc(v)}<small>${esc(VARIANTS[v].label)}</small></th>`).join('');
  const body = rows.map(({ sc, r, md, w, shots }) => `
    <tr><td class="info">
      <b>${esc(sc.title)}</b>
      <div>${esc(w.name)} · seed ${md.seed}</div>
      <div class="lv lv-${r.level}">${esc(LEVEL_LABEL[r.level])} · ${esc(r.reason)}${sc.expect?.level && sc.expect.level !== r.level ? ' · ⚠ atteso ' + esc(LEVEL_LABEL[sc.expect.level]) : ''}</div>
      ${r.hm ? `<div>HMNSFW ${esc(r.hm.position)}${r.hm.angle ? ` · ANGLE_${esc(r.hm.angle)}` : ''}</div>` : ''}
      <details><summary>Prompt</summary><pre>${esc(md.prompt)}</pre></details>
      <details><summary>Conversazione</summary><pre>${esc(sc.messages.map((m) => `${m.role === 'user' ? 'Tu' : CHARACTERS[sc.char].name}: ${m.content}`).join('\n'))}</pre></details>
    </td>${shots.map((s) => `<td>${s.file ? `<a href="${esc(s.file)}" target="_blank"><img src="${esc(s.file)}" loading="lazy"></a>` : `<div class="err">${esc(s.error || '—')}</div>`}
      <small>${esc(loraText(s.info))}${s.info.sampler ? ` · ${s.info.sampler.steps} passi ${esc(s.info.sampler.scheduler)} cfg ${s.info.sampler.cfg}` : ''}${s.seconds ? ` · ${s.seconds} s` : ''}</small></td>`).join('')}</tr>`).join('');
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Prove foto ${stamp}</title>
<style>
:root { color-scheme: light dark; --bg: #faf9f7; --fg: #1d1c1a; --muted: #6b6a66; --line: #e4e2dd; }
@media (prefers-color-scheme: dark) { :root { --bg: #1b1b1a; --fg: #ececea; --muted: #a3a29d; --line: #333230; } }
body { margin: 0; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.4 system-ui, sans-serif; }
h1 { font-size: 18px; margin: 0 0 12px; }
.wrap { overflow-x: auto; }
table { border-collapse: collapse; }
th, td { border-bottom: 1px solid var(--line); padding: 10px; vertical-align: top; text-align: left; }
th small, td small { display: block; color: var(--muted); font-weight: normal; margin-top: 4px; max-width: 320px; }
td.info { width: 300px; min-width: 240px; }
td.info div { color: var(--muted); margin-top: 4px; }
.lv-explicit { color: #c0392b !important; } .lv-sensual { color: #b9770e !important; }
img { width: 320px; max-width: 70vw; border-radius: 6px; display: block; }
pre { white-space: pre-wrap; font-size: 12px; color: var(--muted); max-width: 300px; }
.err { width: 320px; height: 120px; display: grid; place-items: center; color: var(--muted); border: 1px dashed var(--line); border-radius: 6px; }
</style></head><body>
<h1>Prove foto · ${esc(stamp)} · ${esc(model)}</h1>
<div class="wrap"><table><thead><tr><th>Scenario</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
</body></html>`;
}
