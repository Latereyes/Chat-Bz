import { db } from './db.js';
import * as ollama from './ollama.js';
import * as store from './store.js';
import config from './config.js';
import { reflectionPrompt } from './prompts.js';
import { promptProfile } from './auth.js';
import { applyDelta } from './relationship.js';

/**
 * Memoria del personaggio e riflessione a riposo.
 * Niente di questo gira durante la chat: si aggiorna quando la conversazione è ferma (vedi life.js),
 * così la GPU è tutta per la risposta.
 */
const q = {
  list: db.prepare('SELECT * FROM memories WHERE character_id = ? ORDER BY created_at'),
  insert: db.prepare('INSERT INTO memories (id, character_id, kind, content, weight, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  remove: db.prepare('DELETE FROM memories WHERE id = ? AND character_id = ?'),
  clear: db.prepare('DELETE FROM memories WHERE character_id = ?'),
};

const KINDS = new Set(['fact', 'moment', 'promise', 'joke', 'evolution']);

export const list = (characterId) => q.list.all(characterId);
export const remove = (characterId, id) => q.remove.run(id, characterId);
export const clear = (characterId) => q.clear.run(characterId);

export function add(characterId, kind, content, weight = 3) {
  const text = String(content || '').trim().slice(0, 400);
  if (!text || !KINDS.has(kind)) return;
  q.insert.run(store.newId(), characterId, kind, text, Math.max(1, Math.min(5, Math.round(Number(weight) || 3))), Date.now());
}

/** Memorie da mettere nel prompt: le più importanti e le più recenti, entro un limite. */
export function forPrompt(characterId, max = 14) {
  const all = list(characterId);
  const evo = all.filter((m) => m.kind === 'evolution').slice(-3);
  const rest = all.filter((m) => m.kind !== 'evolution');
  const now = Date.now();
  const score = (m) => m.weight * 2 + Math.max(0, 6 - (now - m.created_at) / 86400000); // peso + freschezza (giorni)
  const top = [...rest].sort((a, b) => score(b) - score(a)).slice(0, max);
  top.sort((a, b) => a.created_at - b.created_at);
  return [...top, ...evo];
}

/** Trascrizione leggibile dei messaggi non ancora "ripensati". */
function transcript(conv, fromIndex) {
  return conv.messages.slice(fromIndex)
    .filter((m) => m.status !== 'pending' && m.status !== 'streaming')
    .map((m) => {
      const media = (m.media || []).filter((x) => x.status === 'done').map((x) => `[${x.type === 'video' ? 'video' : 'photo'}: ${x.description}]`).join(' ');
      const atts = (m.attachments || []).map((a) => `[photo: ${a.description || 'image'}]`).join(' ');
      const who = m.role === 'user' ? 'User' : conv.card.name;
      return `${who}: ${[m.content, media, atts].filter(Boolean).join(' ')}`.slice(0, 1500);
    })
    .join('\n');
}

export function needsReflection(conv) {
  const done = conv.messages.filter((m) => m.status !== 'pending' && m.status !== 'streaming').length;
  return done - (conv.state.lastReflectedCount || 0) >= config.reflect.minMessages;
}

/** Il personaggio ripensa agli ultimi messaggi: rapporto, umore, memorie, pensieri, riassunto. */
export async function reflect(conv, { model } = {}) {
  const from = Math.max(0, Math.min(conv.state.lastReflectedCount || 0, conv.messages.length));
  const count = conv.messages.length;
  const text = transcript(conv, Math.max(from - 4, 0));   // un po' di contesto prima dei messaggi nuovi
  if (!text.trim()) return null;
  const out = await ollama.complete({
    model: model || config.ollama.model,
    format: 'json',
    timeout: 180000,
    options: { temperature: 0.4, num_predict: 900 },
    messages: reflectionPrompt({ card: conv.card, state: conv.state, transcript: text.slice(-24000), memories: list(conv.id), user: promptProfile(conv.ownerId) }),
  });
  let j;
  try { j = JSON.parse(out); } catch { throw new Error('riflessione non valida'); }

  const st = conv.state;
  st.rel = applyDelta(st.rel, j.relationship_delta);
  if (j.relationship_note) st.relNote = String(j.relationship_note).slice(0, 400);
  if (j.mood) st.scene = { ...st.scene, mood: String(j.mood).slice(0, 80) };
  if (j.summary) st.summary = String(j.summary).slice(0, 2500);
  st.hooks = (Array.isArray(j.hooks) ? j.hooks : []).map((h) => String(h).slice(0, 200)).filter(Boolean).slice(0, 3);
  for (const m of Array.isArray(j.new_memories) ? j.new_memories.slice(0, 6) : []) add(conv.id, m?.kind, m?.content, m?.weight);
  if (j.evolution && String(j.evolution).trim()) add(conv.id, 'evolution', j.evolution, 4);
  st.lastReflectedCount = count;
  st.lastReflectedAt = Date.now();
  store.save(conv, { touch: false });
  return j;
}
