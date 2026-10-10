import * as ollama from './ollama.js';
import { intimacyOpen, explicitWord } from './relationship.js';
import { visualSignature, promptEngineerSystem, cleanPrompt, splitLook } from './prompts.js';
import { figureText, bodyFamily, hasBodyLoras, hasLenovo, applyLenovo, applyBodyLoras, chainEnds, insertAfter, removeLora, FAMILIES } from './body.js';
import { LORAS, profileFor, DUO_FACES, DUO_BODY, SINGLE_FACE, FACE_CHAIN } from './krea2.js';

/**
 * Foto dei personaggi (chat, social; lo Studio prende solo LoRA e Lenovo), in quattro passi che restituiscono
 * dati da stampare e provare (tools/prova-foto.js):
 *  1. photoLevel    → filtro neutral | sensual | explicit, con il perché
 *  2. photoRequest  → la richiesta al prompt engineer: un solo blocco di regole per filtro
 *  3. Gemma scrive il prompt (temperatura per filtro); finishPrompt aggiunge i token di HMNSFW e del personaggio
 *  4. applyPhotoStack → nel grafo: Lenovo, LoRA del corpo, LoRA di supporto di Krea 2 (krea2.js), LoRA del personaggio
 * Z-Image per ora resta grezzo: niente Lenovo, niente LoRA (solo il prompt).
 */

export const LEVELS = ['neutral', 'sensual', 'explicit'];
export const LEVEL_LABEL = { neutral: 'Normale', sensual: 'Sensuale', explicit: 'Esplicito' };

// Parole che chiedono una foto sensuale (italiano e inglese): intimo, costume, nudo coperto, pose provocanti
const SENSUAL_WORDS = /\b(?:intimo|lingerie|reggiseno|reggipetto|mutandin\w*|mutande|perizoma|tanga|slip|autoreggenti|giarrettier\w*|corsetto|bikini|costume\s+da\s+bagno|costumino|asciugamano|accappatoio|vestaglia|sottoveste|babydoll|camicia\s+da\s+notte|scollat\w*|sexy|provocant\w*|sensual\w*|seducent\w*|stuzzicant\w*|underwear|bra|panties|thong|stockings|negligee|cleavage|towel|bathrobe|seductive|sultry|swimsuit)\b/i;
export const sensualWord = (text) => String(text || '').match(SENSUAL_WORDS)?.[0] || null;

/**
 * 1. Filtro della foto: mai oltre il tetto del personaggio (intimità chiusa → sempre Normale).
 * userText: il messaggio dell'utente; reply: la risposta del personaggio (conta solo se la scena è già almeno di flirt).
 */
export function photoLevel({ card, state, userText = '', reply = '' }) {
  const scene = state.scene || {};
  const ex = explicitWord(userText) || (scene.intimacy !== 'none' ? explicitWord(reply) : null);
  const sw = sensualWord(userText);
  let want = null, reason = '';
  if (scene.intimacy === 'intimate') { want = 'explicit'; reason = 'scena intima'; }
  else if (ex) { want = 'explicit'; reason = `parola esplicita: «${ex}»`; }
  else if (scene.intimacy === 'flirt') { want = 'sensual'; reason = 'scena flirt'; }
  else if (sw) { want = 'sensual'; reason = `parola sensuale: «${sw}»`; }
  if (!want) return { level: 'neutral', reason: 'base' };
  if (!intimacyOpen(card, state.rel)) {
    return { level: 'neutral', reason: `tetto: intimità ${card.intimacy === 'mai' ? 'mai' : 'non ancora aperta'} (sarebbe ${LEVEL_LABEL[want].toLowerCase()}, ${reason})` };
  }
  return { level: want, reason };
}

/** Filtro per lo Studio: nessun tetto, decide la richiesta. */
export function studioLevel(text) {
  const ex = explicitWord(text);
  if (ex) return { level: 'explicit', reason: `parola esplicita: «${ex}»` };
  const sw = sensualWord(text);
  if (sw) return { level: 'sensual', reason: `parola sensuale: «${sw}»` };
  return { level: 'neutral', reason: 'base' };
}

// Quanto della conversazione vede Gemma: in esplicito gli ultimi 3 scambi, così posizione e POV detti prima non si perdono
export const EXCHANGES = { neutral: 1, sensual: 1, explicit: 3 };
export const TEMPERATURE = { neutral: 0.7, sensual: 0.6, explicit: 0.4 };

/**
 * Ultimi scambi della conversazione fino al messaggio idx compreso (la risposta in corso):
 * [{ user, reply }] dal più vecchio al più recente. Le note delle foto non ci sono, solo il testo.
 */
export function recentExchanges(messages, idx, n) {
  const out = [];
  for (const m of messages.slice(0, idx + 1)) {
    if (m.role === 'user') out.push({ user: String(m.content || '').trim(), reply: '' });
    else if (m.role === 'assistant' && m.content) {
      if (!out.length) out.push({ user: '', reply: '' });
      out.at(-1).reply = [out.at(-1).reply, String(m.content).trim()].filter(Boolean).join('\n');
    }
  }
  return out.filter((e) => e.user || e.reply).slice(-n);
}

const clip = (t, n) => { const x = String(t || '').trim(); return x.length > n ? `${x.slice(0, n)}…` : x; };

/**
 * HMNSFW: «HMNSFW <posizione>, ANGLE_<angolo>, <descrizione>». Posizione e angolo si ricavano a parole dalla
 * conversazione (prima i messaggi più recenti), non li sceglie Gemma: meno regole per lei, e si provano.
 */
const HM_POSITIONS = [
  ['handjob', /\b(?:sega|seghetta|handjob|hand\s*job|me\s+lo\s+(?:tocchi|meni|prendi\s+in\s+mano)|menarmelo|toccarmelo)\b/i],
  ['doggy', /\b(?:pecorina|a\s+90|a\s+quattro\s+zampe|carponi|doggy\w*)\b/i],
  ['missionary', /\b(?:missionari\w*|missionary)\b/i],
  ['cowgirl', /\b(?:cowgirl|cavalc\w*|sopra\s+di\s+me|sopra\s+a\s+me|stai\s+sopra|salimi\s+sopra|on\s+top|riding|ride\s+me)\b/i],
];
const HM_ANAL = /\b(?:anal\w*|nel\s+culo|in\s+culo|sodomi\w*)\b/i;
const HM_CUM = /\b(?:sborr\w*|sperma|cum\w*|facial|vengo\s+(?:in|sul|sulla|addosso)|venirti\s+(?:in|sul|sulla|addosso)|finish\w*)\b/i;
const HM_ANGLES = [
  ['CLOSEUP', /\b(?:primo\s+piano|primissimo\s+piano|close[- ]?up|da\s+vicino|dettaglio)\b/i],
  ['SIDE_PROFILE', /\b(?:di\s+lato|di\s+profilo|laterale|side\s+view|from\s+the\s+side|profile)\b/i],
  ['OVERHEAD', /\b(?:dall'?\s*alto|dall'?\s*sopra|overhead|from\s+above|top[- ]down)\b/i],
  ['LOW_ANGLE', /\b(?:dal\s+basso|low[- ]angle|from\s+below)\b/i],
  ['BEHIND', /\b(?:da\s+dietro|di\s+spalle|from\s+behind)\b/i],
];
// Terza persona chiesta: niente POV di default
const THIRD_PERSON = /\b(?:terza\s+persona|da\s+fuori|vist[aio]\s+da\s+(?:fuori|lontano)|third[- ]person|tutti\s+e\s+due\s+(?:nella|in)\s+foto|entrambi\s+(?:nella|in)\s+foto)\b/i;
// POV di chi è con lei, per posizione, quando non si chiede un angolo preciso
const HM_POV = { cowgirl: 'POV_ABOVE', missionary: 'POV_FRONT', doggy: 'BEHIND', handjob: 'POV_FRONT' };

/** { position, angle, cum } dalla conversazione, o null se non si riconosce né una posizione né un finale. */
export function hmTokens(texts, { together = true } = {}) {
  const list = (Array.isArray(texts) ? texts : [texts]).map((t) => String(t || '')).filter(Boolean);
  const first = (re) => list.find((t) => re.test(t));
  let position = null;
  for (const t of list) {
    const hit = HM_POSITIONS.find(([, re]) => re.test(t));
    if (hit) { position = hit[0]; break; }
  }
  const cum = !!first(HM_CUM);
  if (!position && !cum) return null;
  if (position && position !== 'handjob' && first(HM_ANAL)) position = `${position}_anal`;
  let angle = null;
  for (const t of list) {
    const hit = HM_ANGLES.find(([, re]) => re.test(t));
    if (hit) { angle = hit[0]; break; }
  }
  const third = !!first(THIRD_PERSON);
  if (!angle && together && !third && position) angle = HM_POV[position.replace(/_anal$/, '')];
  return { position: position || 'cum', angle, cum };
}

export const hmPrefix = (hm) => (hm ? `HMNSFW ${hm.position}, ${hm.angle ? `ANGLE_${hm.angle}, ` : ''}` : '');

/** Prompt finale: token di HMNSFW in testa, poi la parola chiave della LoRA del personaggio. */
export function finishPrompt(prompt, { hm, trigger } = {}) {
  let p = String(prompt || '').trim().replace(/^HMNSFW\b[^,]*,\s*(?:ANGLE_\w+,\s*)?/i, '');
  if (trigger && !p.toLowerCase().includes(trigger.toLowerCase())) p = `${trigger}, ${p}`;
  return `${hmPrefix(hm)}${p}`;
}

const WHO = (card) => `${card.gender === 'uomo' ? 'adult man' : card.gender === 'altro' ? 'adult person' : 'adult woman'}, ${card.age} years old`;

// Contenuto per filtro: lo usano anche il social e la richiesta dei video
export const CONTENT = {
  neutral: 'Content: non-sexual. Dressed as the situation requires (a normal outfit for this place and moment), nothing revealing, no lingerie, no nudity, no sexy pose.',
  sensual: 'Content: sensual, not explicit. Lingerie, swimwear, a towel or a robe, bare skin that stays covered where it matters, a teasing or provocative pose and look. No exposed nipples or genitals, no sexual acts.',
  explicit: 'Content: explicit nudity and sex between adults, shown directly, in plain anatomical words (breasts, nipples, pussy, penis, penetration...), no euphemisms.',
};

const REAL = 'A real phone photo of a real moment: relaxed real body language, ordinary surroundings and available light, slightly imperfect framing. Plain words for light and framing (close-up, from slightly above, soft window light); never name cameras, lenses or f-stops; never artistic, cinematic or editorial.';

function framing({ together, man, level, two }) {
  const she = man ? 'He' : 'She', self = man ? 'himself' : 'herself';
  if (two) {
    if (together && level === 'explicit') return "Point of view: unless the user asks otherwise, the viewer's own eyes or phone (POV): the viewer is with both of them, so only the parts of the viewer's body that would really be in frame appear, never the viewer's face. A third-person view only if the user asks for it.";
    return together
      ? 'Framing: both of them in the frame, taken a moment ago with a phone by the person they are with (the viewer), or a selfie of the two of them if the conversation says so.'
      : 'Framing: the two of them are together and take a selfie of both for the person they are texting (arm\'s length or a mirror selfie), unless the user asks for another framing.';
  }
  if (together) {
    return level === 'explicit'
      ? "Point of view: unless the user asks otherwise, the viewer's own eyes or phone (POV): the viewer is the partner, so only the parts of the viewer's body that would really be in frame from their eyes appear (hands, arms, legs, torso, genitals when the position puts them in view), never the viewer's face. A third-person view of both only if the user asks for it."
      : 'Framing: taken a moment ago with a phone by the person they are with (the viewer), from their point of view, unless the conversation says it is a selfie or a mirror selfie.';
  }
  return `Framing: ${she.toLowerCase()} is alone and takes the photo ${self} for the person ${she.toLowerCase()} is texting (a selfie at arm's length, a mirror selfie or the phone propped up), unless the user asks for another framing.`;
}

/** Il blocco di regole del filtro, scritto per intero (niente regole impilate da più parti). */
function rules({ level, together, man, family, hm, two = false }) {
  const body = two ? 'their bodies' : man ? 'his body' : 'her body';
  if (level === 'explicit') {
    return [
      'PHOTO RULES (explicit):',
      `- ${CONTENT.explicit}`,
      "- The USER's directions lead: the position, point of view, framing and what is visible, as said in the conversation above, even if said a few messages ago. Translate them literally; never replace a requested position or point of view with a different or softer one. The character's description only fills the gaps.",
      '- Position names are fine and help (cowgirl, reverse cowgirl, missionary, doggystyle, blowjob, handjob...).',
      `- Structure, overriding the guide: shot type and point of view first, then the position and the sexual action${two ? ' (who does what with whom)' : ''}, then ${body} and what is exposed, then the place in one short sentence, then the light. Every sentence describes something visible: no mood words, no metaphors, no poetic adjectives.`,
      two ? '- Keep the two people clearly distinct: say for each one where they are in the frame and what they look like, so their faces and bodies do not blend.' : null,
      `- ${framing({ together, man, level, two })}`,
      hm?.cum ? '- Finish: describe it plainly as cum, thick white liquid, exactly where it is on the face or body.' : null,
      `- ${REAL}`,
      `- Length: ${hm ? '60-120' : '60-160'} words.`,
    ].filter(Boolean).join('\n');
  }
  return [
    `PHOTO RULES (${level === 'sensual' ? 'sensual' : 'normal'}):`,
    `- ${CONTENT[level]}`,
    level === 'sensual'
      ? "- The character's description leads, together with the user's directions (pose, outfit, framing): if the user asks for something specific, show it."
      : "- The character's description leads; the user's message only adds details (pose, framing) if it asks for them.",
    two ? '- Keep the two people clearly distinct: say for each one where they are in the frame and what they look like, so their faces do not blend.' : null,
    `- ${framing({ together, man, level, two })}`,
    `- ${REAL} Not posing like a model unless the request asks for a posed photo.`,
    family === 'zimage' ? '- Length and order: as in the guide.' : `- Length: ${two ? '80-170' : '60-140'} words, as in the guide.`,
  ].filter(Boolean).join('\n');
}

// Lenovo (look amatoriale) scelto da Gemma con un'etichetta finale; se non la scrive resta acceso
export const LOOK_TAG = 'After the prompt, on a last line of its own, write [look: amateur] (the normal choice for a photo sent in a chat), or [look: clean] only if the request explicitly asks for a posed, professional, glamour or studio-style photo. Write the tag only there.';

/**
 * 2. Richiesta al prompt engineer per una foto in chat.
 * exchanges: recentExchanges(...) (in Normale solo il messaggio dell'utente); fromText: la foto nasce da una riserva
 * testuale (la descrizione sarebbe il messaggio stesso: non si ripete).
 */
export function photoRequest({ card, state, media, level, exchanges = [], user, family, hm, fromText = false, now = new Date() }) {
  const s = state.scene || {};
  const together = s.presence === 'together';
  const man = card.gender === 'uomo';
  const fig = figureText(card);
  const when = now.toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
  const name = user?.name || 'User';
  const convo = exchanges.map((e) => [
    e.user ? `${name}: «${clip(e.user, 700)}»` : null,
    e.reply && level !== 'neutral' ? `${card.name}: «${clip(e.reply, 600)}»` : null,
  ].filter(Boolean).join('\n')).filter(Boolean).join('\n');
  const viewer = together && user ? [user.gender === 'uomo' ? 'an adult man' : user.gender === 'donna' ? 'an adult woman' : '', clip(user.look, 200)].filter(Boolean).join(', ') : '';
  return [
    `Subject: ${WHO(card)}. Appearance (keep it exactly, it defines who this is): ${visualSignature(card.look, level) || '(not specified)'}`,
    fig ? `Figure (keep these proportions exactly and clearly visible${level === 'neutral' ? ', through the clothes' : ''}): ${fig}.` : null,
    `Situation: ${together ? `in person with the viewer${viewer ? ` (${viewer})` : ''}` : 'apart, texting'}${s.place ? `, at ${s.place}` : ''}${s.activity ? `, ${s.activity}` : ''}. Local time: ${when}.${s.outfit ? ` Currently wearing: ${s.outfit}.` : ''}`,
    convo ? `Conversation (most recent last; it may be in Italian):\n${convo}` : null,
    fromText ? 'What the photo should show: what the latest message asks for, in this situation.' : `What the photo should show (written by the character): ${media.description}`,
    rules({ level, together, man, family, hm }),
    `Output format: ${media.width}x${media.height}.`,
    family && hasLenovo(family) ? LOOK_TAG : null,
    'Write the final prompt now.',
  ].filter(Boolean).join('\n');
}

/**
 * 1-3 per una foto del personaggio in chat (e nel banco di prova): filtro, richiesta, prompt di Gemma.
 * messages/idx: la conversazione fino alla risposta in corso; senza, si usa solo userText/reply.
 * variant: variante del profilo di Krea 2 (banco di prova). Restituisce anche la richiesta, per stamparla.
 */
export async function engineerPhoto({ workflow, card, state, media, messages, idx, userText = '', reply = '', user, model, signal, onChunk, fromText = false, variant = null, dryRun = false }) {
  const family = bodyFamily(workflow.graph);
  const { level, reason } = photoLevel({ card, state, userText, reply });
  const exchanges = messages ? recentExchanges(messages, idx, EXCHANGES[level]) : [{ user: userText, reply }].filter((e) => e.user || e.reply);
  const together = state.scene?.presence === 'together';
  const useHm = level === 'explicit' && family === 'krea2' && 'hmnsfw' in profileFor('explicit', variant).loras;
  const hm = useHm ? hmTokens([...exchanges].reverse().flatMap((e) => [e.user, e.reply]).concat(fromText ? [] : [media.description]), { together }) : null;
  const request = photoRequest({ card, state, media, level, exchanges, user, family, hm, fromText });
  const charLora = family === 'krea2' && card.lora?.file ? card.lora : null;
  const result = { level, reason, hm, request, charLora: !!charLora, lenovo: hasLenovo(family) ? true : null, prompt: '' };
  if (dryRun) return { ...result, prompt: finishPrompt('(prompt di Gemma)', { hm, trigger: charLora?.trigger }) };
  let text = '';
  const out = await ollama.chat({
    model, signal, think: false,
    options: { temperature: TEMPERATURE[level] },
    messages: [{ role: 'system', content: promptEngineerSystem(workflow) }, { role: 'user', content: request }],
    onChunk: (c) => { if (c.content) { text += c.content; onChunk?.(c.content); } },
  });
  const { prompt, lenovo } = splitLook(out.content || text);
  if (hasLenovo(family) && lenovo !== null) result.lenovo = lenovo;
  result.prompt = finishPrompt(cleanPrompt(prompt) || media.description, { hm, trigger: charLora?.trigger });
  return result;
}

// ---------- Foto con due personaggi (chat a due e Studio) ----------

const ORDER = { neutral: 0, sensual: 1, explicit: 2 };

/**
 * Filtro di una foto con due personaggi: vale il più basso dei due (ognuno ha il suo tetto e il suo rapporto con te).
 * states: lo stato di ciascuno; scene: la scena condivisa.
 */
export function duoLevel({ cards, states, scene, userText = '', reply = '' }) {
  const all = cards.map((card, i) => ({ card, ...photoLevel({ card, state: { ...states[i], scene }, userText, reply }) }));
  const low = all.reduce((a, b) => (ORDER[b.level] < ORDER[a.level] ? b : a));
  const capped = all.some((x) => x.level !== low.level);
  return { level: low.level, reason: capped ? `${low.card.name}: ${low.reason}` : low.reason };
}

/** Richiesta al prompt engineer per una foto dei due personaggi insieme. fromImage: grafo «due foto profilo» (Qwen). */
export function duoPhotoRequest({ cards, scene = {}, media, level, exchanges = [], user, family, hm, fromText = false, fromImage = false, now = new Date() }) {
  const together = scene.presence === 'together';
  const when = now.toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
  const name = user?.name || 'User';
  const people = cards.map((card, i) => {
    const fig = figureText(card);
    return `Person ${i + 1} = ${card.name}, on the ${i ? 'RIGHT' : 'LEFT'}${fromImage ? ` (input image ${i + 1})` : ''}: ${WHO(card)}. Appearance (keep it exactly): ${visualSignature(card.look, level) || '(not specified)'}${fig ? ` Figure: ${fig}${level === 'neutral' ? ', visible through the clothes' : ''}.` : ''}`;
  });
  const convo = exchanges.map((e) => [
    e.user ? `${name}: «${clip(e.user, 700)}»` : null,
    e.reply && level !== 'neutral' ? `«${clip(e.reply, 700)}»` : null,
  ].filter(Boolean).join('\n')).filter(Boolean).join('\n');
  return [
    'Subjects: two adults in the same photo.',
    ...people,
    'Positions: Person 1 is on the LEFT of the frame and Person 2 on the RIGHT (say it explicitly, e.g. "on the left, ...; on the right, ..."). Each one keeps their own clothes, hair and features: never swap or mix them. When the conversation gives someone an outfit or an action by name, give it to that person. Names are only for you: in the prompt describe the people, never write their names.',
    fromImage ? 'The input images are only for identity (faces, hair, bodies): describe outfits and a scene that fit this moment, not the clothes or background of the input images.' : null,
    `Situation: ${together ? 'in person with the viewer' : 'the two of them together, texting the viewer'}${scene.place ? `, at ${scene.place}` : ''}${scene.activity ? `, ${scene.activity}` : ''}. Local time: ${when}.${scene.outfit ? ` Currently wearing: ${scene.outfit}.` : ''}`,
    convo ? `Conversation (most recent last; it may be in Italian; their replies are labelled with their names):\n${convo}` : null,
    fromText ? 'What the photo should show: what the latest message asks for, in this situation.' : `What the photo should show: ${media.description}`,
    rules({ level, together, family, hm, two: true }),
    `Output format: ${media.width}x${media.height}.`,
    family && hasLenovo(family) ? LOOK_TAG : null,
    'Write the final prompt now.',
  ].filter(Boolean).join('\n');
}

/**
 * Filtro, richiesta e prompt per una foto dei due personaggi. Con Krea 2 le LoRA dei due personaggi vanno insieme
 * nel grafo (charLoras) e le loro parole chiave in testa al prompt.
 */
export async function engineerDuoPhoto({ workflow, cards, states, scene, media, messages, idx, userText = '', reply = '', user, model, signal, onChunk, fromText = false, level: forced = null, dryRun = false }) {
  const family = bodyFamily(workflow.graph);
  const lv = forced ? { level: forced.level, reason: forced.reason } : duoLevel({ cards, states, scene, userText, reply });
  const level = lv.level;
  const exchanges = messages ? recentExchanges(messages, idx, EXCHANGES[level]) : [{ user: userText, reply }].filter((e) => e.user || e.reply);
  const useHm = level === 'explicit' && family === 'krea2' && 'hmnsfw' in profileFor('explicit').loras && workflow.mode === 'text2img';
  const hm = useHm ? hmTokens([...exchanges].reverse().flatMap((e) => [e.user, e.reply]).concat(fromText ? [] : [media.description]), { together: scene?.presence === 'together' }) : null;
  const request = duoPhotoRequest({ cards, scene, media, level, exchanges, user, family, hm, fromText, fromImage: workflow.mode === 'duo' });
  const { charLoras, duoFaces, trigger } = duoLoras(cards, family, workflow.mode);
  const result = { level, reason: lv.reason, hm, request, charLoras, duoFaces, lenovo: hasLenovo(family) ? true : null, prompt: '' };
  if (dryRun) return { ...result, prompt: finishPrompt('(prompt di Gemma)', { hm, trigger }) };
  let text = '';
  const out = await ollama.chat({
    model, signal, think: false,
    options: { temperature: TEMPERATURE[level] },
    messages: [{ role: 'system', content: promptEngineerSystem(workflow) }, { role: 'user', content: request }],
    onChunk: (c) => { if (c.content) { text += c.content; onChunk?.(c.content); } },
  });
  const { prompt, lenovo } = splitLook(out.content || text);
  if (hasLenovo(family) && lenovo !== null) result.lenovo = lenovo;
  result.prompt = finishPrompt(cleanPrompt(prompt) || media.description, { hm, trigger });
  return result;
}

/** Volto di un personaggio per il ritocco con la sua LoRA: parola chiave e tratti del viso. */
/** Tutta la persona per il ritocco con la sua LoRA (fisico della LoRA, vestiti e posa della scena). */
export const bodyText = (card) => [card.lora?.trigger, `photo of an ${WHO(card)}`, clip(visualSignature(card.look, 'explicit'), 300), figureText(card), 'same pose, same clothes and same place as in the image, natural skin texture, real photo'].filter(Boolean).join(', ');
// Frasi del prompt che parlano dell'espressione: il ritocco del volto le ripete, così non la appiattisce
const EXPRESSION = /(?<![-\w])(?:kiss\w*)|\b(?:smil\w*|laugh\w*|grin\w*|express\w*|mouth|lips?|bit(?:es|ing) (?:her|his) lip|eyes?|gaz\w*|look(?:s|ing)? (?:at|up|down|away|into)|wink\w*|blush\w*|frown\w*|pout\w*|moan\w*|tongue|teeth|tears?|cry\w*|surpris\w*|shy|teasing|playful|seductive|sleepy|tired|orgasm\w*|pleasure|parted)\b/i;
// Le due persone si toccano (bacio, abbraccio, sesso): il ritaglio di una prende anche l'altra
const CONTACT = /(?<![-\w])(?:kiss\w*|hug\w*|embrac\w*|cuddl\w*|snuggl\w*|in each other's arms|arms? (?:around|wrapped)|holding (?:each other|hands|her|him|the)|intertwined|straddl\w*|on (?:her|his) lap|sitting on (?:her|his)|on top of (?:her|him)|between (?:her|his|their) legs|lips? (?:touch\w*|lock\w*|press\w*)|pressed (?:close|together|against)|bodies (?:touch\w*|pressed|entwined)|touch\w* (?:her|his|each other)|into (?:her|his) mouth|lick\w*|suck\w*|finger\w*|grop\w*|caress\w*|fondl\w*|spoon\w*)\b/i;
export const contactOf = (prompt) => CONTACT.test(String(prompt || ''));
export function expressionOf(prompt) {
  return String(prompt || '').split(/(?<=[.;])\s+/).filter((s) => EXPRESSION.test(s)).slice(0, 2).map((s) => clip(s, 200)).join(' ');
}
export const faceText = (card, prompt = '') => [card.lora?.trigger, `close-up photo of the face of an ${WHO(card)}`, clip(visualSignature(card.look, 'neutral'), 260),
  expressionOf(prompt), 'exactly the same facial expression, mouth and eye direction as in the image', 'natural skin texture, real photo'].filter(Boolean).join(', ');

/**
 * LoRA dei personaggi in una foto a due (Krea 2 da testo). Con la LoRA di almeno uno: duoFaces = ritocco del volto
 * di ciascuno da solo (indice = posizione da sinistra, null = nessun ritocco) e niente parole chiave nella scena;
 * charLoras = riserva se sul PC manca il rilevamento dei volti (LoRA insieme nel grafo, più leggere).
 */
export function duoLoras(cards, family, mode = 'text2img') {
  const loras = family === 'krea2' && mode !== 'duo' ? cards.map((c) => (c?.lora?.file ? c.lora : null)) : [];
  const present = loras.filter(Boolean);
  if (!present.length) return { charLoras: [], duoFaces: undefined, trigger: '' };
  if (present.length === 1 && mode === 'text2img' && cards.length === 1) return { charLoras: present, duoFaces: undefined, trigger: present[0].trigger || '' };
  return {
    charLoras: present.map((l) => ({ ...l, strength: present.length > 1 ? Math.round((l.strength ?? 1) * 0.8 * 100) / 100 : l.strength ?? 1 })),
    duoFaces: cards.map((c, i) => (loras[i] ? { file: loras[i].file, strength: loras[i].strength ?? 1, text: faceText(c), body: bodyText(c) } : null)),
    trigger: '',
  };
}

/**
 * Ritocco dei volti, uno per persona, ognuno con la sua LoRA (foto a due su Krea 2). Va chiamata dopo applyPhotoStack,
 * senza le LoRA dei volti nella catena principale. faces[i] = volto i-esimo da sinistra (null = lascialo com'è).
 * Restituisce quanti volti ritocca (0 = grafo invariato).
 */
export function applyDuoFaces(graph, faces, { files = null, seed = 0, persons = false, single = false, level = 'neutral', prompt = '' } = {}) {
  const explicit = level === 'explicit';
  // prova sul PC 2026-10-10: nel bacio il ritocco della persona cambiava vestiti e posa e quello del volto girava il viso
  // verso la camera; senza l'espressione nel testo i sorrisi si spegnevano
  const contact = !single && DUO_FACES.contact !== false && contactOf(prompt);
  if (contact) persons = false;
  const expression = single || DUO_FACES.expression === false ? '' : expressionOf(prompt);
  const faceOf = (f) => (expression && f.text ? `${f.text}, ${expression}, exactly the same facial expression, mouth, eye direction and head angle as in the image` : f.text);
  if (bodyFamily(graph) !== 'krea2' || !faces?.some(Boolean)) return 0;
  const ids = Object.keys(graph);
  const save = ids.find((id) => graph[id].class_type === 'SaveImage');
  const clipId = ids.find((id) => graph[id].class_type === 'CLIPLoader');
  const vaeId = ids.find((id) => graph[id].class_type === 'VAELoader');
  const end = chainEnds(graph, 'krea2')[0];
  if (!save || !clipId || !vaeId || !end) return 0;
  let n = Math.max(0, ...ids.map(Number).filter(Number.isFinite)) + 100;
  const node = (class_type, inputs, title) => { const id = String(++n); graph[id] = { class_type, inputs, ...(title ? { _meta: { title } } : {}) }; return id; };
  let image = graph[save].inputs.images;
  // foto singola: la LoRA è già nella catena principale, il ritocco tiene quella (niente LoRA doppia)
  const keepFile = single ? findFile(files, faces[0]?.file) : null;
  const model = faceModel(graph, end, node, keepFile);
  const loras = single ? [keepFile ? model : null] : faces.map((f, i) => {
    const file = f?.file && findFile(files, f.file);
    return file ? node('LoraLoaderModelOnly', { model: [model, 0], lora_name: file, strength_model: f.strength ?? 1 }, `LoRA ${i + 1}`) : null;
  });
  // un ritocco per persona (i-esima da sinistra) con la sua LoRA, su una zona trovata da segs
  const fixOne = (i, segs, text, { denoise, label }) => {
    const pos = node('CLIPTextEncode', { clip: [clipId, 0], text: text || '' });
    const neg = node('ConditioningZeroOut', { conditioning: [pos, 0] });
    // foto a due: i-esima da sinistra; foto singola: il volto più grande
    const one = node('ImpactSEGSOrderedFilter', single
      ? { segs: [segs, 0], target: 'area(=w*h)', order: true, take_start: 0, take_count: 1 }
      : { segs: [segs, 0], target: 'x1', order: false, take_start: i, take_count: 1 });
    // foto singola: un volto già grande si lascia com'è (vedi SINGLE_FACE.maxFace). Il filtro misura il ritaglio
    // (volto × cropFactor), non il volto: Impact Pack 8.27 sul PC, 2026-10-10
    const only = single && SINGLE_FACE.maxFace && label === 'Ritocco volto'
      ? node('ImpactSEGSRangeFilter', { segs: [one, 0], target: 'height', mode: true, min_value: 0, max_value: Math.round(SINGLE_FACE.maxFace * DUO_FACES.cropFactor) }) : one;
    const fix = node('DetailerForEach', {
      image, segs: [only, 0], model: [loras[i], 0], clip: [clipId, 0], vae: [vaeId, 0], positive: [pos, 0], negative: [neg, 0],
      guide_size: DUO_FACES.guideSize, guide_size_for: true, max_size: DUO_FACES.guideSize, seed: seed + i, steps: DUO_FACES.steps, cfg: DUO_FACES.cfg,
      sampler_name: DUO_FACES.sampler, scheduler: DUO_FACES.scheduler, denoise, feather: DUO_FACES.feather,
      noise_mask: DUO_FACES.noiseMask ?? true, force_inpaint: true, wildcard: '', cycle: 1,
    }, `${label} ${i + 1}`);
    image = [fix, 0];
  };
  // 1. tutta la persona (fisico dalla LoRA), se c'è il modello che trova le persone
  if (persons) {
    const det = node('UltralyticsDetectorProvider', { model_name: DUO_BODY.model });
    const segs = node('SegmDetectorSEGS', { segm_detector: [det, 1], image, threshold: 0.5, dilation: 10, crop_factor: DUO_BODY.cropFactor, drop_size: DUO_BODY.dropSize, labels: 'all' });
    faces.forEach((f, i) => { if (loras[i]) fixOne(i, segs, f.body || f.text, { denoise: explicit ? DUO_BODY.explicitDenoise : DUO_BODY.denoise, label: 'Ritocco persona' }); });
  }
  // 2. il volto (somiglianza), trovato sull'immagine già ritoccata
  const det = node('UltralyticsDetectorProvider', { model_name: 'bbox/face_yolov8m.pt' });
  const segs = node('BboxDetectorSEGS', { bbox_detector: [det, 0], image, threshold: 0.5, dilation: 10, crop_factor: DUO_FACES.cropFactor, drop_size: 10, labels: 'all' });
  let done = 0;
  faces.forEach((f, i) => { if (loras[i]) { fixOne(i, segs, faceOf(f), { denoise: single ? faceDenoise(level) : contact ? DUO_FACES.contactDenoise : explicit ? DUO_FACES.explicitDenoise : DUO_FACES.denoise, label: 'Ritocco volto' }); done++; } });
  if (done) graph[save].inputs.images = image;
  return done;
}

/**
 * Modello per il ritocco: la catena della foto senza le LoRA che deformano un primo piano (corpo, NSFW, pose; vedi FACE_CHAIN).
 * keepFile: LoRA del personaggio già nella catena (foto singola). Se non c'è niente da togliere si usa la catena com'è.
 */
function faceModel(graph, end, node, keepFile = null) {
  if (FACE_CHAIN.full) return end;
  const chain = [];
  let cur = end;
  while (isLora(graph[cur] || {})) { chain.unshift(cur); cur = String(graph[cur].inputs.model[0]); }
  const keepFiles = (FACE_CHAIN.keep || []).map((k) => LORAS[k]?.file).filter(Boolean);
  const keep = (id) => {
    const f = base(graph[id].inputs.lora_name);
    return (FACE_CHAIN.lenovo && /lenovo/i.test(f)) || keepFiles.includes(f) || (keepFile && f === base(keepFile));
  };
  if (chain.every(keep)) return end;
  let prev = cur;
  for (const id of chain.filter(keep)) prev = node('LoraLoaderModelOnly', { ...graph[id].inputs, model: [prev, 0] }, `Ritocco: ${base(graph[id].inputs.lora_name)}`);
  return prev;
}

/** Foto con un solo personaggio con LoRA: ritocco del suo volto con la stessa LoRA (vedi SINGLE_FACE). */
/** Quanto ridisegnare il volto in una foto singola, per filtro. */
export const faceDenoise = (level) => SINGLE_FACE.denoise?.[level] ?? SINGLE_FACE.denoise?.neutral ?? 0.35;

export function applySingleFace(graph, card, { files = null, seed = 0, prompt = '', level = 'neutral' } = {}) {
  if (!SINGLE_FACE.on || !card?.lora?.file) return 0;
  return applyDuoFaces(graph, [{ file: card.lora.file, text: faceText(card, prompt) }], { files, seed, single: true, level });
}

/** Cosa scrivere sotto la foto: «Esplicito · scena intima». */
export const levelText = (media) => (media?.level ? `${LEVEL_LABEL[media.level]}${media.levelReason ? ` · ${media.levelReason}` : ''}` : '');

/** LoRA del personaggio (volto coerente): { file, trigger, strength } o null. */
export function normalizeCharLora(l) {
  if (!l || typeof l !== 'object') return null;
  const file = String(l.file || '').trim().replace(/\\/g, '/').slice(0, 200);
  if (!file || file.includes('..') || !/\.safetensors?$/i.test(file)) return null;
  const n = Number(l.strength);
  return { file, trigger: String(l.trigger || '').trim().slice(0, 60), strength: Number.isFinite(n) && n ? Math.round(Math.min(2, Math.max(0, n)) * 100) / 100 : 1 };
}

const base = (f) => String(f || '').replace(/\\/g, '/').split('/').pop();
const findFile = (files, want) => (files || []).find((f) => base(f) === base(want)) || null;
const isLora = (n) => n.class_type === 'LoraLoaderModelOnly';
const REALISM_FILES = Object.values(LORAS).filter((l) => l.role === 'realism').map((l) => l.file);

/**
 * 4. Lenovo, LoRA del corpo, LoRA di supporto di Krea 2 e del personaggio nel grafo.
 * files: LoRA installate su ComfyUI (null = non si sa: niente aggiunte). bodyLoras: [{ part, name, strength }] già installate.
 * stack: applica il profilo di krea2.js (solo testo → immagine e image to image, non i ritocchi dei grafi Qwen).
 * Restituisce cosa è stato messo, per la foto e il banco di prova.
 */
export function applyPhotoStack(graph, { level = 'neutral', lenovo = null, lenovoFile = null, bodyLoras = [], charLora = null, charLoras = [], prompt = '', files = null, variant = null, stack = true, sampler = true } = {}) {
  const family = bodyFamily(graph);
  const out = { family, lenovo: null, loras: [], missing: [], sampler: null };
  if (!family) return out;
  if (!hasLenovo(family)) { out.lenovo = applyLenovo(graph, family, false); return out; }   // Z-Image grezzo

  // Lenovo: true/false scelto (chat e social: di default sì), null = come nel workflow
  out.lenovo = applyLenovo(graph, family, lenovo, lenovoFile);
  const profile = profileFor(level, variant);
  const ends = () => chainEnds(graph, family);
  const add = (file, strength, title) => { for (const end of ends()) insertAfter(graph, end, { class_type: 'LoraLoaderModelOnly', _meta: { title }, inputs: { lora_name: file, strength_model: strength } }); };

  if (stack) {
    const want = Object.entries(profile.loras).filter(([key]) => LORAS[key]);
    // HMNSFW solo se il prompt comincia con i suoi token
    const usable = want.filter(([key]) => key !== 'hmnsfw' || /^\s*HMNSFW\b/.test(prompt));
    // Realismo: una sola, al posto di quella del workflow (che resta se quella del profilo non è installata)
    const realism = usable.find(([key]) => LORAS[key].role === 'realism');
    const realismNodes = Object.keys(graph).filter((id) => isLora(graph[id]) && REALISM_FILES.includes(base(graph[id].inputs.lora_name)));
    const realismHere = realism && (findFile(files, LORAS[realism[0]].file) || realismNodes.some((id) => base(graph[id].inputs.lora_name) === LORAS[realism[0]].file));
    if (!realism || realismHere) for (const id of realismNodes.filter((id) => base(graph[id].inputs.lora_name) !== LORAS[realism?.[0]]?.file)) removeLora(graph, id);
    for (const [key, strength] of usable) {
      const def = LORAS[key];
      if (def.role === 'realism' && realism?.[0] !== key) continue;
      // già nel grafo (es. anti-rifiuto di Krea 2 Turbo): si regola la forza
      const present = Object.keys(graph).filter((id) => isLora(graph[id]) && base(graph[id].inputs.lora_name) === def.file);
      if (present.length) { for (const id of present) graph[id].inputs.strength_model = strength; out.loras.push({ key, label: def.label, strength }); continue; }
      const file = findFile(files, def.file);
      if (!file) { out.missing.push(def.file); continue; }
      add(file, strength, def.label);
      out.loras.push({ key, label: def.label, strength });
    }
    // realismo del profilo non installato: resta quello del workflow, e si dice
    if (realism && !realismHere) {
      for (const id of realismNodes) {
        const key = Object.keys(LORAS).find((k) => LORAS[k].file === base(graph[id].inputs.lora_name));
        out.loras.unshift({ key, label: LORAS[key].label, strength: graph[id].inputs.strength_model });
      }
    }
    if (sampler && profile.sampler) out.sampler = setSampler(graph, family, profile.sampler);
  }

  // Volto dei personaggi (uno, o due nelle foto insieme)
  for (const cl of [charLora, ...(charLoras || [])].filter((l) => l?.file)) {
    const file = findFile(files, cl.file);
    if (file) { add(file, cl.strength ?? 1, 'Personaggio'); out.loras.push({ key: 'character', label: base(cl.file).replace(/\.safetensors?$/i, ''), strength: cl.strength ?? 1 }); }
    else out.missing.push(cl.file);
  }

  // Corpo (scalato per filtro)
  if (bodyLoras?.length && hasBodyLoras(family)) {
    const k = profile.bodyScale ?? 1;
    const scaled = bodyLoras.map((l) => ({ ...l, strength: Math.round(l.strength * k * 10) / 10 })).filter((l) => l.strength);
    if (applyBodyLoras(graph, scaled, family)) out.body = scaled.map(({ part, strength }) => ({ part, strength }));
  }
  return out;
}

/** Passi/scheduler/cfg del KSampler principale di Krea 2 (quello a denoise 1 alimentato dalla catena del modello). */
function setSampler(graph, family, s) {
  const unet = Object.keys(graph).filter((id) => graph[id].class_type === 'UNETLoader' && FAMILIES[family].unet.test(base(graph[id].inputs?.unet_name)));
  const fromKrea = (id, seen = new Set()) => {
    if (unet.includes(id)) return true;
    if (seen.has(id) || !graph[id]) return false;
    seen.add(id);
    const m = graph[id].inputs?.model;
    return Array.isArray(m) && fromKrea(String(m[0]), seen);
  };
  for (const n of Object.values(graph)) {
    if (n.class_type !== 'KSampler' || Number(n.inputs.denoise) !== 1 || !Array.isArray(n.inputs.model) || !fromKrea(String(n.inputs.model[0]))) continue;
    for (const k of ['steps', 'scheduler', 'cfg', 'sampler_name']) if (s[k] !== undefined) n.inputs[k] = s[k];
    return { steps: n.inputs.steps, scheduler: n.inputs.scheduler, cfg: n.inputs.cfg };
  }
  return null;
}
