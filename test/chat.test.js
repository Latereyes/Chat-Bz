import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractTag } from '../src/chat.js';

test('strumento scritto come funzione Python: foto con «who», testo ripulito', () => {
  const text = 'Eccoci qui! 😊\nsend_photo(who="both", description="A selfie of Hitomi and Alessia together on a terrace (Milan at night)")\nTi piace?';
  const r = extractTag(text);
  assert.equal(r.call.function.name, 'send_photo');
  assert.deepEqual(r.call.function.arguments, { who: 'both', description: 'A selfie of Hitomi and Alessia together on a terrace (Milan at night)' });
  assert.ok(!/send_photo/.test(r.text));
  assert.match(r.text, /Ti piace\?/);
});

test('strumento scritto come testo: forme già note restano', () => {
  assert.equal(extractTag('<tool_call> send_photo{description="a selfie at the beach"} </tool_call>').call.function.arguments.description, 'a selfie at the beach');
  const r = extractTag('Ok. update_scene(presence="together")');
  assert.ok(!r.call);
  assert.equal(r.text, 'Ok.');
});

test('chat a due: parla per primo chi viene chiamato col nome, il soprannome o il cognome', async () => {
  const { turnPlan, nameAliases } = await import('../src/group.js');
  const lex = { id: 'l', card: { name: "Alessandra 'Lex' Moretti" } };
  const ale = { id: 'a', card: { name: 'Alessia Moretti' } };
  const zola = { id: 'z', card: { name: 'Zola Mbeki' } };
  assert.deepEqual(nameAliases("Alessandra 'Lex' Moretti"), ["alessandra 'lex' moretti", 'lex', 'alessandra', 'moretti']);
  const first = (members, text) => turnPlan(members, text, { random: () => 0.5 }).first;
  assert.equal(first([lex, zola], 'Zola, che stavi facendo?'), 'z');
  assert.equal(first([zola, lex], 'Lex, sei d\'accordo con lei?'), 'l');
  assert.equal(first([zola, lex], 'E tu, Mbeki?'), 'z');
  // stesso cognome: «Moretti» non dice chi, il nome sì
  assert.equal(first([lex, ale], 'E tu Alessia?'), 'a');
  assert.equal(first([ale, lex], 'Alessandra, tocca a te'), 'l');
});
