import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// social.js apre il database: una cartella dati usa e getta, impostata prima di caricare config.js
// (per questo i moduli dell'app si caricano dopo, con import dinamico)
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'chatbz-test-'));
const { normalizeCard } = await import('../src/characters.js');
const { hotLevel } = await import('../src/social.js');
const config = (await import('../src/config.js')).default;
assert.ok(config.paths.data.startsWith(os.tmpdir()), 'i test non devono toccare data/');

const card = (o) => normalizeCard({ name: 'X', age: 30, ...o });

test('post osé: mai con intimità «mai» o «Post osé: Mai»', () => {
  assert.equal(card({ intimacy: 'mai' }).socialHot, 'mai');
  for (const r of [0, 0.05, 0.5]) {
    assert.equal(hotLevel(card({ intimacy: 'mai' }), { random: r }), 'neutral');
    assert.equal(hotLevel(card({ intimacy: 'aperta', socialHot: 'mai' }), { random: r }), 'neutral');
  }
});

test('post osé: ogni tanto, esplicito solo con l\'intimità aperta e mai con un amico', () => {
  const open = card({ intimacy: 'aperta', socialHot: 'ognitanto' });
  const conf = card({ intimacy: 'confidenza', socialHot: 'ognitanto' });
  assert.equal(hotLevel(open, { random: 0.01 }), 'explicit');
  assert.equal(hotLevel(open, { random: 0.15 }), 'sensual');
  assert.equal(hotLevel(open, { random: 0.9 }), 'neutral');
  assert.equal(hotLevel(conf, { random: 0.01 }), 'sensual');
  assert.equal(hotLevel(open, { random: 0.01, together: true }), 'sensual');
});

test('post osé: un\'idea chiesta decide, entro i limiti', () => {
  assert.equal(hotLevel(card({ intimacy: 'aperta' }), { hint: 'un selfie nuda allo specchio', random: 0.9 }), 'explicit');
  assert.equal(hotLevel(card({ intimacy: 'confidenza' }), { hint: 'un selfie nuda allo specchio', random: 0.9 }), 'sensual');
  assert.equal(hotLevel(card({ intimacy: 'aperta' }), { hint: 'foto in bikini al mare', random: 0.9 }), 'sensual');
});

test('foto insieme nei post: nomi e posizioni, così vestiti e volti non si scambiano', async () => {
  const { socialPhotoRequest } = await import('../src/social-prompts.js');
  const a = card({ name: 'Alessia', look: 'Italian woman' }), b = card({ name: 'Hitomi', look: 'Japanese woman' });
  const r = socialPhotoRequest({ card: a, friend: b, photo: { subject: 'both', description: 'selfie al bar' }, media: { width: 768, height: 1024, mode: 'text2img' }, kind: 'post', level: 'neutral' });
  assert.match(r, /Person 1 = Alessia, on the LEFT/);
  assert.match(r, /Person 2 = Hitomi, on the RIGHT/);
  assert.match(r, /never write them in the prompt/);
});
