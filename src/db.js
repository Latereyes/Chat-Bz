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

  -- Studio immagini (l'assistente immagini di ChatBz 1): una cronologia per utente, fuori dai personaggi
  CREATE TABLE IF NOT EXISTS studio_messages (
    id           TEXT PRIMARY KEY,
    owner_id     TEXT NOT NULL,
    seq          INTEGER NOT NULL,
    data         TEXT NOT NULL,           -- messaggio completo (JSON)
    created_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_studio_owner ON studio_messages(owner_id, seq);

  -- Coda persistente "a goccia": contenuti generati un po' alla volta quando la GPU è libera.
  -- Sopravvive ai riavvii: un lavoro rimasto a metà torna in attesa e riparte.
  CREATE TABLE IF NOT EXISTS queue_jobs (
    id           TEXT PRIMARY KEY,
    owner_id     TEXT NOT NULL,
    character_id TEXT,
    kind         TEXT NOT NULL,           -- post.plan | post.image | social.comment | social.like
    gpu          TEXT NOT NULL,           -- ollama | comfy | none
    priority     INTEGER NOT NULL,        -- più basso = prima
    status       TEXT NOT NULL,           -- pending | running | done | error
    payload      TEXT NOT NULL,           -- JSON
    label        TEXT,
    run_after    INTEGER NOT NULL,
    attempts     INTEGER NOT NULL DEFAULT 0,
    error        TEXT,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_jobs(status, priority, run_after);

  -- Social: profilo pubblico del personaggio (nome utente, bio, il suo "mondo" ricorrente per foto coerenti)
  CREATE TABLE IF NOT EXISTS social_profiles (
    character_id TEXT PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    username     TEXT NOT NULL,
    bio          TEXT NOT NULL DEFAULT '',
    world        TEXT NOT NULL DEFAULT '{}',   -- JSON: casa, persone, posti, oggetti ricorrenti
    updated_at   INTEGER NOT NULL
  );

  -- Post (carosello di foto) e storie (una foto, 24 ore)
  CREATE TABLE IF NOT EXISTS posts (
    id           TEXT PRIMARY KEY,
    owner_id     TEXT NOT NULL,
    character_id TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL,           -- post | story
    status       TEXT NOT NULL,           -- planned | generating | published | error
    caption      TEXT NOT NULL DEFAULT '',
    location     TEXT NOT NULL DEFAULT '',
    media        TEXT NOT NULL DEFAULT '[]',  -- JSON: le foto, come i media della chat
    requested    INTEGER NOT NULL DEFAULT 0,  -- chiesto dall'utente (fuori dal limite per accensione)
    seen_at      INTEGER,                 -- storie: viste dall'utente
    error        TEXT,
    created_at   INTEGER NOT NULL,
    published_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_posts_owner ON posts(owner_id, status, published_at);
  CREATE INDEX IF NOT EXISTS idx_posts_char ON posts(character_id, kind, published_at);

  -- Mi piace: dell'utente (liker = 'user') o di un personaggio (liker = id del personaggio)
  CREATE TABLE IF NOT EXISTS post_likes (
    post_id      TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    liker        TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    PRIMARY KEY (post_id, liker)
  );

  -- Commenti: dell'utente (character_id NULL) o di un personaggio; reply_to per le risposte
  CREATE TABLE IF NOT EXISTS post_comments (
    id           TEXT PRIMARY KEY,
    post_id      TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    character_id TEXT REFERENCES characters(id) ON DELETE CASCADE,
    reply_to     TEXT,
    content      TEXT NOT NULL,
    liked_by_author INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id, created_at);

  -- Come si conoscono due personaggi (scritto la prima volta che interagiscono, poi riusato)
  CREATE TABLE IF NOT EXISTS character_bonds (
    a            TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    b            TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    note         TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    PRIMARY KEY (a, b)
  );

  -- Impostazioni social per utente (pausa della coda)
  CREATE TABLE IF NOT EXISTS social_settings (
    owner_id     TEXT PRIMARY KEY,
    paused       INTEGER NOT NULL DEFAULT 0
  );
`);

/** Esegue fn in una transazione. */
export function tx(fn) {
  db.exec('BEGIN');
  try { const out = fn(); db.exec('COMMIT'); return out; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
