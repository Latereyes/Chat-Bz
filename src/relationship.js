/**
 * Stato vivo del personaggio: scena, rapporto a più dimensioni, umore, riassunto e pensieri.
 *
 * Il rapporto non è un numero solo: fiducia, affetto, attrazione, familiarità e tensione si muovono
 * per ragioni diverse. L'intimità nasce da tre livelli insieme:
 *  1. il tetto deciso dall'utente per il personaggio (mai / con la confidenza / aperta)
 *  2. il temperamento del personaggio (pace: quanto in fretta si apre)
 *  3. il momento (rapporto attuale + scena: dove si è, chi c'è, cosa sta succedendo)
 */
export const DIMS = ['trust', 'affection', 'attraction', 'familiarity', 'tension'];
export const DIM_LABEL = { trust: 'Fiducia', affection: 'Affetto', attraction: 'Attrazione', familiarity: 'Familiarità', tension: 'Tensione' };

const START = {
  sconosciuti: { trust: 10, affection: 8, attraction: 15, familiarity: 5, tension: 5 },
  conoscenti: { trust: 30, affection: 25, attraction: 25, familiarity: 30, tension: 5 },
  amici: { trust: 60, affection: 55, attraction: 30, familiarity: 70, tension: 5 },
  coppia: { trust: 80, affection: 85, attraction: 80, familiarity: 85, tension: 5 },
};
// Vicinanza media (fiducia, affetto, attrazione) oltre la quale, con il tetto "con la confidenza", l'intimità si apre
const PACE_THRESHOLD = { lenta: 68, media: 55, rapida: 38 };

const clamp = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

export function initialState(card) {
  return {
    scene: {
      presence: card.startPresence || 'apart',          // apart = a distanza, together = insieme
      place: card.startPlace || '',
      activity: '',
      outfit: '',
      mood: '',
      intimacy: 'none',                                 // none | flirt | intimate (cosa sta succedendo ora)
      since: Date.now(),
    },
    rel: { ...(START[card.relation] || START.sconosciuti) },
    relNote: '',                                        // dinamica recente, scritta dalla riflessione
    summary: '',                                        // storia finora (per i messaggi usciti dal contesto)
    hooks: [],                                          // cose che il personaggio vuole riprendere la prossima volta
    lastReflectedCount: 0,
    lastInitiativeAt: 0,
  };
}

export function closeness(rel) {
  return Math.round((rel.trust + rel.affection + rel.attraction) / 3);
}

/** L'intimità è aperta in questo momento? (tetto dell'utente + temperamento + rapporto) */
export function intimacyOpen(card, rel) {
  if (card.intimacy === 'mai') return false;
  if (card.intimacy === 'aperta') return true;
  return closeness(rel) >= (PACE_THRESHOLD[card.pace] || 55) && rel.tension < 60;
}

export function stageText(rel) {
  const c = closeness(rel);
  if (c < 15) return 'STRANGERS: polite but guarded, little personal sharing, physical distance.';
  if (c < 30) return 'EARLY ACQUAINTANCES: some warmth, small opinions and genuine reactions slip through; still cautious.';
  if (c < 50) return 'GROWING FAMILIARITY: comfortable, teasing, more personal topics are open, closeness feels less awkward.';
  if (c < 70) return 'REAL CONNECTION: trust is there, masks drop, vulnerability and inside jokes emerge, physical comfort grows.';
  if (c < 85) return 'DEEP BOND: emotionally intimate, fully yourself with them; tenderness and desire flow from the connection.';
  return 'PROFOUND TRUST: complete emotional safety; nothing needs to be hidden.';
}

export function intimacyText(card, rel, scene) {
  const open = intimacyOpen(card, rel);
  if (card.intimacy === 'mai') {
    return 'INTIMACY: you keep things non-sexual with the user: warmth and light flirting at most. If they push, decline in character, briefly and without lecturing.';
  }
  if (!open) {
    return `INTIMACY: you do not feel close enough yet (closeness ${closeness(rel)}/100). You can be warm, curious, teasing, a little flirty if it is in your nature, but you do not engage in sexual content and you do not send revealing photos. If they push, slow things down in character (a joke, a boundary, a change of subject) without lecturing; closeness has to be earned.`;
  }
  const now = scene.intimacy === 'intimate'
    ? 'Right now the moment IS intimate: stay present in it, be explicit and honest when the scene calls for it, no fade to black, no euphemisms.'
    : 'Nothing intimate is happening right now: do not force it. Desire can show in small ways if the moment invites it.';
  return `INTIMACY: you feel safe and attracted enough that flirting, sensuality and sex are open to you when the moment and your own desire call for it. It stays your choice: your mood, wants and boundaries count and you can say no or slow down. Let the user lead the pace as much as you do. ${now} Afterwards life goes on: tenderness, humour, ordinary things.`;
}

// Parole di sesso esplicito (italiano e inglese): bastano a dire che il momento è intimo anche se la scena non è stata aggiornata
const EXPLICIT_WORDS = /\b(?:scop(?:ami|armi|arti|are|iamo|ando|ata|ato|erei|erti)|sesso|nud[aoie]|tett[ae]|pompin\w*|succhi\w*|lecc(?:ami|armi|arti|are|ando)\w*|pecorina|a\s+90|cavalc\w*|missionari\w*|penetr\w*|orgasm\w*|sborr\w*|capezzol\w*|clitoride|vagina|sex|fuck\w*|naked|nude|blowjob|doggy\w*|cowgirl|missionary|pussy|cock|dick|tits|boobs|cum)\b/i;
export const explicitHint = (text) => EXPLICIT_WORDS.test(String(text || ''));
/** La prima parola esplicita del testo (per dire perché una foto è uscita esplicita), o null. */
export const explicitWord = (text) => String(text || '').match(EXPLICIT_WORDS)?.[0] || null;

/**
 * Livello di contenuto per le foto: mai oltre il tetto del personaggio, e solo se la scena lo giustifica.
 * hint: testo del momento (messaggio dell'utente, risposta): con parole esplicite e intimità aperta la foto è esplicita
 * anche se Gemma non ha portato la scena a "intimate" (nelle scene clou capitava spesso, e la foto usciva vestita).
 */
export function contentLevel(card, rel, scene, hint = '') {
  if (!intimacyOpen(card, rel)) return 'neutral';
  if (scene.intimacy === 'intimate' || explicitHint(hint)) return 'explicit';
  if (scene.intimacy === 'flirt') return 'sensual';
  return 'neutral';
}

/** Applica le variazioni proposte dalla riflessione (limitate, così il rapporto cambia gradualmente). */
export function applyDelta(rel, delta = {}, max = 8) {
  const out = { ...rel };
  for (const k of DIMS) {
    const d = Math.max(-max, Math.min(max, Math.round(Number(delta[k]) || 0)));
    out[k] = clamp(out[k] + d);
  }
  return out;
}

const PRESENCE = { apart: 1, together: 1 };
const INTIM = { none: 1, flirt: 1, intimate: 1 };

/**
 * Aggiorna la scena con i soli campi forniti (dal tool update_scene o a mano dall'utente).
 * auto: aggiornamento deciso da Gemma (strumento o controllo della scena): l'intimità sale di un gradino alla volta.
 * Prova sul PC 2026-10-10: «qualcuna vuole venire a casa mia?» portava la scena da niente a «intima».
 */
export function updateScene(scene, patch = {}, { auto = false } = {}) {
  const next = { ...scene };
  const s = (v) => String(v ?? '').trim().slice(0, 200);
  if (PRESENCE[patch.presence]) next.presence = patch.presence;
  for (const k of ['place', 'activity', 'outfit', 'mood']) if (patch[k] !== undefined && s(patch[k])) next[k] = s(patch[k]);
  if (INTIM[patch.intimacy]) next.intimacy = auto && patch.intimacy === 'intimate' && (scene.intimacy || 'none') === 'none' ? 'flirt' : patch.intimacy;
  if (next.presence !== scene.presence || next.place !== scene.place) next.since = Date.now();
  return next;
}
