import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LORAS, VARIANTS, profileFor, videoNeeds, leadPrompt, applyVideoStack, videoRules } from '../src/minimax.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const graph = (id) => JSON.parse(fs.readFileSync(path.join(root, 'workflows', id, 'workflow.json'), 'utf8'));
const I2V = graph('minimax-h3-i2v');
const FILES = Object.values(LORAS).map((l) => l.file);
const loras = (g) => Object.values(g).filter((n) => n.class_type === 'LoraLoaderModelOnly').map((n) => [n.inputs.lora_name, n.inputs.strength_model]);
const has = (g, file) => loras(g).some(([f]) => f === file);
const guiderModel = (g) => Object.values(g).find((n) => n.class_type === 'BasicGuider').inputs.model[0];

test('video normale: grafo come prima (niente LoRA nuove senza motivo)', () => {
  const g = structuredClone(I2V);
  const out = applyVideoStack(g, { level: 'neutral', needs: videoNeeds('she turns her head and smiles', { level: 'neutral' }), files: FILES });
  assert.deepEqual(loras(g), loras(I2V));
  assert.equal(out.steps, null);
});

test('bacio: la LoRA del bacio solo quando c\'è un bacio', () => {
  const g = structuredClone(I2V);
  applyVideoStack(g, { level: 'neutral', needs: videoNeeds('they kiss softly', { level: 'neutral' }), files: FILES });
  assert.ok(has(g, LORAS.kiss.file));
});

test('esplicito con un uomo: HMNSFW, seno, vulva, pene, turbo 0.5 e 6 passi, catena collegata', () => {
  const needs = videoNeeds('POV, she rides him, his erect penis inside her pussy, her breasts bounce', { level: 'explicit', woman: true });
  assert.deepEqual([needs.penis, needs.vulva, needs.direction], [true, true, 'front']);
  const g = structuredClone(I2V);
  const out = applyVideoStack(g, { level: 'explicit', needs, files: FILES });
  for (const k of ['hmnsfw', 'breast', 'vagina', 'hmpussy', 'penis']) assert.ok(has(g, LORAS[k].file), k);
  assert.equal(loras(g).find(([f]) => f === LORAS.hmpussy.file)[1], 0.35);
  assert.deepEqual(out.missing, []);
  assert.equal(loras(g).find(([f]) => f === LORAS.turbo.file)[1], 0.5);
  assert.equal(Object.values(g).find((n) => n.class_type === 'BasicScheduler').inputs.steps, 6);
  // guider e scheduler usano la fine della catena, e ogni LoRA porta a un nodo che esiste
  const end = guiderModel(g);
  assert.equal(g[end].class_type, 'LoraLoaderModelOnly');
  assert.equal(Object.values(g).find((n) => n.class_type === 'BasicScheduler').inputs.model[0], end);
  for (const n of Object.values(g)) if (Array.isArray(n.inputs?.model)) assert.ok(g[n.inputs.model[0]], n.inputs.model[0]);
});

test('esplicito senza uomo: niente LoRA del pene; uomo da solo: niente seno', () => {
  const g = structuredClone(I2V);
  applyVideoStack(g, { level: 'explicit', needs: videoNeeds('she touches herself, naked on the bed', { level: 'explicit', woman: true }), files: FILES });
  assert.ok(!has(g, LORAS.penis.file));
  const m = structuredClone(I2V);
  applyVideoStack(m, { level: 'explicit', needs: videoNeeds('he strokes his cock', { level: 'explicit', woman: false }), files: FILES });
  assert.ok(!has(m, LORAS.breast.file));
  assert.ok(has(m, LORAS.penis.file));
});

test('HMPenis in testa alla descrizione, dopo la riga di allineamento', () => {
  const needs = { penis: true, direction: 'back' };
  const p = 'For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.\n\nintegrated_multimodal_description: [Shot 1] Cinematic live-action...';
  const out = leadPrompt(p, needs);
  assert.match(out, /^For the target video/);
  assert.match(out, /integrated_multimodal_description: HMPenis, back view\. \[Shot 1\]/);
  assert.equal(leadPrompt(out, needs), out);   // non lo ripete
  assert.equal(leadPrompt('A woman dances.', {}), 'A woman dances.');
  assert.match(videoRules('explicit', needs), /HMPenis, back view/);
  assert.equal(videoRules('neutral', needs), null);
});

test('varianti video: valide; shift 6 aggiunge il nodo dello shift', () => {
  for (const id of Object.keys(VARIANTS)) for (const level of ['neutral', 'sensual', 'explicit']) for (const k of Object.keys(profileFor(level, id).loras)) assert.ok(LORAS[k], `${id}/${level}/${k}`);
  const g = structuredClone(I2V);
  const out = applyVideoStack(g, { level: 'explicit', needs: {}, files: FILES, variant: 'hmnsfw-shift6' });
  assert.equal(out.shift, 6);
  assert.equal(g[guiderModel(g)].class_type, 'MiniMaxH3SigmaShift');
  assert.equal(g[guiderModel(g)].inputs.shift_video, 6);
  const s = structuredClone(I2V);
  applyVideoStack(s, { level: 'explicit', needs: { woman: true }, files: FILES, variant: 'senza-nuove' });
  assert.deepEqual(loras(s), loras(I2V));
});
