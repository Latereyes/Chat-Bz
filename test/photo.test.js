import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { photoLevel, engineerPhoto, applyPhotoStack, hmTokens, finishPrompt, recentExchanges, normalizeCharLora, studioLevel } from '../src/photo.js';
import { LORAS, PROFILE, VARIANTS, profileFor } from '../src/krea2.js';
import { SCENARIOS, CHARACTERS, USER, scenarioState, scenarioMessages } from '../tools/prova-foto/scenari.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wf = (id) => ({ id, type: 'image', guide: '', graph: JSON.parse(fs.readFileSync(path.join(root, 'workflows', id, 'workflow.json'), 'utf8')) });
const KREA = wf('krea2-real');
const ZIMAGE = wf('zimage-turbo');
// Tutte le LoRA del catalogo "installate", più Lenovo e quella di Hitomi
const FILES = [...Object.values(LORAS).map((l) => l.file), 'lenovo_krea2.safetensors', 'Krea220Hitomi.safetensors'];
const loraNames = (g) => Object.values(g).filter((n) => n.class_type === 'LoraLoaderModelOnly').map((n) => n.inputs.lora_name);
const strength = (g, file) => Object.values(g).find((n) => n.class_type === 'LoraLoaderModelOnly' && n.inputs.lora_name === file)?.inputs.strength_model;
const media = { description: 'x', width: 768, height: 1024 };

for (const sc of SCENARIOS) {
  test(`scenario ${sc.id}: filtro e token`, async () => {
    const { card, state } = scenarioState(sc);
    const { messages, idx, userText, reply } = scenarioMessages(sc);
    const r = await engineerPhoto({ workflow: KREA, card, state, media: { ...media, description: sc.description }, messages, idx, userText, reply, user: USER, dryRun: true });
    assert.equal(r.level, sc.expect.level, r.reason);
    if ('hm' in sc.expect) assert.deepEqual(r.hm && { position: r.hm.position, angle: r.hm.angle }, sc.expect.hm);
    assert.equal(r.charLora, !!sc.expect.trigger);
  });
}

test('tetto chiuso: dice cosa sarebbe stata', () => {
  const sc = SCENARIOS.find((s) => s.id === 'tetto-chiuso');
  const { card, state } = scenarioState(sc);
  const r = photoLevel({ card, state, userText: sc.messages[0].content });
  assert.equal(r.level, 'neutral');
  assert.match(r.reason, /^tetto/);
  assert.match(r.reason, /esplicito/);
});

test('in esplicito Gemma vede gli ultimi 3 scambi, in normale solo il messaggio', async () => {
  const sc = SCENARIOS.find((s) => s.id === 'esplicito-pov-prima');
  const { card, state } = scenarioState(sc);
  const { messages, idx, userText, reply } = scenarioMessages(sc);
  const r = await engineerPhoto({ workflow: KREA, card, state, media, messages, idx, userText, reply, user: USER, dryRun: true });
  assert.match(r.request, /cavalchi/);
  assert.match(r.request, /PHOTO RULES \(explicit\)/);
  assert.doesNotMatch(r.request, /PHOTO RULES \(normal\)/);
  const n = SCENARIOS.find((s) => s.id === 'normale-bar');
  const ns = scenarioState(n), nm = scenarioMessages(n);
  const rn = await engineerPhoto({ workflow: KREA, ...ns, media, ...nm, user: USER, dryRun: true });
  assert.match(rn.request, /mandami un selfie/);
  assert.doesNotMatch(rn.request, /eccomi/);   // la risposta in normale non serve
});

test('riserva testuale: la descrizione non ripete il messaggio', async () => {
  const sc = SCENARIOS.find((s) => s.id === 'sensuale-intimo');
  const { card, state } = scenarioState(sc);
  const { messages, idx, userText, reply } = scenarioMessages(sc);
  const r = await engineerPhoto({ workflow: KREA, card, state, media: { ...media, description: `${userText}\n\n(reply: ${reply})` }, messages, idx, userText, reply, user: USER, fromText: true, dryRun: true });
  assert.equal(r.request.split('fammi vedere').length - 1, 1);
});

test('Z-Image resta grezzo: niente Lenovo, niente etichetta del look', async () => {
  const sc = SCENARIOS.find((s) => s.id === 'normale-bar');
  const { card, state } = scenarioState({ ...sc, char: 'zimage' });
  const r = await engineerPhoto({ workflow: ZIMAGE, card, state, media, ...scenarioMessages(sc), user: USER, dryRun: true });
  assert.equal(r.lenovo, null);
  assert.doesNotMatch(r.request, /\[look:/);
  for (const level of ['neutral', 'explicit']) {
    const g = structuredClone(ZIMAGE.graph);
    const out = applyPhotoStack(g, { level, lenovo: true, lenovoFile: 'lenovo_z.safetensors', bodyLoras: [{ part: 'breast', name: 'b.safetensors', strength: 1.5 }], charLora: { file: 'Krea220Hitomi.safetensors', strength: 1 }, files: FILES });
    assert.equal(out.lenovo, false);
    assert.deepEqual(loraNames(g), []);
  }
});

test('Krea: Lenovo sì/no, realismo del profilo, anti-rifiuto solo in esplicito', () => {
  for (const level of ['neutral', 'sensual', 'explicit']) {
    const g = structuredClone(KREA.graph);
    const out = applyPhotoStack(g, { level, lenovo: true, files: FILES, prompt: 'a photo' });
    assert.equal(out.lenovo, true);
    assert.ok(loraNames(g).includes('lenovo_krea2.safetensors'));
    assert.equal(loraNames(g).includes(LORAS.refusal.file), level === 'explicit', level);
    assert.equal(strength(g, LORAS.realism31.file), PROFILE[level].loras.realism31);
    assert.equal(loraNames(g).includes(LORAS.hmnsfw.file), false);   // senza token HMNSFW nel prompt
  }
  const off = structuredClone(KREA.graph);
  applyPhotoStack(off, { level: 'neutral', lenovo: false, files: FILES });
  assert.ok(!loraNames(off).includes('lenovo_krea2.safetensors'));
});

test('Krea esplicito: HMNSFW solo con i token, sampler e corpo scalato', () => {
  const g = structuredClone(KREA.graph);
  const out = applyPhotoStack(g, { level: 'explicit', lenovo: true, files: FILES, prompt: 'HMNSFW cowgirl, ANGLE_POV_ABOVE, a woman', bodyLoras: [{ part: 'breast', name: 'breast.safetensors', strength: 1.5 }] });
  assert.ok(loraNames(g).includes(LORAS.hmnsfw.file));
  assert.equal(strength(g, 'breast.safetensors'), 1.2);
  assert.deepEqual(out.sampler, { steps: 12, scheduler: 'beta', cfg: 1 });
  // la catena resta collegata: il KSampler usa l'ultimo nodo e ogni LoRA ha un modello esistente
  for (const n of Object.values(g)) if (Array.isArray(n.inputs?.model)) assert.ok(g[n.inputs.model[0]], `nodo ${n.inputs.model[0]} mancante`);
  const used = new Set(Object.values(g).map((n) => Array.isArray(n.inputs?.model) && String(n.inputs.model[0])).filter(Boolean));
  assert.equal(Object.keys(g).filter((id) => g[id].class_type === 'LoraLoaderModelOnly' && !used.has(id)).length, 0, 'una LoRA non porta da nessuna parte');
});

test('variante Realism V2: sostituisce la 3.1; se non è installata resta la 3.1', () => {
  const g = structuredClone(KREA.graph);
  applyPhotoStack(g, { level: 'explicit', files: FILES, variant: 'realism-v2' });
  assert.equal(strength(g, LORAS.realismV2.file), 1.5);
  assert.ok(!loraNames(g).includes(LORAS.realism31.file));
  const g2 = structuredClone(KREA.graph);
  const out = applyPhotoStack(g2, { level: 'neutral', files: FILES.filter((f) => f !== LORAS.realismV2.file), variant: 'realism-v2' });
  assert.ok(loraNames(g2).includes(LORAS.realism31.file));
  assert.ok(out.missing.includes(LORAS.realismV2.file));
  assert.deepEqual(out.loras.map((l) => l.key), ['realism31']);
});

test('LoRA del personaggio: agganciata e parola chiave in testa (dopo i token HMNSFW)', () => {
  const g = structuredClone(KREA.graph);
  const out = applyPhotoStack(g, { level: 'neutral', files: FILES, charLora: CHARACTERS.hitomi.lora });
  assert.ok(loraNames(g).includes('Krea220Hitomi.safetensors'));
  assert.ok(out.loras.some((l) => l.key === 'character'));
  assert.equal(finishPrompt('a woman at her desk', { trigger: 'H1t0m1' }), 'H1t0m1, a woman at her desk');
  assert.equal(finishPrompt('HMNSFW doggy, a woman', { hm: { position: 'cowgirl', angle: 'POV_ABOVE' }, trigger: 'H1t0m1' }), 'HMNSFW cowgirl, ANGLE_POV_ABOVE, H1t0m1, a woman');
  assert.equal(normalizeCharLora({ file: '../x.safetensors' }), null);
  assert.deepEqual(normalizeCharLora({ file: 'Krea220Hitomi.safetensors', trigger: 'H1t0m1', strength: '0.8' }), { file: 'Krea220Hitomi.safetensors', trigger: 'H1t0m1', strength: 0.8 });
});

test('LoRA non installate: si saltano senza rompere il grafo', () => {
  const g = structuredClone(KREA.graph);
  const out = applyPhotoStack(g, { level: 'explicit', lenovo: true, files: ['lenovo_krea2.safetensors'], prompt: 'HMNSFW cowgirl, a woman' });
  assert.ok(out.missing.includes(LORAS.mystic.file));
  assert.ok(loraNames(g).includes(LORAS.realism31.file));   // quella del workflow resta
});

test('HMNSFW: posizione, anal, angolo, terza persona', () => {
  assert.deepEqual(hmTokens(['girati, ti voglio a pecorina nel culo']), { position: 'doggy_anal', angle: 'BEHIND', cum: false });
  assert.deepEqual(hmTokens(['cavalcami di lato']), { position: 'cowgirl', angle: 'SIDE_PROFILE', cum: false });
  assert.deepEqual(hmTokens(['missionario'], { together: false }), { position: 'missionary', angle: null, cum: false });
  assert.equal(hmTokens(['una foto in terza persona, missionario']).angle, null);
  assert.equal(hmTokens(['ciao come stai']), null);
});

test('Studio: filtro dalla richiesta, senza tetto', () => {
  assert.equal(studioLevel('donna nuda sul letto').level, 'explicit');
  assert.equal(studioLevel('ragazza in bikini in spiaggia').level, 'sensual');
  assert.equal(studioLevel('un gatto su un divano').level, 'neutral');
});

test('scambi recenti: in ordine, con le risposte unite', () => {
  const ms = [{ role: 'assistant', content: 'ciao' }, { role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'assistant', content: 'c' }, { role: 'user', content: 'd' }, { role: 'assistant', content: 'e' }];
  assert.deepEqual(recentExchanges(ms, 5, 2), [{ user: 'a', reply: 'b\nc' }, { user: 'd', reply: 'e' }]);
});

test('varianti: tutte valide sul catalogo', () => {
  for (const [id, v] of Object.entries(VARIANTS)) {
    for (const level of ['neutral', 'sensual', 'explicit']) {
      for (const key of Object.keys(profileFor(level, id).loras)) assert.ok(LORAS[key], `${id}/${level}: ${key}`);
    }
    assert.ok(v.label);
  }
});

test('foto con due personaggi: vale il tetto più basso, LoRA di tutti e due più leggere', async () => {
  const open = CHARACTERS.hitomi, closed = CHARACTERS.chiusa;
  const sc = SCENARIOS.find((s) => s.id === 'esplicito-pov-prima');
  const sOpen = scenarioState({ ...sc, char: 'hitomi' }).state, sClosed = scenarioState({ ...sc, char: 'chiusa' }).state;
  const { duoLevel, engineerDuoPhoto } = await import('../src/photo.js');
  const lv = duoLevel({ cards: [open, closed], states: [sOpen, sClosed], scene: sOpen.scene, userText: 'una foto nuda di voi due' });
  assert.equal(lv.level, 'neutral');
  assert.match(lv.reason, /^Elena: tetto/);
  const two = { ...CHARACTERS.krea, lora: { file: 'Sara.safetensors', trigger: 'S4r4', strength: 1 } };
  const r = await engineerDuoPhoto({ workflow: KREA, cards: [open, two], states: [sOpen, sOpen], scene: sOpen.scene, media, userText: 'cavalcami, una foto di voi due', user: USER, dryRun: true });
  assert.equal(r.level, 'explicit');
  // volti: ognuno ritoccato con la sua LoRA, nessuna parola chiave nella scena; LoRA insieme solo come riserva
  assert.deepEqual(r.duoFaces.map((f) => f.file), ['Krea220Hitomi.safetensors', 'Sara.safetensors']);
  assert.match(r.duoFaces[0].text, /^H1t0m1, /);
  assert.doesNotMatch(r.prompt, /H1t0m1|S4r4/);
  assert.deepEqual(r.charLoras.map((l) => l.strength), [0.8, 0.8]);
  assert.match(r.request, /Person 1 is on the LEFT/);
  assert.match(r.request, /Person 1.*\n.*Person 2|Person 2/s);
  assert.match(r.request, /two of them|both of them|viewer is with both/);
});

test('due LoRA del personaggio nello stesso grafo', () => {
  const g = structuredClone(KREA.graph);
  applyPhotoStack(g, { level: 'neutral', files: [...FILES, 'Sara.safetensors'], charLoras: [{ file: 'Krea220Hitomi.safetensors', strength: 0.8 }, { file: 'Sara.safetensors', strength: 0.8 }] });
  assert.equal(strength(g, 'Krea220Hitomi.safetensors'), 0.8);
  assert.equal(strength(g, 'Sara.safetensors'), 0.8);
});

test('foto a due: scena senza LoRA dei volti, poi un ritocco per volto da sinistra', async () => {
  const { applyDuoFaces } = await import('../src/photo.js');
  const g = structuredClone(KREA.graph);
  applyPhotoStack(g, { level: 'neutral', lenovo: true, files: FILES });
  const sampler = Object.values(g).find((n) => n.class_type === 'KSampler');
  const n = applyDuoFaces(g, [{ file: 'Krea220Hitomi.safetensors', strength: 1, text: 'H1t0m1, face' }, null], { files: FILES, seed: 5 });
  assert.equal(n, 1);
  const fix = Object.entries(g).filter(([, x]) => x.class_type === 'DetailerForEach');
  assert.equal(fix.length, 1);
  const save = Object.values(g).find((x) => x.class_type === 'SaveImage');
  assert.equal(save.inputs.images[0], fix[0][0]);
  const filter = g[fix[0][1].inputs.segs[0]];
  assert.deepEqual([filter.inputs.target, filter.inputs.order, filter.inputs.take_start], ['x1', false, 0]);
  assert.equal(g[fix[0][1].inputs.model[0]].inputs.lora_name, 'Krea220Hitomi.safetensors');
  // la scena principale non passa dalla LoRA del volto
  const chain = []; for (let id = String(sampler.inputs.model[0]); g[id]; id = String(g[id].inputs.model?.[0])) chain.push(g[id].inputs.lora_name || g[id].class_type);
  assert.ok(!chain.includes('Krea220Hitomi.safetensors'));
  assert.equal(applyDuoFaces(structuredClone(ZIMAGE.graph), [{ file: 'Krea220Hitomi.safetensors' }], { files: FILES }), 0);
});

test('foto a due con il modello delle persone: prima tutta la persona, poi il volto, con la stessa LoRA', async () => {
  const { applyDuoFaces } = await import('../src/photo.js');
  const g = structuredClone(KREA.graph);
  applyPhotoStack(g, { level: 'neutral', files: FILES });
  applyDuoFaces(g, [{ file: 'Krea220Hitomi.safetensors', text: 'H1t0m1, face', body: 'H1t0m1, body' }, null], { files: FILES, persons: true });
  const fixes = Object.entries(g).filter(([, x]) => x.class_type === 'DetailerForEach');
  assert.equal(fixes.length, 2);
  const [body, face] = fixes.map(([, x]) => x);
  assert.equal(g[body.inputs.positive[0]].inputs.text, 'H1t0m1, body');
  assert.equal(g[face.inputs.positive[0]].inputs.text, 'H1t0m1, face');
  assert.ok(body.inputs.denoise < face.inputs.denoise);
  // il volto si cerca sull'immagine già ritoccata, e la foto salvata è l'ultimo ritocco
  const faceDet = g[g[face.inputs.segs[0]].inputs.segs[0]];
  assert.equal(faceDet.inputs.image[0], fixes[0][0]);
  assert.equal(Object.values(g).find((x) => x.class_type === 'SaveImage').inputs.images[0], fixes[1][0]);
  assert.equal(body.inputs.model[0], face.inputs.model[0]);
});

test('foto singola con LoRA: ritocco del volto più grande con la stessa LoRA, espressione dal prompt', async () => {
  const { applySingleFace, expressionOf } = await import('../src/photo.js');
  const g = structuredClone(KREA.graph);
  applyPhotoStack(g, { level: 'neutral', files: FILES, charLoras: [CHARACTERS.hitomi.lora] });
  const before = Object.values(g).filter((x) => x.class_type === 'LoraLoaderModelOnly' && x.inputs.lora_name === 'Krea220Hitomi.safetensors').length;
  const prompt = 'A selfie at her desk. She is laughing with her mouth open, eyes squinting. Warm lamp light.';
  assert.equal(applySingleFace(g, CHARACTERS.hitomi, { files: FILES, prompt }), 1);
  const fix = Object.values(g).find((x) => x.class_type === 'DetailerForEach');
  const range = g[fix.inputs.segs[0]];
  assert.equal(range.class_type, 'ImpactSEGSRangeFilter');   // volti grandi lasciati com'erano
  const filter = g[range.inputs.segs[0]].inputs;
  assert.deepEqual([filter.target, filter.order], ['area(=w*h)', true]);
  // niente LoRA doppia: il ritocco usa la catena che ha già la LoRA del personaggio
  assert.equal(Object.values(g).filter((x) => x.class_type === 'LoraLoaderModelOnly' && x.inputs.lora_name === 'Krea220Hitomi.safetensors').length, before);
  const text = g[fix.inputs.positive[0]].inputs.text;
  assert.match(text, /^H1t0m1, /);
  assert.match(text, /laughing with her mouth open/);
  assert.match(text, /same facial expression/);
  assert.equal(expressionOf('A photo of a kitchen. Warm light.'), '');
  assert.equal(applySingleFace(structuredClone(KREA.graph), CHARACTERS.krea, { files: FILES }), 0);   // senza LoRA niente ritocco
});

test('ritocco del volto: minimo in esplicito', async () => {
  const { applySingleFace, applyDuoFaces } = await import('../src/photo.js');
  const den = (level) => { const g = structuredClone(KREA.graph); applySingleFace(g, CHARACTERS.hitomi, { files: FILES, level }); return Object.values(g).find((x) => x.class_type === 'DetailerForEach').inputs.denoise; };
  assert.ok(den('explicit') < den('neutral'));
  assert.ok(den('explicit') <= 0.25);
  const duo = (level) => { const g = structuredClone(KREA.graph); applyDuoFaces(g, [{ file: 'Krea220Hitomi.safetensors', text: 'x' }], { files: FILES, level }); return Object.values(g).find((x) => x.class_type === 'DetailerForEach').inputs.denoise; };
  assert.ok(duo('explicit') < duo('neutral'));
});

test('ritocco del volto: senza LoRA del corpo, NSFW e pose (deformano il primo piano), con realismo, Lenovo e personaggio', async () => {
  const { applySingleFace, applyDuoFaces } = await import('../src/photo.js');
  const { FACE_CHAIN } = await import('../src/krea2.js');
  const prompt = 'HMNSFW missionary, ANGLE_pov, a woman on a bed';
  const body = [{ part: 'breast', name: 'seno.safetensors', strength: 1 }];
  const chainOf = (g, id) => { const out = []; for (let cur = String(id); g[cur]; cur = String(g[cur].inputs.model?.[0])) out.push(g[cur].inputs.lora_name || g[cur].class_type); return out; };
  const g = structuredClone(KREA.graph);
  applyPhotoStack(g, { level: 'explicit', lenovo: true, lenovoFile: 'lenovo_krea2.safetensors', bodyLoras: body, files: FILES, prompt, charLoras: [CHARACTERS.hitomi.lora] });
  const sampler = Object.values(g).find((n) => n.class_type === 'KSampler');
  const main = chainOf(g, sampler.inputs.model[0]);
  assert.ok(main.includes('seno.safetensors') && main.includes(LORAS.mystic.file) && main.includes(LORAS.hmnsfw.file));
  assert.equal(applySingleFace(g, CHARACTERS.hitomi, { files: FILES, prompt, level: 'explicit' }), 1);
  const fix = Object.values(g).find((x) => x.class_type === 'DetailerForEach');
  const face = chainOf(g, fix.inputs.model[0]);
  for (const f of ['seno.safetensors', LORAS.mystic.file, LORAS.hmnsfw.file, LORAS.unlocked.file]) assert.ok(!face.includes(f), f);
  for (const f of ['Krea220Hitomi.safetensors', LORAS.realism31.file, 'lenovo_krea2.safetensors']) assert.ok(face.includes(f), f);
  assert.equal(face.filter((f) => f === 'Krea220Hitomi.safetensors').length, 1);
  assert.deepEqual(chainOf(g, sampler.inputs.model[0]), main);   // la foto principale non cambia
  // foto a due: stessa catena pulita sotto la LoRA di ciascuno
  const d = structuredClone(KREA.graph);
  applyPhotoStack(d, { level: 'explicit', files: FILES, prompt });
  applyDuoFaces(d, [{ file: 'Krea220Hitomi.safetensors', text: 'x' }], { files: FILES, level: 'explicit' });
  const duo = chainOf(d, Object.values(d).find((x) => x.class_type === 'DetailerForEach').inputs.model[0]);
  assert.equal(duo[0], 'Krea220Hitomi.safetensors');
  assert.ok(!duo.includes(LORAS.mystic.file));
  // full: come prima (tutta la catena), per il confronto
  FACE_CHAIN.full = true;
  try {
    const h = structuredClone(KREA.graph);
    applyPhotoStack(h, { level: 'explicit', bodyLoras: body, files: FILES, prompt, charLoras: [CHARACTERS.hitomi.lora] });
    const s = Object.values(h).find((n) => n.class_type === 'KSampler');
    applySingleFace(h, CHARACTERS.hitomi, { files: FILES, prompt, level: 'explicit' });
    assert.equal(Object.values(h).find((x) => x.class_type === 'DetailerForEach').inputs.model[0], s.inputs.model[0]);
  } finally { FACE_CHAIN.full = false; }
});

test('foto singola: un volto già grande non si ritocca (maxFace)', async () => {
  const { applySingleFace } = await import('../src/photo.js');
  const { SINGLE_FACE } = await import('../src/krea2.js');
  const g = structuredClone(KREA.graph);
  applyPhotoStack(g, { level: 'neutral', files: FILES, charLoras: [CHARACTERS.hitomi.lora] });
  assert.equal(SINGLE_FACE.maxFace, 350);
  applySingleFace(g, CHARACTERS.hitomi, { files: FILES });
  const fix = Object.values(g).find((x) => x.class_type === 'DetailerForEach');
  const range = g[fix.inputs.segs[0]];
  assert.equal(range.class_type, 'ImpactSEGSRangeFilter');
  assert.equal(range.inputs.max_value, Math.round(350 * 2.5));   // misura il ritaglio, non il volto
  assert.equal(g[range.inputs.segs[0]].class_type, 'ImpactSEGSOrderedFilter');   // prima il più grande, poi il limite
});

test('foto a due: espressione nel ritocco del volto; se si toccano niente ritocco della persona e volto più leggero', async () => {
  const { applyDuoFaces, contactOf } = await import('../src/photo.js');
  const { DUO_FACES } = await import('../src/krea2.js');
  const run = (prompt) => {
    const g = structuredClone(KREA.graph);
    applyPhotoStack(g, { level: 'neutral', files: FILES });
    applyDuoFaces(g, [{ file: 'Krea220Hitomi.safetensors', text: 'H1t0m1, face', body: 'H1t0m1, body' }, null], { files: FILES, persons: true, prompt });
    return Object.values(g).filter((x) => x.class_type === 'DetailerForEach').map((x) => ({ denoise: x.inputs.denoise, text: g[x.inputs.positive[0]].inputs.text }));
  };
  const bar = run('Two women at a bar. Both are laughing with their mouths open. Warm light.');
  assert.equal(bar.length, 2);
  assert.match(bar[1].text, /laughing with their mouths open/);
  assert.equal(bar[1].denoise, DUO_FACES.denoise);
  const kiss = run('Two women kissing on a sofa, lips touching, eyes closed.');
  assert.equal(kiss.length, 1);   // solo il volto
  assert.equal(kiss[0].denoise, DUO_FACES.contactDenoise);
  assert.match(kiss[0].text, /kissing/);
  assert.ok(!contactOf('Two women standing side by side at a bar'));
  assert.ok(!contactOf('Two women with sun-kissed skin at a bar'));   // falso positivo trovato sul PC
  for (const t of ['holding the breast of the woman on the left in her hands', 'pulling a nipple into her mouth', 'their bodies touching', 'pressed close together on the bed']) assert.ok(contactOf(t), t);
});

test('foto a due con le LoRA già nella scena: ritocco del volto più leggero', async () => {
  const { applyDuoFaces } = await import('../src/photo.js');
  const { DUO_FACES } = await import('../src/krea2.js');
  const den = (opts) => { const g = structuredClone(KREA.graph); applyPhotoStack(g, { level: 'neutral', files: FILES }); applyDuoFaces(g, [{ file: 'Krea220Hitomi.safetensors', text: 'x' }], { files: FILES, ...opts }); return Object.values(g).find((x) => x.class_type === 'DetailerForEach').inputs.denoise; };
  assert.equal(den({ scene: true }), DUO_FACES.scene.denoise);
  assert.equal(den({ scene: true, level: 'explicit' }), DUO_FACES.scene.explicitDenoise);
  assert.equal(den({ scene: true, prompt: 'Two women kissing.' }), DUO_FACES.scene.contactDenoise);
  assert.ok(den({ scene: true }) < den({}));
});

test('foto: i vestiti decisi qualche messaggio fa arrivano alla richiesta; l\'intimità non salta a «intima» da sola', async () => {
  const { outfitNotes, photoRequest } = await import('../src/photo.js');
  const { updateScene } = await import('../src/relationship.js');
  const messages = [
    { role: 'user', content: 'Stasera mettiti il vestito blu. Ci vediamo alle nove.' },
    { role: 'assistant', content: '*Sorride* Va bene, il vestito blu allora.' },
    { role: 'user', content: 'Com\'è andata la giornata?' },
    { role: 'assistant', content: 'Bene, grazie!' },
    { role: 'user', content: 'Mandami una foto' },
  ];
  const o = outfitNotes(messages, messages.length - 1);
  assert.match(o, /vestito blu/);
  assert.doesNotMatch(o, /Mandami/);
  const { card, state } = scenarioState(SCENARIOS.find((s) => s.id === 'normale-bar'));
  const req = photoRequest({ card, state, media: { description: 'x', width: 768, height: 1024 }, level: 'neutral', outfits: o });
  assert.match(req, /Clothes mentioned earlier.*vestito blu/);
  assert.match(req, /follow the conversation/);
  assert.equal(updateScene({ intimacy: 'none' }, { intimacy: 'intimate' }, { auto: true }).intimacy, 'flirt');
  assert.equal(updateScene({ intimacy: 'flirt' }, { intimacy: 'intimate' }, { auto: true }).intimacy, 'intimate');
  assert.equal(updateScene({ intimacy: 'none' }, { intimacy: 'intimate' }).intimacy, 'intimate');   // a mano sì
});
