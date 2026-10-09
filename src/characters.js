import * as ollama from './ollama.js';
import config from './config.js';
import { BODY, normalizeBody, normalizeManual } from './body.js';
import { normalizeCharLora } from './photo.js';

/**
 * Scheda del personaggio, a strati:
 *  - nucleo:   personality (carattere, valori, ferite, desideri), speech (come parla e scrive), boundaries
 *  - vita:     life (lavoro, routine, persone, progetti in corso)
 *  - aspetto:  look (descrizione visiva in inglese, usata per foto e video), style (motore immagini),
 *              body (taglie ricavate in automatico dall'aspetto → LoRA del corpo, vedi body.js),
 *              bodyManual (forze regolate a mano nello studio o nella scheda: se ci sono vincono sulle taglie),
 *              lora (LoRA del personaggio con la sua parola chiave: il volto resta lo stesso in ogni foto di Krea 2)
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
    body: normalizeBody(c.body),
    bodyManual: normalizeManual(c.bodyManual),          // forze delle LoRA del corpo scelte a mano (studio o scheda)
    lora: normalizeCharLora(c.lora),                  // LoRA del personaggio (volto coerente, solo Krea 2): { file, trigger, strength }
    relation: pick(c.relation, RELATIONS, 'sconosciuti'),
    pace: pick(c.pace, PACES, 'media'),
    intimacy: pick(c.intimacy, INTIMACY, 'confidenza'),
    startPresence: pick(c.startPresence, { apart: 1, together: 1 }, 'apart'),
    startPlace: str(c.startPlace, 200),
    greeting: str(c.greeting, 1500),
    initiative: c.initiative !== false,
    social: c.social !== false,                       // pubblica post e storie sul social (coda a goccia)
  };
}

// Scheda chiesta a Gemma in JSON: la usano sia la bozza da un'idea sia quella da una foto
const CARD_SYSTEM = `You design characters for an adult, private, local roleplay and texting app. From the user's idea write a vivid, believable, specific character card. Avoid clichés and generic traits: give them contradictions, a real life, small habits, a way of talking. The character is an adult (18+).

Reply ONLY with JSON with these keys (Italian text unless stated):
{
 "name": "first name (and surname only if natural)",
 "age": number (adult, 18+),
 "gender": "donna" | "uomo" | "altro",
 "personality": "5-8 sentences: temperament, values, what they want, what hurts them, contradictions, sense of humour, how they behave with strangers vs people they trust, what attracts them",
 "life": "4-6 sentences: job, city, routine, people in their life, something going on right now (a project, a problem, a plan)",
 "speech": "2-3 sentences: how they talk and text (register, slang, emoji, length, typical expressions)",
 "boundaries": "1-2 sentences: things they don't like or won't do, topics they avoid",
 "look": "ENGLISH, 50-90 words, for an image model: apparent age, ethnicity, build and body shape (say explicitly how slim or curvy, breast size and butt size), face, eyes, hair (color, length, style), skin, distinctive marks, usual style of clothes. No pose, no background, no camera words",
 "body": {"breast": "${Object.keys(BODY.breast.sizes).join('|')}", "butt": "${Object.keys(BODY.butt.sizes).join('|')}", "build": "${Object.keys(BODY.build.sizes).join('|')}", "implants": "natural|fake"} (must match the look; implants "fake" only if the look says augmented/implants),
 "style": "krea" (realistic candid photos) | "zimage" (polished, glamorous or stylised),
 "pace": "lenta" | "media" | "rapida" (how fast they open up emotionally and physically),
 "startPlace": "where they are when the story begins (short, Italian)",
 "greeting": "their first message to the user, in character, 1-3 short lines, consistent with the starting situation"
}`;

async function askCard({ system = CARD_SYSTEM, user, images, model, current }) {
  const out = await ollama.complete({
    model: model || config.ollama.model,
    format: 'json',
    timeout: 120000,
    options: { temperature: 0.9, num_predict: 1400 },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user, ...(images?.length ? { images } : {}) }],
  });
  let j;
  try { j = JSON.parse(out); } catch { throw new Error('Gemma non ha restituito una scheda valida, riprova'); }
  if (j.minor === true) throw Object.assign(new Error('La persona nella foto sembra minorenne: non si può creare un personaggio da questa immagine'), { status: 422 });
  // senza taglie nella risposta si ricavano al salvataggio dall'aspetto nuovo
  return normalizeCard({ ...(current || {}), ...j, body: j.body || null });
}

/** Bozza completa di una scheda a partire da un'idea in una frase (Gemma, JSON). */
export async function draftFromIdea(idea, { model, current } = {}) {
  const user = current
    ? `Current card (keep what fits, change what the request asks):\n${JSON.stringify(current)}\n\nRequest: ${idea}`
    : `Idea: ${idea || 'sorprendimi: un personaggio originale e credibile'}`;
  return askCard({ user, model, current });
}

/** Domanda al modello visivo (Qwen3-VL) per leggere la persona di una foto: solo quello che serve alla scheda. */
export const PHOTO_QUESTION = `Describe the main person in this photo so that a writer can turn them into a character and an image generator can recreate them. Write in English, objectively and in detail:
- apparent age (a number) and gender; say clearly if they could be under 18
- ethnicity and skin tone, face shape, eyes (color, shape), eyebrows, nose, lips, distinctive marks, makeup
- hair: color, length, texture, style
- body: height impression, build, how slim or curvy, breast size, hips and butt size (as far as visible)
- clothes, accessories and overall style
- expression, attitude, what the setting and details suggest about their life, taste or job
If there are several people, describe only the most prominent one. Do not describe the camera or the composition.`;

/**
 * Bozza di una scheda a partire da una foto: l'aspetto viene dalla foto (descrizione del modello visivo,
 * e la foto stessa se Gemma vede le immagini), il resto lo inventa Gemma partendo dagli indizi.
 */
export async function draftFromPhoto({ description, images, idea, model, figure, takenNames = [] }) {
  const system = `${CARD_SYSTEM}

The character is built from a reference photo of them. The photo is the truth about their appearance:
- "look" must describe exactly the person in the photo (age, ethnicity, face, eyes, hair, body shape and sizes, usual clothes), faithfully and specifically, so new photos look like the same person. Never contradict it.
- "age" is their apparent age in the photo, "gender" what the photo shows, "body" the sizes the photo shows.
- "style": "krea" if the reference is a real photo (the same face is then kept in their photos), "zimage" only for an illustration or a very stylised image.
- Everything else (name, personality, life, speech…) you invent, consistent with what the photo suggests (style, setting, expression), and with the user's idea if given.
- If the person in the photo looks under 18, reply ONLY with {"minor": true}.`;
  const extra = [
    // fisico regolato a mano nello studio: la foto può non mostrarlo bene, vince quello scelto
    figure ? `The user set their figure by hand: ${figure}. Write exactly this figure in "look" and "body", even if the photo shows it less clearly.` : null,
    `Name: pick a fresh first name that fits their background, not the most obvious one${takenNames.length ? `, and none of these (already used): ${takenNames.slice(0, 40).join(', ')}` : ''}.`,
  ].filter(Boolean).join('\n');
  const user = [
    description ? `Description of the person in the photo (from a vision model):\n${description}` : 'The photo is attached.',
    `Idea from the user: ${idea || '(none: invent a believable, original person who fits the photo)'}`,
    extra,
  ].join('\n\n');
  return askCard({ system, user, images, model });
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
    // la chat conta come iniziata solo se l'utente ha scritto almeno un messaggio (il saluto del personaggio non basta)
    started: c.messages.some((m) => m.role === 'user'),
    lastMessageAt: last?.createdAt || 0,
    preview: last ? (last.content ? last.content.replace(/\s+/g, ' ').slice(0, 90) : last.media?.[0]?.type === 'video' ? '🎬 Video' : '📷 Foto') : '',
    previewFromUser: last?.role === 'user',
  };
}
