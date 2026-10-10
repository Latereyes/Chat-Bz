#!/usr/bin/env node
/**
 * Banco di prova dei video MiniMax H3 (image to video, come in chat): stessa foto, stesso prompt e stesso seed,
 * cambia una cosa alla volta (passi, turbo, risoluzione, LoRA, durata). Serve a trovare il punto giusto tra tempo di
 * generazione e qualità, che qui vuol dire soprattutto niente artefatti nelle zone in movimento (mani, capelli).
 *
 *   node tools/prova-video.js --foto data/media/<id>/<foto>.png [--varianti base,passi12,…] [--secondi 5] [--seed 42]
 *     [--filtro neutral|sensual|explicit] [--uomo] [--nome marco] [--prompt "…"]
 *
 * Le varianti sono quelle qui sotto (passi, turbo, risoluzione) oppure quelle del menu «LoRA e passi video» dello Studio
 * (src/minimax.js: senza-hmnsfw, hmnsfw-12, senza-genitali, senza-seno, senza-nuove…). Le LoRA «quando servono»
 * (seno, Vagina, Penis V2, bacio) si agganciano come in chat, da cosa dice il prompt: con --filtro explicit e senza
 * --prompt si usa una scena esplicita di prova (cowgirl POV) che le aggancia tutte.
 *
 * I video vanno in data/prova-video/banco/[<nome>-]<variante>[-<filtro>]-<secondi>s.mp4, i tempi in data/prova-video/banco/tempi.json.
 * Con l'agent del PC acceso chiede il permesso della GPU (priorità bassa: chi usa ChatBz passa prima); senza agent
 * lancialo con ChatBz fermo, la GPU è una sola.
 */
import fs from 'node:fs';
import path from 'node:path';
import config from '../src/config.js';
import * as comfy from '../src/comfy.js';
import { loadWorkflows, buildGraph } from '../src/workflows.js';
import { applyVideoStack, videoNeeds, leadPrompt, VARIANTS as VIDEO_VARIANTS } from '../src/minimax.js';
import * as agent from '../src/gpu-agent.js';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };

// Una cosa alla volta rispetto al workflow (0,7 MP, 6 passi, turbo 1, VBVR 0.8, Unlocked 0.6, Mystic 0.6; fino al 2026-10-10 0,4 MP e 8 passi)
export const VARIANTS = {
  base: {},
  vecchio: { mp: 0.4, steps: 8 },   // come prima del 2026-10-10
  passi6: { steps: 6 },
  passi10: { steps: 10 },
  passi12: { steps: 12 },
  'turbo07-12': { turbo: 0.7, steps: 12 },
  mp03: { mp: 0.3 },
  mp055: { mp: 0.55 },
  mp07: { mp: 0.7 },
  mp085: { mp: 0.85 },
  'mp07-passi6': { mp: 0.7, steps: 6 },
  'mp055-passi6': { mp: 0.55, steps: 6 },
  'vbvr0': { loras: { vbvr: 0 } },
  'vbvr05': { loras: { vbvr: 0.5 } },
  'vbvr1': { loras: { vbvr: 1 } },
  'senza-unlocked-mystic': { loras: { unlocked: 0, mystic: 0 } },
};

const FILES = { vbvr: 'H3_VBVR_Pro_attn_only.safetensors', unlocked: 'Minimax_H3_Unlocked_V2.safetensors', mystic: 'MysticXXX_MMH3-V4.safetensors', turbo: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors' };

const PROMPT_EXPLICIT = `For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.

integrated_multimodal_description: [Shot 1] A candid, unretouched phone camera look, the shot begins exactly from <Picture 1>. POV, cowgirl: the naked young woman is riding the man lying under her, his erect penis inside her pussy. She moves her hips up and down in a steady rhythm, her breasts bounce with each motion, she looks down at the camera and moans. The camera stays still, from his point of view.

overall_soundscape: skin against skin, the bed creaking softly, her breathing and moans.

non_diegetic_music: N/A`;

const PROMPT = `For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.

integrated_multimodal_description: [Shot 1] A candid, unretouched phone camera look, the shot begins exactly from <Picture 1>: a young woman with long ginger hair in a braid, sitting at a cafe table. She puts the phone down on the table, looks up at the camera with a warm smile, waves hello with her right hand, then tucks a strand of hair behind her ear and laughs softly, gesturing with both hands as she talks. People move in the background. The camera is handheld and steady.

overall_soundscape: the murmur of a busy cafe, cups clinking, her soft laugh and a quiet "ciao".

non_diegetic_music: N/A`;

/** Applica la variante al grafo image to video (già con le LoRA di ChatBz per il filtro normale). */
function applyVariant(graph, v) {
  for (const n of Object.values(graph)) {
    if (n.class_type === 'BasicScheduler' && v.steps) n.inputs.steps = v.steps;
    if (n.class_type === 'ImageScaleToTotalPixels' && v.mp) n.inputs.megapixels = v.mp;
    if (n.class_type === 'LoraLoaderModelOnly') {
      const name = path.basename(String(n.inputs.lora_name).replace(/\\/g, '/'));
      if (v.turbo != null && name === FILES.turbo) n.inputs.strength_model = v.turbo;
      for (const [k, s] of Object.entries(v.loras || {})) if (name === FILES[k]) n.inputs.strength_model = s;
    }
  }
}

async function main() {
  const foto = opt('--foto');
  if (!foto || !fs.existsSync(foto)) { console.log('Serve --foto <immagine di partenza>'); process.exit(1); }
  const seconds = Number(opt('--secondi', 5));
  const seed = Number(opt('--seed', 42));
  const level = opt('--filtro', 'neutral');
  const tag = opt('--nome', '');
  const names = opt('--varianti', 'base').split(',').filter(Boolean);
  for (const n of names) if (!VARIANTS[n] && !VIDEO_VARIANTS[n]) { console.log(`Variante sconosciuta: ${n} (${[...Object.keys(VARIANTS), ...Object.keys(VIDEO_VARIANTS)].join(', ')})`); process.exit(1); }
  const w = loadWorkflows().find((x) => x.id === 'minimax-h3-i2v');
  const d = w.duration;
  let frames = Math.max(d.frameOffset, Math.round(seconds * d.fps));
  while ((frames - d.frameOffset) % d.frameStep) frames++;
  const woman = !args.includes('--uomo');
  const needs = videoNeeds(opt('--prompt', level === 'explicit' ? PROMPT_EXPLICIT : PROMPT), { level, woman });
  // come in chat: HMPenis e la direzione in testa alla descrizione quando c'è il pene
  const prompt = leadPrompt(opt('--prompt', level === 'explicit' ? PROMPT_EXPLICIT : PROMPT), needs);
  const dir = path.join(config.paths.data, 'prova-video', 'banco');
  fs.mkdirSync(dir, { recursive: true });
  const logFile = path.join(dir, 'tempi.json');
  const log = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : {};
  const image = await comfy.uploadImage(fs.readFileSync(foto), `chatbz_banco_${path.basename(foto)}`);
  const files = await comfy.listModels('loras').catch(() => null);
  for (const name of names) {
    const graph = buildGraph(w, { prompt, seed, frames, image });
    const stack = applyVideoStack(graph, { level, needs, files, variant: VARIANTS[name] ? null : name });
    if (VARIANTS[name]) applyVariant(graph, VARIANTS[name]);
    const steps = Object.values(graph).find((n) => n.class_type === 'BasicScheduler')?.inputs.steps;
    console.log(`\n${name}: ${steps} passi, LoRA ${stack.loras.map((l) => `${l.label} ${l.strength}`).join(', ') || 'del workflow'}${stack.missing.length ? ` (mancano: ${stack.missing.join(', ')})` : ''}`);
    let t0 = Date.now();
    process.stdout.write(`${name} ${seconds}s (${frames} fotogrammi)… `);
    // prova sul PC 2026-10-10: senza permesso Gemma di ChatBz si caricava insieme a MiniMax e il video ci metteva 10 minuti
    const lease = await agent.acquire({ who: 'comfy', label: `banco video ${name}`, priority: 'low' });
    let out;
    t0 = Date.now();   // il tempo conta solo la generazione, non l'attesa del permesso
    try { out = await comfy.run(graph); } finally { await lease?.release(); }
    const f = out.files.find((x) => /\.mp4$/i.test(x.filename));
    if (!f) { console.log('nessun file'); continue; }
    const key = `${tag ? `${tag}-` : ''}${name}${level !== 'neutral' ? `-${level}` : ''}-${seconds}s`;
    const dest = path.join(dir, `${key}.mp4`);
    fs.writeFileSync(dest, await comfy.fetchFile(f));
    const secs = Math.round((Date.now() - t0) / 1000);
    log[key] = { secs, frames, seed, level, variant: VARIANTS[name] || name, steps, loras: stack.loras.map((l) => `${l.label} ${l.strength}`) };
    fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
    console.log(`${secs} s → ${dest}`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
