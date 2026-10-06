import config from './config.js';
import { db } from './db.js';
import { gpu } from './gpu.js';
import { emit } from './jobs.js';
import { newId } from './store.js';

/**
 * Coda persistente "a goccia" (sostituisce la coda in memoria di ChatBz 1).
 * Ogni lavoro è una riga nel database: un riavvio non perde nulla, quello rimasto a metà riparte.
 * Si lavora un pezzo alla volta e solo quando:
 *  - la GPU è libera (la chat e le foto in chat passano sempre prima, hanno la loro coda in gpu.js)
 *  - non stai chattando da qualche secondo (DRIP_IDLE_SEC)
 *  - la coda dell'utente non è in pausa
 * Tra i lavori pronti si preferisce quello che usa il modello già in VRAM (prima i testi, poi le immagini),
 * così Gemma e ComfyUI si scambiano la GPU il meno possibile.
 * I lavori senza GPU (i "mi piace" dei personaggi) partono all'ora prevista, anche mentre chatti.
 */
export const PRIORITY = { reply: 1, requested: 2, finish: 3, plan: 4, chatter: 5 };
const MAX_ATTEMPTS = 3;

const q = {
  insert: db.prepare(`INSERT INTO queue_jobs (id, owner_id, character_id, kind, gpu, priority, status, payload, label, run_after, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`),
  due: db.prepare(`SELECT * FROM queue_jobs WHERE status = 'pending' AND run_after <= ? ORDER BY priority, run_after, created_at`),
  pendingOwner: db.prepare(`SELECT * FROM queue_jobs WHERE owner_id = ? AND status IN ('pending', 'running', 'error') ORDER BY status = 'running' DESC, priority, run_after, created_at`),
  owners: db.prepare(`SELECT DISTINCT owner_id FROM characters`),
  setRunning: db.prepare(`UPDATE queue_jobs SET status = 'running', attempts = attempts + 1, updated_at = ? WHERE id = ?`),
  setPending: db.prepare(`UPDATE queue_jobs SET status = 'pending', run_after = ?, error = ?, updated_at = ? WHERE id = ?`),
  setError: db.prepare(`UPDATE queue_jobs SET status = 'error', error = ?, updated_at = ? WHERE id = ?`),
  remove: db.prepare('DELETE FROM queue_jobs WHERE id = ?'),
  recover: db.prepare(`UPDATE queue_jobs SET status = 'pending' WHERE status = 'running'`),
  oldErrors: db.prepare(`DELETE FROM queue_jobs WHERE status = 'error' AND updated_at < ?`),
  byCharacter: db.prepare('DELETE FROM queue_jobs WHERE character_id = ?'),
  all: db.prepare('SELECT * FROM queue_jobs WHERE owner_id = ?'),
  paused: db.prepare('SELECT paused FROM social_settings WHERE owner_id = ?'),
  setPaused: db.prepare(`INSERT INTO social_settings (owner_id, paused) VALUES (?, ?) ON CONFLICT(owner_id) DO UPDATE SET paused = excluded.paused`),
};

const handlers = new Map();   // kind -> async (job, payload) => void
const planners = [];          // async (ownerId) => void: aggiungono contenuti nuovi quando la coda è vuota
let lastActivity = 0;
let busy = false;
let timer = null;

export const channel = (ownerId) => `social-${ownerId}`;
const notify = (ownerId) => emit(channel(ownerId), { type: 'social', what: 'queue' });

/** La chat (o lo studio) è stata usata adesso: la coda aspetta che tu sia fermo. */
export function touch() { lastActivity = Date.now(); }

export function register(kind, fn) { handlers.set(kind, fn); }
export function onIdle(fn) { planners.push(fn); }

export function add({ ownerId, characterId = null, kind, gpu: who, priority = PRIORITY.plan, payload = {}, label = '', delayMs = 0 }) {
  const now = Date.now();
  const id = newId();
  q.insert.run(id, ownerId, characterId, kind, who, priority, JSON.stringify(payload), label, now + Math.max(0, delayMs), now, now);
  notify(ownerId);
  kick();
  return id;
}

const parse = (row) => ({ ...row, payload: JSON.parse(row.payload || '{}') });

/** Lavori di un utente (in attesa, in corso, falliti), per il pannello della coda. */
export const list = (ownerId) => q.pendingOwner.all(ownerId).map(parse);

/** Lavori che soddisfano un filtro (per sapere, ad esempio, chi sta rispondendo a un commento). */
export const find = (ownerId, fn) => q.all.all(ownerId).map(parse).filter(fn);

export function removeWhere(ownerId, fn) {
  for (const j of find(ownerId, fn)) if (j.status !== 'running') q.remove.run(j.id);
  notify(ownerId);
}
export function removeForCharacter(characterId) { q.byCharacter.run(characterId); }
export function retry(ownerId, id) {
  const j = find(ownerId, (x) => x.id === id && x.status === 'error')[0];
  if (!j) return false;
  q.setPending.run(Date.now(), null, Date.now(), j.id);
  db.prepare('UPDATE queue_jobs SET attempts = 0 WHERE id = ?').run(j.id);
  notify(ownerId);
  kick();
  return true;
}

export const isPaused = (ownerId) => !!q.paused.get(ownerId)?.paused;
export function setPaused(ownerId, paused) {
  q.setPaused.run(ownerId, paused ? 1 : 0);
  notify(ownerId);
  if (!paused) kick();
}

const gpuIdle = () => { const s = gpu.state(); return !s.active && !s.queued.length; };
export const userIdle = () => Date.now() - lastActivity > config.drip.idleMs;

async function execute(job) {
  const fn = handlers.get(job.kind);
  if (!fn) { q.remove.run(job.id); return; }
  q.setRunning.run(Date.now(), job.id);
  job.attempts += 1;
  job.lastAttempt = job.attempts >= MAX_ATTEMPTS;
  notify(job.owner_id);
  try {
    if (job.gpu === 'none') await fn(job, job.payload);
    else await gpu.run(job.gpu, job.label || 'Social', () => fn(job, job.payload));
    q.remove.run(job.id);
  } catch (e) {
    console.warn(`[coda] ${job.label || job.kind}: ${e.message}`);
    if (job.lastAttempt) q.setError.run(String(e.message).slice(0, 300), Date.now(), job.id);
    else q.setPending.run(Date.now() + 2 * 60 * 1000 * job.attempts, String(e.message).slice(0, 300), Date.now(), job.id);
  } finally {
    notify(job.owner_id);
  }
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const now = Date.now();
    const due = q.due.all(now).map(parse).filter((j) => !isPaused(j.owner_id));
    // Senza GPU: subito
    for (const j of due.filter((x) => x.gpu === 'none')) await execute(j);

    if (!gpuIdle() || !userIdle()) return;
    let ready = due.filter((x) => x.gpu !== 'none');
    if (!ready.length) {
      for (const { owner_id: owner } of q.owners.all()) {
        if (isPaused(owner)) continue;
        for (const plan of planners) await plan(owner).catch((e) => console.warn('[coda] piano:', e.message));
      }
      ready = q.due.all(Date.now()).map(parse).filter((j) => j.gpu !== 'none' && !isPaused(j.owner_id));
    }
    if (!ready.length) return;
    // Tra i lavori quasi altrettanto urgenti, quello che usa il modello già caricato
    const best = ready[0].priority;
    const band = ready.filter((j) => j.priority <= best + 1);
    const owner = gpu.state().owner;
    const job = band.find((j) => j.gpu === owner) || band[0];
    await execute(job);
    kick(1500);   // un pezzo alla volta, ma senza aspettare il giro successivo se tutto è ancora libero
  } finally {
    busy = false;
  }
}

/** Ricontrolla presto (dopo un'aggiunta o un lavoro finito). */
export function kick(ms = 800) {
  clearTimeout(timer);
  timer = setTimeout(() => tick().catch((e) => console.warn('[coda]', e.message)), ms);
}

export function start() {
  q.recover.run();
  q.oldErrors.run(Date.now() - 3 * 86400 * 1000);
  setInterval(() => tick().catch((e) => console.warn('[coda]', e.message)), 15 * 1000);
  kick(20 * 1000);
}
