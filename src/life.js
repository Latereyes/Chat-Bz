import config from './config.js';
import * as store from './store.js';
import * as memory from './memory.js';
import * as chat from './chat.js';
import { gpu } from './gpu.js';
import { emit } from './jobs.js';
import { asleep } from './social.js';

/**
 * La "vita" dei personaggi quando non stai chattando:
 *  - riflessione a riposo: conversazione ferma da qualche minuto + GPU libera → aggiorna rapporto e memorie
 *    (e quando i ricordi sono tanti li riordina: doppioni uniti, contraddizioni risolte)
 *  - iniziativa: alla riaccensione del server, un personaggio può scriverti per primo (al massimo un messaggio)
 * Lavora un personaggio alla volta e solo quando la GPU non serve ad altro.
 */
let busy = false;

async function tick() {
  if (busy || !(await gpu.idle())) return;
  const now = Date.now();
  const due = store.list()
    .filter((c) => !chat.isRunning(c.id) && memory.needsReflection(c)
      && now - (c.state.lastActivityAt || c.updatedAt || 0) > config.reflect.idleMs);
  const conv = due[0];
  if (!conv) return;
  busy = true;
  try {
    await gpu.run('ollama', `${conv.card.name} ripensa alla conversazione`, () => memory.reflect(conv), { priority: 'low' });
    if (memory.needsConsolidation(conv)) {
      await gpu.run('ollama', `${conv.card.name} riordina i ricordi`, () => memory.consolidate(conv), { priority: 'low' })
        .catch((e) => console.warn(`[memorie] ${conv.card.name}: ${e.message}`));
    }
    emit(conv.id, { type: 'state', state: conv.state });
  } catch (e) {
    console.warn(`[riflessione] ${conv.card.name}: ${e.message}`);
    conv.state.lastActivityAt = Date.now();   // riprova più tardi, non a ogni giro
  } finally {
    busy = false;
  }
}

/** Alla riaccensione: chi ha qualcosa in sospeso e non sente l'utente da un po' può scrivere per primo. */
function initiatives(chance = 0.6) {
  if (!config.initiative.enabled || asleep()) return;
  const now = Date.now();
  const minGap = config.initiative.minHours * 3600 * 1000;
  const candidates = store.list().filter((c) => {
    const last = c.messages.at(-1);
    return c.card.initiative && c.state.hooks?.length && last
      && !last.initiative                                   // mai due messaggi di fila di sua iniziativa
      && now - (last.createdAt || 0) > minGap
      && now - (last.createdAt || 0) < 21 * 86400 * 1000    // relazioni attive nelle ultime 3 settimane
      && now - (c.state.lastInitiativeAt || 0) > minGap;
  }).slice(0, 2);
  for (const c of candidates) {
    c.state.lastInitiativeAt = now;
    if (Math.random() < chance) chat.initiate(c);           // non sempre: un po' di imprevedibilità
  }
}

export function start() {
  setInterval(() => tick().catch(() => {}), 60 * 1000);
  setTimeout(initiatives, 45 * 1000);
  // Anche con il server sempre acceso: ogni mezz'ora, di giorno, chi non ti sente da ore può scriverti
  setInterval(() => initiatives(0.15), 30 * 60 * 1000);
}
