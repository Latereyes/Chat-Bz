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
