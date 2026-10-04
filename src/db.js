import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import config from './config.js';

/**
 * Database SQLite (modulo integrato in Node 22, nessuna dipendenza da compilare).
 * I campi strutturati (scheda del personaggio, stato, media di un messaggio) sono JSON in colonne TEXT.
 */
fs.mkdirSync(config.paths.data, { recursive: true });
fs.mkdirSync(config.paths.media, { recursive: true });

export const db = new DatabaseSync(config.paths.db);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS characters (
    id          TEXT PRIMARY KEY,
    owner_id    TEXT NOT NULL,
    card        TEXT NOT NULL,            -- scheda (JSON)
    avatar      TEXT,                     -- file in data/media
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_characters_owner ON characters(owner_id, updated_at);

  -- Stato vivo del personaggio: scena, rapporto, umore, riassunto, pensieri per la prossima volta
  CREATE TABLE IF NOT EXISTS character_state (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    state        TEXT NOT NULL,           -- JSON
    updated_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id           TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    seq          INTEGER NOT NULL,
    data         TEXT NOT NULL,           -- messaggio completo (JSON)
    created_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_char ON messages(character_id, seq);

  -- Memorie: fatti sull'utente, momenti importanti, promesse, battute interne, evoluzione
  CREATE TABLE IF NOT EXISTS memories (
    id           TEXT PRIMARY KEY,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL,           -- fact | moment | promise | joke | evolution
    content      TEXT NOT NULL,
    weight       INTEGER NOT NULL DEFAULT 3,
    created_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_memories_char ON memories(character_id, kind, created_at);
`);

/** Esegue fn in una transazione. */
export function tx(fn) {
  db.exec('BEGIN');
  try { const out = fn(); db.exec('COMMIT'); return out; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
