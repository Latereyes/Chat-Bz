/**
 * Fa mandare qualche foto ai personaggi di prova (tools/personaggi-prova.js) con la pipeline vera:
 * messaggio dell'utente con il pulsante «Foto» → risposta di Gemma → prompt engineer → ComfyUI.
 * La prima foto di ogni personaggio diventa l'immagine del profilo.
 *
 *   node tools/foto-prova.js [giri]      (default: 2 foto a personaggio)
 *
 * Va lanciato con il server spento: usa lo stesso database e la stessa GPU.
 */
import fs from 'node:fs';
import path from 'node:path';
import config from '../src/config.js';
import * as store from '../src/store.js';
import * as chat from '../src/chat.js';
import * as comfy from '../src/comfy.js';
import { checkAvailability } from '../src/workflows.js';

const RICHIESTE = [
  'Fammi vedere dove sei adesso 📸',
  'Mandami una foto di qualcosa che stai facendo oggi',
  'Un selfie per me?',
];

const giri = Math.max(1, Number(process.argv[2]) || 2);
const ids = JSON.parse(fs.readFileSync(path.join(config.paths.data, 'personaggi-prova.json'), 'utf8'));
const convs = ids.map((id) => store.get(id)).filter(Boolean);

await checkAvailability(comfy.listModels);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const busy = (c) => chat.isRunning(c.id)
  || c.messages.some((m) => (m.media || []).some((md) => ['engineering', 'queued', 'running'].includes(md.status)));

for (let g = 0; g < giri; g++) {
  console.log(`\n— Giro ${g + 1} di ${giri}`);
  // tutte le risposte partono insieme: la coda GPU fa prima i testi (Gemma) e poi le foto (ComfyUI)
  for (const c of convs) {
    try { await chat.send(c, { text: RICHIESTE[g % RICHIESTE.length], tool: 'photo' }); }
    catch (e) { console.warn(`  ${c.card.name}: ${e.message}`); }
  }
  const t0 = Date.now();
  while (convs.some(busy)) {
    await sleep(5000);
    const done = convs.filter((c) => !busy(c)).length;
    process.stdout.write(`\r  ${done}/${convs.length} pronti · ${Math.round((Date.now() - t0) / 1000)}s   `);
  }
}

console.log('\n');
for (const c of convs) {
  const media = c.messages.flatMap((m) => m.media || []);
  const ok = media.filter((m) => m.status === 'done').length;
  const err = media.filter((m) => m.status === 'error').map((m) => m.error);
  console.log(`${c.card.name}: ${ok} foto${err.length ? ` · errori: ${err.join('; ')}` : ''}${c.avatar ? '' : ' · senza profilo'}`);
  store.save(c, { touch: false });
}
process.exit(0);
