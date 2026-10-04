import * as ollama from './ollama.js';
import config from './config.js';

/**
 * Scheda del personaggio, a strati:
 *  - nucleo:   personality (carattere, valori, ferite, desideri), speech (come parla e scrive), boundaries
 *  - vita:     life (lavoro, routine, persone, progetti in corso)
 *  - aspetto:  look (descrizione visiva in inglese, usata per foto e video), style (motore immagini)
 *  - rapporto: relation (punto di partenza), pace (quanto in fretta si apre), intimacy (tetto deciso dall'utente)
 */
export const RELATIONS = {
  sconosciuti: 'Sconosciuti',
  conoscenti: 'Conoscenti',
  amici: 'Amici',
  coppia: 'Già una coppia',
};
export const PACES = { lenta: 'Lenta', media: 'Media', rapida: 'Rapida' };
export const INTIMACY = { mai: 'Mai', confidenza: 'Con la confidenza', aperta: 'Aperta' };
// Motore delle foto in chat: Krea 2 per il realismo spontaneo, Z-Image per un look più curato o stilizzato
export const STYLES = { krea: 'Realistico spontaneo (Krea 2)', zimage: 'Curato / stilizzato (Z-Image)' };

const pick = (v, allowed, def) => (Object.hasOwn(allowed, v) ? v : def);
const str = (v, max = 4000) => String(v ?? '').trim().slice(0, max);

export function normalizeCard(c = {}) {
  const age = Math.round(Number(c.age) || 0);
  return {
    name: str(c.name, 60) || 'Senza nome',
    age: age >= 18 ? Math.min(age, 99) : 25,          // solo personaggi adulti
    gender: pick(c.gender, { donna: 1, uomo: 1, altro: 1 }, 'donna'),
    personality: str(c.personality),
    life: str(c.life),
    speech: str(c.speech, 1500),
    boundaries: str(c.boundaries, 1500),
    look: str(c.look, 1500),
    style: pick(c.style, STYLES, 'krea'),
    relation: pick(c.relation, RELATIONS, 'sconosciuti'),
    pace: pick(c.pace, PACES, 'media'),
    intimacy: pick(c.intimacy, INTIMACY, 'confidenza'),
    startPresence: pick(c.startPresence, { apart: 1, together: 1 }, 'apart'),
    startPlace: str(c.startPlace, 200),
    greeting: str(c.greeting, 1500),
    initiative: c.initiative !== false,
  };
}

/** Bozza completa di una scheda a partire da un'idea in una frase (Gemma, JSON). */
export async function draftFromIdea(idea, { model, current } = {}) {
  const system = `You design characters for an adult, private, local roleplay and texting app. From the user's idea write a vivid, believable, specific character card. Avoid clichés and generic traits: give them contradictions, a real life, small habits, a way of talking. The character is an adult (18+).

Reply ONLY with JSON with these keys (Italian text unless stated):
{
 "name": "first name (and surname only if natural)",
 "age": number (adult, 18+),
 "gender": "donna" | "uomo" | "altro",
 "personality": "5-8 sentences: temperament, values, what they want, what hurts them, contradictions, sense of humour, how they behave with strangers vs people they trust, what attracts them",
 "life": "4-6 sentences: job, city, routine, people in their life, something going on right now (a project, a problem, a plan)",
 "speech": "2-3 sentences: how they talk and text (register, slang, emoji, length, typical expressions)",
 "boundaries": "1-2 sentences: things they don't like or won't do, topics they avoid",
 "look": "ENGLISH, 50-90 words, for an image model: apparent age, ethnicity, build and body shape, face, eyes, hair (color, length, style), skin, distinctive marks, usual style of clothes. No pose, no background, no camera words",
 "style": "krea" (realistic candid photos) | "zimage" (polished, glamorous or stylised),
 "pace": "lenta" | "media" | "rapida" (how fast they open up emotionally and physically),
 "startPlace": "where they are when the story begins (short, Italian)",
 "greeting": "their first message to the user, in character, 1-3 short lines, consistent with the starting situation"
}`;
  const user = current
    ? `Current card (keep what fits, change what the request asks):\n${JSON.stringify(current)}\n\nRequest: ${idea}`
    : `Idea: ${idea || 'sorprendimi: un personaggio originale e credibile'}`;
  const out = await ollama.complete({
    model: model || config.ollama.model,
    format: 'json',
    timeout: 120000,
    options: { temperature: 0.9, num_predict: 1400 },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  });
  let j;
  try { j = JSON.parse(out); } catch { throw new Error('Gemma non ha restituito una scheda valida, riprova'); }
  return normalizeCard({ ...(current || {}), ...j });
}

/** Dati pubblici per l'interfaccia. */
export function publicCharacter(c, mediaUrl) {
  const last = c.messages.findLast((m) => (m.content || m.media?.length) && m.status !== 'pending');
  return {
    id: c.id,
    name: c.card.name,
    card: c.card,
    avatarUrl: mediaUrl(c.avatar),
    scene: c.state.scene,
    updatedAt: c.updatedAt,
    preview: last ? (last.content ? last.content.replace(/\s+/g, ' ').slice(0, 90) : last.media?.[0]?.type === 'video' ? '🎬 Video' : '📷 Foto') : '',
    previewFromUser: last?.role === 'user',
  };
}
