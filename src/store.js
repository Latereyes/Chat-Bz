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
  studioMessages: db.prepare('SELECT data, seq FROM studio_messages WHERE owner_id = ? ORDER BY seq'),
  studioOwners: db.prepare('SELECT DISTINCT owner_id FROM studio_messages'),
  upsertStudioMsg: db.prepare(`INSERT INTO studio_messages (id, owner_id, seq, data, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET seq = excluded.seq, data = excluded.data`),
  deleteStudioMsg: db.prepare('DELETE FROM studio_messages WHERE id = ?'),
  group: db.prepare('SELECT * FROM groups WHERE id = ?'),
  groupsOwner: db.prepare('SELECT id FROM groups WHERE owner_id = ? ORDER BY updated_at DESC'),
  groupsAll: db.prepare('SELECT id, members FROM groups'),
  groupMessages: db.prepare('SELECT data, seq FROM group_messages WHERE group_id = ? ORDER BY seq'),
  insertGroup: db.prepare('INSERT INTO groups (id, owner_id, name, members, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  updateGroup: db.prepare('UPDATE groups SET name = ?, members = ?, state = ?, updated_at = ? WHERE id = ?'),
  upsertGroupMsg: db.prepare(`INSERT INTO group_messages (id, group_id, seq, data, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET seq = excluded.seq, data = excluded.data`),
  deleteGroupMsg: db.prepare('DELETE FROM group_messages WHERE id = ?'),
  deleteGroup: db.prepare('DELETE FROM groups WHERE id = ?'),
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
  const c = isGroupId(id) ? loadGroup(id) : load(id);
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
      if (c.group) q.updateGroup.run(c.card.name, JSON.stringify(c.members), JSON.stringify(c.state), c.updatedAt, c.id);
      else if (!c.studio) {
        q.updateChar.run(JSON.stringify(c.card), c.avatar, c.updatedAt, c.id);
        const st = JSON.stringify(c.state);
        if (writtenState.get(c.id) !== st) { q.upsertState.run(c.id, st, Date.now()); writtenState.set(c.id, st); }
      }
      const upsert = c.studio ? q.upsertStudioMsg : c.group ? q.upsertGroupMsg : q.upsertMsg;
      const owner = c.studio ? c.ownerId : c.id;
      let last = -1;
      for (const m of c.messages) {
        let moved = false;
        if (!seqs.has(m.id) || seqs.get(m.id) <= last) { seqs.set(m.id, last + 1); moved = true; }
        last = seqs.get(m.id);
        const json = JSON.stringify(m);
        if (!moved && written.get(m.id) === json) continue;
        upsert.run(m.id, owner, last, json, m.createdAt || Date.now());
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
  const del = c.studio ? q.deleteStudioMsg : c.group ? q.deleteGroupMsg : q.deleteMsg;
  tx(() => { for (const id of set) { del.run(id); written.delete(id); seqs.delete(id); } });
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
  // eliminando un personaggio spariscono anche le chat a due in cui c'era
  if (!c.group) for (const g of q.groupsAll.all()) if (JSON.parse(g.members).includes(id)) await remove(g.id);
  cache.delete(id);
  if (c.group) q.deleteGroup.run(id);   // a cascata: messaggi
  else q.deleteChar.run(id);   // a cascata: stato, messaggi, memorie
  for (const m of c.messages) { written.delete(m.id); seqs.delete(m.id); }
  writtenState.delete(id);
  await removeFiles(c.messages);
  if (c.avatar) await fs.rm(path.join(config.paths.media, c.avatar), { force: true });
}

/**
 * Chat a due: tu e due personaggi nella stessa conversazione. Ha la forma di una conversazione (così coda GPU,
 * eventi, salvataggio e interfaccia sono quelli dei personaggi): card.name è il nome della chat, members gli id
 * dei due personaggi, state.scene la scena condivisa. Il rapporto e l'intimità restano quelli di ciascuno.
 */
export const isGroupId = (id) => String(id || '').startsWith('g-');

function loadGroup(id) {
  const row = q.group.get(id);
  if (!row) return null;
  const c = { id: row.id, ownerId: row.owner_id, group: true, members: JSON.parse(row.members), card: { name: row.name }, avatar: null,
    state: JSON.parse(row.state), createdAt: row.created_at, updatedAt: row.updated_at, messages: [] };
  for (const r of q.groupMessages.all(id)) {
    const m = JSON.parse(r.data);
    c.messages.push(m);
    written.set(m.id, r.data);
    seqs.set(m.id, r.seq);
  }
  return c;
}

export function listGroups(ownerId) {
  const rows = ownerId ? q.groupsOwner.all(ownerId) : q.groupsAll.all();
  return rows.map((r) => get(r.id)).filter(Boolean);
}

/** Nuova chat a due con due personaggi dell'utente. */
export function createGroup(ownerId, members, { name, scene } = {}) {
  const now = Date.now();
  const c = { id: `g-${newId()}`, ownerId, group: true, members, card: { name: String(name || '').trim().slice(0, 60) || 'Chat a due' }, avatar: null,
    state: { scene: { presence: 'apart', place: '', activity: '', outfit: '', mood: '', intimacy: 'none', since: now, ...(scene || {}) } },
    createdAt: now, updatedAt: now, messages: [] };
  q.insertGroup.run(c.id, ownerId, c.card.name, JSON.stringify(members), JSON.stringify(c.state), now, now);
  cache.set(c.id, c);
  return c;
}

/**
 * Studio immagini di un utente: stessa forma di una conversazione (così coda GPU, eventi e salvataggio
 * sono quelli dei personaggi), ma senza scheda, rapporto né memorie.
 */
const studios = new Map();        // ownerId -> conv dello studio
export const studioId = (ownerId) => `studio-${ownerId}`;

export function getStudio(ownerId) {
  if (studios.has(ownerId)) return studios.get(ownerId);
  const c = { id: studioId(ownerId), ownerId, studio: true, card: { name: 'Studio immagini' }, avatar: null, state: {}, messages: [] };
  for (const r of q.studioMessages.all(ownerId)) {
    const m = JSON.parse(r.data);
    c.messages.push(m);
    written.set(m.id, r.data);
    seqs.set(m.id, r.seq);
  }
  c.updatedAt = c.messages.at(-1)?.createdAt || 0;
  studios.set(ownerId, c);
  return c;
}

/** Studi con almeno un messaggio (per il recupero dei lavori interrotti all'avvio). */
export const listStudios = () => q.studioOwners.all().map((r) => getStudio(r.owner_id));

/** Tutti i media generati per un utente, dal più recente. */
export function allMedia(ownerId) {
  const out = [];
  for (const c of ownerId ? [...list(ownerId), ...listGroups(ownerId), getStudio(ownerId)] : list()) {
    for (const m of c.messages) for (const md of m.media || []) {
      if (md.status === 'done' && md.file) out.push({ ...md, conversationId: c.id, conversationTitle: c.card.name });
    }
  }
  return out.sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
}
