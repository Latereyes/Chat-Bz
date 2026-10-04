import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import config from './config.js';
import { db, tx } from './db.js';
import { normalizeCard } from './characters.js';
import { initialState } from './relationship.js';

/**
 * Una "conversazione" è la relazione con un personaggio: una sola cronologia continua per personaggio.
 * L'oggetto in memoria { id, ownerId, card, avatar, state, messages } è la fonte di verità mentre il
 * server gira; save() scrive su SQLite solo ciò che è cambiato.
 */
const cache = new Map();          // characterId -> conv
const written = new Map();        // messageId -> JSON salvato (per scrivere solo i messaggi cambiati)
const seqs = new Map();           // messageId -> posizione salvata (resta stabile anche dopo un'eliminazione)
let writtenState = new Map();     // characterId -> JSON dello stato salvato

export const newId = () => randomUUID();
const validId = (id) => /^[a-zA-Z0-9-]{8,64}$/.test(id || '');

const q = {
  listOwner: db.prepare('SELECT id FROM characters WHERE owner_id = ? ORDER BY updated_at DESC'),
  listAll: db.prepare('SELECT id FROM characters'),
  char: db.prepare('SELECT * FROM characters WHERE id = ?'),
  state: db.prepare('SELECT state FROM character_state WHERE character_id = ?'),
  messages: db.prepare('SELECT data, seq FROM messages WHERE character_id = ? ORDER BY seq'),
  insertChar: db.prepare('INSERT INTO characters (id, owner_id, card, avatar, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'),
  updateChar: db.prepare('UPDATE characters SET card = ?, avatar = ?, updated_at = ? WHERE id = ?'),
  upsertState: db.prepare(`INSERT INTO character_state (character_id, state, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(character_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`),
  upsertMsg: db.prepare(`INSERT INTO messages (id, character_id, seq, data, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET seq = excluded.seq, data = excluded.data`),
  deleteMsg: db.prepare('DELETE FROM messages WHERE id = ?'),
  deleteChar: db.prepare('DELETE FROM characters WHERE id = ?'),
};

function load(id) {
  const row = q.char.get(id);
  if (!row) return null;
  const st = q.state.get(id);
  const card = normalizeCard(JSON.parse(row.card));
  const conv = {
    id: row.id,
    ownerId: row.owner_id,
    card,
    avatar: row.avatar || null,
    state: st ? JSON.parse(st.state) : initialState(card),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages: [],
  };
  for (const r of q.messages.all(id)) {
    const m = JSON.parse(r.data);
    conv.messages.push(m);
    written.set(m.id, r.data);
    seqs.set(m.id, r.seq);
  }
  writtenState.set(id, JSON.stringify(conv.state));
  return conv;
}

export function get(id) {
  if (!validId(id)) return null;
  if (cache.has(id)) return cache.get(id);
  const c = load(id);
  if (c) cache.set(id, c);
  return c;
}

/** Personaggi di un utente (tutti se ownerId non è indicato), dal più recente. */
export function list(ownerId) {
  const rows = ownerId ? q.listOwner.all(ownerId) : q.listAll.all();
  return rows.map((r) => get(r.id)).filter(Boolean)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function create(ownerId, card) {
  const now = Date.now();
  const c = { id: newId(), ownerId, card: normalizeCard(card), avatar: null, createdAt: now, updatedAt: now, messages: [] };
  c.state = initialState(c.card);
  q.insertChar.run(c.id, ownerId, JSON.stringify(c.card), null, now, now);
  q.upsertState.run(c.id, JSON.stringify(c.state), now);
  writtenState.set(c.id, JSON.stringify(c.state));
  cache.set(c.id, c);
  return c;
}

/**
 * Salva scheda, stato e i messaggi cambiati. Restituisce una Promise (compatibile con il codice di LocalAI),
 * ma la scrittura su SQLite è sincrona e immediata.
 */
export function save(c, { touch = true } = {}) {
  if (touch) c.updatedAt = Date.now();
  try {
    tx(() => {
      q.updateChar.run(JSON.stringify(c.card), c.avatar, c.updatedAt, c.id);
      const st = JSON.stringify(c.state);
      if (writtenState.get(c.id) !== st) { q.upsertState.run(c.id, st, Date.now()); writtenState.set(c.id, st); }
      let last = -1;
      for (const m of c.messages) {
        let moved = false;
        if (!seqs.has(m.id) || seqs.get(m.id) <= last) { seqs.set(m.id, last + 1); moved = true; }
        last = seqs.get(m.id);
        const json = JSON.stringify(m);
        if (!moved && written.get(m.id) === json) continue;
        q.upsertMsg.run(m.id, c.id, last, json, m.createdAt || Date.now());
        written.set(m.id, json);
      }
    });
  } catch (e) {
    console.error('[store] save', e.message);
  }
  return Promise.resolve();
}

/** Elimina dei messaggi (e i loro file). */
export async function removeMessages(c, ids) {
  const set = new Set(ids);
  const gone = c.messages.filter((m) => set.has(m.id));
  c.messages = c.messages.filter((m) => !set.has(m.id));
  tx(() => { for (const id of set) { q.deleteMsg.run(id); written.delete(id); seqs.delete(id); } });
  await removeFiles(gone);
  save(c);
}

async function removeFiles(messages) {
  for (const m of messages) {
    for (const md of m.media || []) if (md.file) await fs.rm(path.join(config.paths.media, md.file), { force: true });
    for (const a of m.attachments || []) if (a.file) await fs.rm(path.join(config.paths.media, a.file), { force: true });
  }
}

export async function remove(id) {
  const c = get(id);
  if (!c) return;
  cache.delete(id);
  q.deleteChar.run(id);   // a cascata: stato, messaggi, memorie
  for (const m of c.messages) { written.delete(m.id); seqs.delete(m.id); }
  writtenState.delete(id);
  await removeFiles(c.messages);
  if (c.avatar) await fs.rm(path.join(config.paths.media, c.avatar), { force: true });
}

/** Tutti i media generati per un utente, dal più recente. */
export function allMedia(ownerId) {
  const out = [];
  for (const c of list(ownerId)) {
    for (const m of c.messages) for (const md of m.media || []) {
      if (md.status === 'done' && md.file) out.push({ ...md, conversationId: c.id, conversationTitle: c.card.name });
    }
  }
  return out.sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
}
