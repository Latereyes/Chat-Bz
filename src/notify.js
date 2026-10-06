import { db } from './db.js';
import { emit, mediaUrl } from './jobs.js';
import * as store from './store.js';

/**
 * Notifiche in-app (la campanella): nuovi post dei personaggi, foto insieme, risposte ai tuoi commenti,
 * qualcuno che si unisce a una conversazione dove hai scritto, cosa hanno fatto mentre il server era spento.
 * Arrivano in tempo reale sul canale social dell'utente; se la pagina è in background il browser può
 * mostrarle anche come notifiche di sistema.
 */
const q = {
  insert: db.prepare(`INSERT INTO notifications (id, owner_id, kind, character_id, post_id, comment_id, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
  list: db.prepare(`SELECT * FROM notifications WHERE owner_id = ? ORDER BY created_at DESC LIMIT ?`),
  unread: db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE owner_id = ? AND read_at IS NULL`),
  readAll: db.prepare(`UPDATE notifications SET read_at = ? WHERE owner_id = ? AND read_at IS NULL`),
  readOne: db.prepare(`UPDATE notifications SET read_at = ? WHERE owner_id = ? AND id = ? AND read_at IS NULL`),
  readPost: db.prepare(`UPDATE notifications SET read_at = ? WHERE owner_id = ? AND post_id = ? AND read_at IS NULL`),
  old: db.prepare(`DELETE FROM notifications WHERE created_at < ?`),
};

const channel = (ownerId) => `social-${ownerId}`;   // lo stesso di queue.channel (qui senza dipendenze circolari)

function view(r) {
  const c = r.character_id ? store.get(r.character_id) : null;
  return {
    id: r.id, kind: r.kind, text: r.text, createdAt: r.created_at, read: !!r.read_at,
    postId: r.post_id, commentId: r.comment_id,
    character: c ? { id: c.id, name: c.card.name, avatarUrl: mediaUrl(c.avatar) } : null,
  };
}

export const unread = (ownerId) => q.unread.get(ownerId).n;

export function add(ownerId, { kind, characterId = null, postId = null, commentId = null, text }) {
  const id = store.newId();
  q.insert.run(id, ownerId, kind, characterId, postId, commentId, String(text).slice(0, 300), Date.now());
  const r = db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
  emit(channel(ownerId), { type: 'social', what: 'notification', notification: view(r), unread: unread(ownerId) });
  return id;
}

export function list(ownerId, limit = 60) {
  return { unread: unread(ownerId), items: q.list.all(ownerId, limit).map(view) };
}

/** Segna come lette: tutte, una sola, o quelle di un post (quando lo apri). */
export function markRead(ownerId, { id, postId } = {}) {
  const now = Date.now();
  if (id) q.readOne.run(now, ownerId, id);
  else if (postId) q.readPost.run(now, ownerId, postId);
  else q.readAll.run(now, ownerId);
  emit(channel(ownerId), { type: 'social', what: 'unread', unread: unread(ownerId) });
  return unread(ownerId);
}

/** Le notifiche più vecchie di un mese spariscono da sole. */
export function prune() { q.old.run(Date.now() - 30 * 86400 * 1000); }
