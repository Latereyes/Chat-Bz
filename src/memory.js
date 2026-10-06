import { db, tx } from './db.js';
import * as ollama from './ollama.js';
import * as store from './store.js';
import config from './config.js';
import { reflectionPrompt, consolidationPrompt } from './prompts.js';
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
const CONSOLIDATE_OVER = 30;      // oltre tante memorie (evoluzione esclusa) si riordinano
const CONSOLIDATE_GROWTH = 12;    // e poi di nuovo ogni tanti ricordi nuovi

export const list = (characterId) => q.list.all(characterId);
export const remove = (characterId, id) => q.remove.run(id, characterId);
export const clear = (characterId) => q.clear.run(characterId);

export function add(characterId, kind, content, weight = 3) {
  const text = String(content || '').trim().slice(0, 400);
  if (!text || !KINDS.has(kind)) return;
  q.insert.run(store.newId(), characterId, kind, text, Math.max(1, Math.min(5, Math.round(Number(weight) || 3))), Date.now());
}

/** Memorie da mettere nel prompt: le più importanti e le più recenti, entro un limite. */
const COMMON = new Set('come sono anche della delle dello degli questo questa quello quella perché quando molto ancora fatto cosa tutto tutti oggi dopo prima sempre però solo hai ho stai sei siamo essere avere fare detto dire voglio vuoi puoi posso bene male allora quindi magari forse adesso proprio niente nulla qualcosa user utente'.split(' '));
const words = (t) => new Set((String(t || '').toLowerCase().match(/\p{L}{4,}/gu) || []).filter((w) => !COMMON.has(w)));
/** query: l'ultimo messaggio dell'utente; le memorie che ne condividono le parole salgono (se ne parla, se lo ricorda). */
export function forPrompt(characterId, max = 14, query = '') {
  const all = list(characterId);
  const topic = words(query);
  const evo = all.filter((m) => m.kind === 'evolution').slice(-3);
  const rest = all.filter((m) => m.kind !== 'evolution');
  const now = Date.now();
  const hits = (m) => { let n = 0; for (const w of words(m.content)) if (topic.has(w)) n++; return Math.min(n, 3); };
  const score = (m) => m.weight * 2 + Math.max(0, 6 - (now - m.created_at) / 86400000) + hits(m) * 4; // peso + freschezza (giorni) + argomento
  const top = [...rest].sort((a, b) => score(b) - score(a)).slice(0, max);
  top.sort((a, b) => a.created_at - b.created_at);
  return [...top, ...evo];
}

/** Trascrizione leggibile dei messaggi non ancora "ripensati". */
function transcript(conv, fromIndex) {
  let prevAt = conv.messages[fromIndex - 1]?.createdAt || 0;
  return conv.messages.slice(fromIndex)
    .filter((m) => m.status !== 'pending' && m.status !== 'streaming')
    .map((m) => {
      // Le pause lunghe contano per il rapporto: la riflessione deve vederle
      const gap = prevAt && m.createdAt - prevAt > 86400000 ? `[${Math.round((m.createdAt - prevAt) / 86400000)} days without talking]\n` : '';
      prevAt = m.createdAt || prevAt;
      const media = (m.media || []).filter((x) => x.status === 'done').map((x) => `[${x.type === 'video' ? 'video' : 'photo'}: ${x.description}]`).join(' ');
      const atts = (m.attachments || []).map((a) => `[photo: ${a.description || 'image'}]`).join(' ');
      const who = m.role === 'user' ? 'User' : conv.card.name;
      return `${gap}${who}: ${[m.content, media, atts].filter(Boolean).join(' ')}`.slice(0, 1500);
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
  // Un'emozione forte può finire in una storia sul social (la sceglie il social alla prossima occasione)
  if (j.story_idea && String(j.story_idea).trim()) st.storyIdea = { text: String(j.story_idea).trim().slice(0, 300), at: Date.now() };
  st.lastReflectedCount = count;
  st.lastReflectedAt = Date.now();
  store.save(conv, { touch: false });
  return j;
}

/** Le memorie sono cresciute abbastanza da meritare un riordino? */
export function needsConsolidation(conv) {
  const n = list(conv.id).filter((m) => m.kind !== 'evolution').length;
  return n > CONSOLIDATE_OVER && n - (conv.state.consolidatedCount || 0) >= CONSOLIDATE_GROWTH;
}

/**
 * Riordino: Gemma unisce doppioni e contraddizioni. Si applica solo se il risultato è credibile
 * (non svuota la memoria, ogni ricordo cita le sue fonti), altrimenti si lascia tutto com'era.
 */
export async function consolidate(conv, { model } = {}) {
  const mems = list(conv.id).filter((m) => m.kind !== 'evolution');
  const out = await ollama.complete({
    model: model || config.ollama.model, format: 'json', timeout: 180000,
    options: { temperature: 0.2, num_predict: 2500 },
    messages: consolidationPrompt({ card: conv.card, memories: mems }),
  });
  let j;
  try { j = JSON.parse(out); } catch { throw new Error('riordino delle memorie non valido'); }
  const next = (Array.isArray(j?.memories) ? j.memories : []).map((m) => {
    const from = (Array.isArray(m?.from) ? m.from : []).map(Number).filter((i) => i >= 1 && i <= mems.length).map((i) => mems[i - 1]);
    const content = String(m?.content || '').trim().slice(0, 400);
    return from.length && content ? { kind: KINDS.has(m.kind) && m.kind !== 'evolution' ? m.kind : from.at(-1).kind, content,
      weight: Math.max(1, Math.min(5, Math.round(Number(m.weight) || Math.max(...from.map((f) => f.weight))))), at: Math.max(...from.map((f) => f.created_at)) } : null;
  }).filter(Boolean);
  if (next.length < Math.ceil(mems.length * 0.4) || next.length > mems.length) {
    conv.state.consolidatedCount = mems.length;   // riprova più avanti, non a ogni giro
    store.save(conv, { touch: false });
    return null;
  }
  tx(() => {
    for (const m of mems) q.remove.run(m.id, conv.id);
    for (const m of next) q.insert.run(store.newId(), conv.id, m.kind, m.content, m.weight, m.at);
  });
  conv.state.consolidatedCount = next.length;
  store.save(conv, { touch: false });
  return { before: mems.length, after: next.length };
}
