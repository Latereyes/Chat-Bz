import config from './config.js';
import { db } from './db.js';

/**
 * Quale modello di Ollama fa quale lavoro, per utente (menu dei modelli in alto a destra).
 * Scelte di Andrea, 2026-10-11: Gemma 12B per la chat, Gemma 26B per il social (più veloce e con
 * didascalie più naturali nella prova), Qwen 27B solo per i prompt delle foto esplicite (descrizioni più ricche).
 */
export const ROLES = {
  chat: 'Chat',
  social: 'Post, storie e commenti',
  explicit: 'Prompt delle foto esplicite',
};

const q = {
  get: db.prepare('SELECT models FROM social_settings WHERE owner_id = ?'),
  set: db.prepare(`INSERT INTO social_settings (owner_id, models) VALUES (?, ?) ON CONFLICT(owner_id) DO UPDATE SET models = excluded.models`),
};

// Modelli installati (aggiornati da listModels): un modello scelto e poi cancellato torna al predefinito
let installed = null;
export function setInstalled(names) { installed = new Set(names); }
const usable = (name) => name && (!installed || installed.has(name));

/** { chat, social, explicit } → nome del modello di Ollama. */
export function of(ownerId) {
  let saved = {};
  try { saved = JSON.parse(q.get.get(ownerId)?.models || '{}'); } catch {}
  const out = {};
  for (const role of Object.keys(ROLES)) {
    out[role] = [saved[role], config.ollama.roles[role]].find(usable) || config.ollama.model;
  }
  return out;
}

export function set(ownerId, role, model) {
  if (!(role in ROLES)) throw new Error('Lavoro sconosciuto');
  if (!usable(model)) throw new Error('Modello non installato su Ollama');
  let saved = {};
  try { saved = JSON.parse(q.get.get(ownerId)?.models || '{}'); } catch {}
  q.set.run(ownerId, JSON.stringify({ ...saved, [role]: model }));
  return of(ownerId);
}
