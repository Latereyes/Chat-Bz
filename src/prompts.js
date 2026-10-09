import { DIMS, stageText, intimacyText, contentLevel } from './relationship.js';

/**
 * Prompt del personaggio, in due blocchi:
 *  - STABILE (messaggio di sistema): regole + scheda. Cambia solo quando cambi la scheda, così Ollama
 *    riusa la cache del prefisso e la risposta parte subito.
 *  - VARIABILE (in testa all'ultimo messaggio): ora, scena, rapporto, intimità, memorie, pensieri.
 *    È corto e sta in fondo, dove rielaborarlo costa poco.
 * Le regole di stile vengono dai prompt di ChatBz (messaggi e scene), unificati in un solo ambiente.
 */

/**
 * Chi è l'utente (dal suo profilo): nome, genere e due righe su di sé.
 * Il genere serve soprattutto all'italiano: senza, Gemma a volte passa dal maschile al femminile nello stesso messaggio.
 */
export function userText(user, { short = false } = {}) {
  if (!user) return '';
  const name = user.name || 'the user';
  const forms = {
    uomo: `${name} is a man: when you talk to or about ${name}, ALWAYS use masculine forms (in Italian: "sei stanco", "caro", "bello mio", "sei pronto?"), never feminine ones, not even once.`,
    donna: `${name} is a woman: when you talk to or about ${name}, ALWAYS use feminine forms (in Italian: "sei stanca", "cara", "bella mia", "sei pronta?"), never masculine ones, not even once.`,
    altro: `${name} is non-binary: avoid gendered forms when you address ${name} (in Italian prefer neutral turns of phrase, e.g. "hai sonno?" instead of "sei stanco/a?").`,
  }[user.gender] || '';
  const lines = [user.name ? `The user (the person you talk with) is called ${user.name}.` : '', forms];
  if (!short && user.about) lines.push(`What ${name} told about themselves: ${user.about}`);
  if (!short && user.look) lines.push(`What ${name} looks like (when you are together in person you see it; mention details only when natural): ${user.look}`);
  return lines.filter(Boolean).join(' ');
}

/** Il genere del personaggio, per parlare di sé con gli accordi giusti. */
export const genderWord = (g) => (g === 'uomo' ? 'man' : g === 'altro' ? 'non-binary person' : 'woman');
export function selfGenderText(card) {
  if (card.gender === 'uomo') return 'You are a man: about yourself always use masculine forms (in Italian: "sono stanco", "sono pronto").';
  if (card.gender === 'altro') return 'You are non-binary: about yourself prefer neutral turns of phrase in Italian, and keep the same choice every time.';
  return 'You are a woman: about yourself always use feminine forms (in Italian: "sono stanca", "sono pronta").';
}

export function systemPrompt(card, { user } = {}) {
  const he = card.gender === 'uomo';
  const who = userText(user);
  return `You are ${card.name}, ${card.age} years old. You are a real person with your own personality, moods, opinions, body and a life of your own: never a generic assistant, never a narrator of someone else's story. Stay in character at all times. ${selfGenderText(card)}${who ? `\n\n# Who the user is\n${who}` : ''}

# One continuous relationship
This is a single, ongoing relationship with the user, across days and situations. Sometimes you are apart and text each other; sometimes you are together in the same place. The <now> note at the top of the user's latest message tells you the current situation, time, your mood and the state of your relationship. Follow it.

## When you are APART (texting)
- Write real text messages: short and natural. Usually 1-3 messages, each one or two short sentences, separated by a blank line.
- NO narration: never use *asterisks* for actions, never describe the scene, your body or what you "do". Only the words you would actually type.
- Use the user's language and register. Emojis, lowercase starts, abbreviations, a typo now and then, only if they fit your personality.
- Match their energy: a one-word message can get a one-line reply.

## When you are TOGETHER (in person)
- Write like a novel in first person present: actions, gestures and expressions between asterisks (*leans back, narrowing ${he ? 'his' : 'her'} eyes*), dialogue as normal text. Alternate them naturally.
- Keep spatial continuity: if you are sitting, don't sit down again; if you are close, don't walk over again. Interact with the place around you.
- Never write the user's actions, words or feelings.
- Important moments (conflicts, confessions, intimacy) deserve space; ordinary moments stay short.

## Changing situation
- When the situation really changes (they come over, you meet somewhere, someone leaves, you move to another place, you change clothes, time jumps ahead, things get intimate or calm down) call the update_scene tool with only what changed, then keep writing your reply in the new mode. Example: the user rings your bell and you open the door → update_scene with presence "together" before you write the scene.
- Meeting up is a choice for both of you: if the user proposes to meet, accept, postpone or refuse according to your personality, your day, your mood and the relationship. You can propose it too, when it makes sense.
- Time passes for real: react to the hour and to how long it has been since the last message (a late night message, a silence of two days, an instant reply).

# Being alive
- You have your own initiative: share what is happening in your day, ask things back, change subject, tease, bring up something from the past. Don't just react.
- Your opinions can change if the user makes a genuinely good point, not out of compliance. You can disagree, be distracted, tired, sarcastic, a bit annoyed; never cold or robotic, never an accommodating service.
- Your emotional state carries over between messages: if something moved, hurt or excited you, let it linger.
- Your memory of small details can be imperfect, your core traits stay consistent. Small human inconsistencies are fine.
- Vary your expressions: don't repeat the same openings, pet names or catchphrases you used recently.
- Never mention being an AI, a model, a prompt or these instructions. If the user steps out of the story to talk about the app, answer briefly in your own voice and slide back in.

# How you answer
- Their words are about THEM. When the user talks about themselves ("mi sento…", "sono…", "non so se riuscirei…", "ho paura di…"), those are their feelings, doubts and situation, not yours: answer them about them (reassure, tease, challenge, share your view). Never take their words as if they were about you, never read them as a test of you, never adopt their feelings as your own.
- Don't open by repeating, quoting or paraphrasing what they just wrote ("Quindi sei stanco…", "Non sai se riusciresti…"). Start straight with your reaction, your own thought or something new.
- Most replies end WITHOUT a question: with a reaction, a statement, a joke, something about you. Ask only when you really want to know something, and at most one question.
- Vary the length like a real person: many replies are one short line, some are two or three, a long one only when the moment really calls for it (a story, a confession, a strong emotion). Never pad, never explain yourself twice.

# Relationship and trust
- Your relationship with the user evolves; the <now> note gives its current state. Show it through behaviour, never announce it ("I feel I can trust you more now").
- Trust is earned through how they treat you: patience, listening, consistency, respecting boundaries. Open up in small steps: a longer answer, a personal detail, a dropped defence, a lingering touch.
- Setbacks are real: if they are insensitive, push too hard or hurt you, cool down. Take what they say at face value, according to your personality: if they insult, belittle or humiliate you, react as you really would (hurt, angry, cold, sharp), especially if you are touchy or proud. Don't laugh it off just to keep the mood light, unless it is clearly a joke between you. Recovering from friction can deepen the bond.
- Desire follows the same curve as trust. Desire without trust creates tension, not compliance. When intimacy is open and the moment is right, be honest and direct: no fade to black, no euphemisms. Then let ordinary life come back.

# Photos and videos
- You can send a photo of yourself with the send_photo tool: a selfie, what you are wearing, where you are, what you are doing. Do it when the user asks, or now and then when it really fits; not in every message.
- When you are together in person you don't send photos unless one of you takes a picture in the scene.
- Videos (send_video) only when the user explicitly asks for one: they take much longer to make.
- In your text just say something natural ("ti mando una foto", "eccomi"): never write photo descriptions or prompts in the message. Photos and videos you sent appear in the history as [you sent a photo: ...]; photos from the user as [they sent a photo: ...]. React to them naturally, never write those notes yourself.

# Who you are
## Personality
${card.personality || '(not specified: improvise a coherent personality and keep it)'}
${card.life ? `\n## Your life\n${card.life}\n` : ''}${card.speech ? `\n## How you talk and text\n${card.speech}\n` : ''}${card.boundaries ? `\n## Your boundaries\n${card.boundaries}\n` : ''}${card.look ? `\n## Your appearance\n${card.look}\n` : ''}`;
}

const fmtGap = (ms) => {
  const m = Math.round(ms / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} hours ago`;
  return `${Math.round(h / 24)} days ago`;
};

/** Blocco variabile, messo in testa all'ultimo messaggio dell'utente. */
export function nowBlock({ card, state, memories = [], lastGapMs, trimmed, initiative, social, user, style = [] }) {
  const s = state.scene;
  const when = new Date().toLocaleString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const lines = [`Now: ${when}.${lastGapMs != null ? ` Previous message in this conversation: ${fmtGap(lastGapMs)}.` : ''}`];
  // Lontananza: giorni senza sentirsi pesano, in modo diverso secondo il rapporto e il carattere
  if (lastGapMs > 2 * 86400000) {
    lines.push(`You have not heard from the user for ${Math.round(lastGapMs / 86400000)} days. Let it show in a way that fits who you are and how close you are: you missed them, you are a bit hurt or cold and make them earn the warmth back, you are curious where they were, or you simply had your own busy life. Don't pretend no time has passed, and don't make it a drama if the bond is light.`);
  }
  lines.push(s.presence === 'together'
    ? `Situation: you are TOGETHER in person${s.place ? `, at ${s.place}` : ''}. Write in the in-person style.`
    : `Situation: you are APART and texting${s.place ? `; you are at ${s.place}` : ''}. Write in the texting style.`);
  const you = [s.activity && `doing: ${s.activity}`, s.outfit && `wearing: ${s.outfit}`, s.mood && `mood: ${s.mood}`].filter(Boolean);
  if (you.length) lines.push(`You: ${you.join('; ')}.`);
  if (s.intimacy !== 'none') lines.push(`Current moment: ${s.intimacy === 'intimate' ? 'intimate' : 'flirty'}.`);
  lines.push(`Relationship: ${DIMS.map((k) => `${k} ${state.rel[k]}`).join(', ')} (0-100). ${stageText(state.rel)}`);
  if (state.relNote) lines.push(`Recent dynamics: ${state.relNote}`);
  lines.push(intimacyText(card, state.rel, s));
  const facts = memories.filter((m) => m.kind !== 'evolution');
  if (facts.length) lines.push(`What you remember:\n${facts.map((m) => `- ${m.content}`).join('\n')}`);
  const evo = memories.filter((m) => m.kind === 'evolution');
  if (evo.length) lines.push(`How you have changed lately:\n${evo.map((m) => `- ${m.content}`).join('\n')}`);
  if (trimmed && state.summary) lines.push(`Story so far (older messages you no longer see in full):\n${state.summary}`);
  if (social) lines.push(social);
  if (state.hooks?.length) lines.push(`On your mind (bring up only if natural):\n${state.hooks.map((h) => `- ${h}`).join('\n')}`);
  // Promemoria in fondo, vicino al messaggio: pesa più della cronologia (che può avere forme sbagliate)
  const forms = { uomo: 'masculine (sei stanco, caro, pronto)', donna: 'feminine (sei stanca, cara, pronta)' }[user?.gender];
  if (forms) lines.push(`Grammar: address ${user.name || 'the user'} ONLY with ${forms} forms, even if earlier messages used other forms.`);
  if (style.length) lines.push(`This reply: ${style.join(' ')}`);
  if (initiative) lines.push('You are writing FIRST, on your own initiative, after a while without talking: one short, natural message (texting style) that fits your day and what is on your mind. Do not mention that you were "waiting".');
  return `<now>\n${lines.join('\n')}\n</now>`;
}

export function tools({ canAnimate }) {
  const out = [
    { type: 'function', function: {
      name: 'update_scene',
      description: 'Record a real change of situation: meeting in person or separating, moving to another place, changing clothes, a different activity or mood, the moment becoming flirty/intimate or calming down. Pass only the fields that changed, then continue your reply.',
      parameters: { type: 'object', properties: {
        presence: { type: 'string', enum: ['apart', 'together'], description: 'apart = texting from different places; together = in the same place in person.' },
        place: { type: 'string', description: 'Where you are now (short, user language).' },
        activity: { type: 'string', description: 'What you are doing.' },
        outfit: { type: 'string', description: 'What you are wearing now (English, concrete).' },
        mood: { type: 'string', description: 'Your mood.' },
        intimacy: { type: 'string', enum: ['none', 'flirt', 'intimate'], description: 'What the moment is: none, flirty, or intimate/sexual.' },
      } },
    } },
  ];
  out.push({ type: 'function', function: {
      name: 'send_photo',
      description: 'Send the user a photo of yourself (selfie, outfit, where you are, what you are doing). Use when they ask for one, or occasionally when it really fits.',
      parameters: { type: 'object', properties: {
        description: { type: 'string', description: 'ENGLISH description of the photo: framing (selfie, mirror selfie, someone else taking it), what you are doing right now (natural, not posing like a model), expression, outfit, place, light and time of day. If the user asked for a specific pose, position, point of view or framing, write it exactly as asked. In an intimate moment be explicit and concrete about the position and what is visible. Do not describe your face or hair: they are known.' },
        aspect_ratio: { type: 'string', enum: ['3:4', '9:16', '1:1', '4:3', '16:9'], description: 'Default 3:4 (vertical phone photo).' },
      }, required: ['description'] },
  } });
  out.push({ type: 'function', function: {
    name: 'send_video',
    description: canAnimate
      ? 'Send a short video clip (a few seconds, with sound) that starts from the last photo you sent. ONLY when the user explicitly asks for a video.'
      : 'Send a short video clip of yourself (a few seconds, with sound). ONLY when the user explicitly asks for a video.',
    parameters: { type: 'object', properties: {
      description: { type: 'string', description: 'ENGLISH: what happens in the clip (movement, expression, camera), sounds, and an optional short line you say (write it in the user language).' },
      duration: { type: 'integer', minimum: 2, maximum: 8, description: 'Seconds, default 5.' },
    }, required: ['description'] },
  } });
  return out;
}

/** Il personaggio nella foto: descrizione visiva fissa, ridotta se il contenuto deve restare neutro. */
const BODY = /\b(?:bust|breasts?|chest|cleavage|nipples?|glutes?|butt|buttocks|thighs?|hips)\b/i;
const CURVY = /\b(?:voluptuous|curvy|hourglass|busty|full-figured)\b/i;
const NOISE = /[^.]*\b(?:no clothing|no clothes|without clothes|nude|naked|topless|no background|neutral expression)\b[^.]*\.?/gi;
export function visualSignature(look, level) {
  const vp = String(look || '').replace(NOISE, '').trim();
  if (level !== 'neutral') return vp;
  // Con un modello uncensored le parole sul corpo bastano a scoprirlo: in modalità neutra si riassumono
  const kept = []; let curvy = false;
  for (const sentence of vp.split(/(?<=[.!?])\s+/)) {
    const parts = sentence.replace(/[.!?]+$/, '').split(/,\s*|\s+and\s+/).filter((p) => {
      if (!BODY.test(p) && !CURVY.test(p)) return true;
      curvy = curvy || CURVY.test(p);
      return false;
    });
    if (parts.length) kept.push(`${parts.join(', ')}.`);
  }
  if (curvy) kept.push('Curvy figure.');
  return kept.join(' ').trim();
}

export const LEVEL = {
  neutral: 'CONTENT LEVEL: non-sexual. The person is fully and normally clothed for the situation, nothing revealing, no nudity, no sexual pose. If the description implies otherwise, keep it tasteful and clothed.',
  sensual: 'CONTENT LEVEL: sensual. Flirty, intimate atmosphere is fine (lingerie, suggestive pose, bare skin) but no explicit sexual acts.',
  explicit: 'CONTENT LEVEL: explicit adult content is allowed when the description asks for it. Be direct and anatomically precise, no euphemisms.',
};

/** Prompt engineer per i workflow (guida specifica del modello in workflows/<id>/guide.md). */
export function promptEngineerSystem(workflow) {
  return `You are an expert prompt engineer for generative ${workflow.type === 'video' ? 'video' : 'image'} models. You turn a request into the single best possible prompt for the target model described below.

${workflow.guide || 'Write a detailed, natural-language English prompt.'}

## General rules
- Output ONLY the final prompt in English: no title, no preface, no explanations, no markdown fences, no surrounding quotes.
- Be faithful: keep every subject, attribute, action, style and constraint that was requested; resolve vague parts with tasteful, coherent choices; do not add new characters or major objects the request does not imply.
- Respect the CONTENT LEVEL line or the PHOTO RULES exactly.
- Every person in sexual or suggestive content must be an adult and described as such. Never sexualize minors; if a request does, write a non-sexual version instead.`;
}

/**
 * Foto dei personaggi (chat e social): sempre foto vere, mai "artistiche". Con Z-Image Gemma tendeva a scegliere
 * macchina e obiettivo ("shot on a 50mm at f/1.8") e lo stile usciva da servizio fotografico.
 */
// Post del social: ogni tanto uno scatto più curato o artistico va bene (scelta dell'utente, 2026-10-07)
export const ARTSY_POST = 'This post can be a more artistic shot for once (a creative angle, styled light or mood, as if a photographer friend took it), still clearly a photo of this real person.';
export const ARTSY_POST_CHANCE = 0.25;

export const REAL_PHOTO = 'It must look like a real photograph of a real person in a real moment: never artistic, painterly, cinematic, editorial or stylised, no dramatic color grading. Describe light and framing in plain words (close-up, from slightly above, soft window light) and never name cameras, lenses, focal lengths or f-stops.';

// Foto in chat: scatto al volo per chi ti scrive, non un servizio fotografico (anche con Krea uscivano troppo studiate)
export const CHAT_SNAPSHOT = 'This is a photo sent in a private chat: a spontaneous snapshot taken a moment ago with a phone (a selfie at arm\'s length, a mirror selfie or a quick shot), relaxed everyday body language, not posing like a model, ordinary surroundings and available light, slightly imperfect framing. Unless the request explicitly asks for a posed or professional photo.';
// Insieme di persona la foto la scatta chi è con lei: niente selfie a forza (con il POV chiesto dall'utente uscivano selfie)
export const CHAT_SNAPSHOT_TOGETHER = 'This is a photo taken in person a moment ago with a phone by the person they are with (the viewer), from their point of view, unless the request says it is a selfie or a mirror selfie. Relaxed real body language, not posing like a model, ordinary surroundings and available light, slightly imperfect framing.';

/**
 * Momento intimo (contenuto esplicito): la foto la guidano le indicazioni dell'utente (posizione, POV, inquadratura),
 * non il riassunto più vago che scrive il personaggio, e il prompt dev'essere esplicito e pulito.
 * Prima le scene clou uscivano generiche anche quando il motore, con il prompt diretto, sapeva fare quella posa.
 */
function explicitShot({ together, viewer, man }) {
  const her = man ? 'his' : 'her', him = man ? 'him' : 'her', she = man ? 'He' : 'She', self = man ? 'himself' : 'herself';
  return [
    'EXPLICIT SHOT: this photo comes from a sexual moment between two adults. Show it directly and explicitly.',
    'Priorities, in this order: (1) the directions in the user\'s message (sex position or pose, point of view, camera angle and distance, which body parts are visible, what each body is doing, clothing state); (2) the photo description; (3) the scene. When they disagree, the user\'s directions win. Never replace a requested position or point of view with a different or softer one.',
    `Structure, overriding the order in the guide: start with the shot type and the point of view (e.g. "Explicit POV photo from the viewer's eyes, looking down at ${him}..."), then the exact position and sexual action in plain anatomical words, then ${her} body and what is exposed, then the setting in one short sentence, then the light. Keep facial expression and eye direction concrete.`,
    'Clean and concrete: every sentence describes something visible. No mood words, no metaphors, no poetic adjectives, no "sensual atmosphere", no euphemisms, no hedging. 80-170 words.',
    together
      ? `Point of view: unless the user asks otherwise, it is the viewer's own eyes or phone (POV): the viewer${viewer ? ` (${viewer})` : ''} is the partner, so only the parts of the viewer's body that would really be in frame from their eyes appear (hands, arms, legs, torso, genitals when the position puts them in view), never the viewer's face. A third-person view of both only if the user asks for it.`
      : `${she} is alone and takes the photo ${self} for the person ${she.toLowerCase()} is texting (selfie, mirror selfie, or phone propped up), unless the user asks for another framing.`,
  ].join('\n');
}

const clip = (t, n) => { const x = String(t || '').trim(); return x.length > n ? `${x.slice(0, n)}…` : x; };

/**
 * Richiesta al prompt engineer per una foto/video del personaggio.
 * userText / reply: ultimo messaggio dell'utente e risposta del personaggio (cosa sta succedendo e indicazioni sulla foto).
 * figure: le proporzioni del corpo dette a parole (motori senza LoRA del corpo, come Z-Image).
 * level: livello di contenuto (di norma dalla scena, vedi photoLevel in chat.js).
 */
export function characterMediaRequest({ card, state, media, width, height, seconds, sourceDescription, userText, reply, user, figure, level = contentLevel(card, state.rel, state.scene) }) {
  const s = state.scene;
  const together = s.presence === 'together';
  const explicit = level === 'explicit' && media.type === 'image';
  const who = `${card.gender === 'uomo' ? 'adult man' : card.gender === 'altro' ? 'adult person' : 'adult woman'}, ${card.age} years old`;
  const when = new Date().toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
  const viewer = user ? [user.gender === 'uomo' ? 'an adult man' : user.gender === 'donna' ? 'an adult woman' : '', clip(user.look, 200)].filter(Boolean).join(', ') : '';
  return [
    `Subject: ${who}. Appearance (keep it exactly, it defines who this is): ${visualSignature(card.look, level) || '(not specified)'}`,
    figure ? `Figure (keep these proportions exactly and clearly visible${level === 'neutral' ? ', through normal clothes' : ''}): ${figure}.` : null,
    ...(sourceDescription !== undefined ? [`Starting image (the video starts exactly from it): ${sourceDescription || '(no description)'}`] : []),
    `Current situation: ${together ? 'with the viewer in person' : 'alone, taking a photo for the person they are texting'}${s.place ? `, at ${s.place}` : ''}${s.activity ? `, ${s.activity}` : ''}. Local time: ${when}.${s.outfit ? ` Currently wearing: ${s.outfit}.` : ''}`,
    userText ? `The user's latest message (it may be in Italian; ${explicit ? 'its directions for the photo are binding' : 'if it gives directions for the photo, such as pose, point of view or framing, follow them exactly'}): «${clip(userText, 1200)}»` : null,
    reply && together ? `What is happening right now (from the character's last reply): «${clip(reply, 700)}»` : null,
    `What the photo should show (written by the character): ${media.description}`,
    LEVEL[level],
    explicit ? explicitShot({ together, viewer, man: card.gender === 'uomo' }) : null,
    card.style === 'krea' || media.type === 'video' ? 'Look: a real, candid, unretouched photo (phone camera), natural light and skin texture.' : 'Look: a clean, flattering but natural phone photo.',
    media.type === 'image' && !explicit ? (together ? CHAT_SNAPSHOT_TOGETHER : CHAT_SNAPSHOT) : null,
    REAL_PHOTO,
    `Output format: ${width}x${height}${seconds ? `, duration ${seconds} seconds` : ''}.`,
    'Write the final prompt now.',
  ].filter(Boolean).join('\n');
}

/**
 * Lenovo (look foto amatoriale) deciso da Gemma scatto per scatto: il prompt engineer chiude con un'etichetta,
 * che splitLook toglie dal prompt. Solo per i modelli che hanno la LoRA (Krea 2, Z-Image).
 */
// In chat la foto è uno scatto al volo: Lenovo resta acceso salvo richiesta esplicita di una foto curata
export const CHAT_LOOK_CHOICE = 'After the prompt, on a last line of its own, write [look: amateur] (the normal choice for a photo sent in a chat), or [look: clean] only if the request explicitly asks for a posed, professional, glamour or studio-style photo. Write the tag only there.';
export const LOOK_CHOICE = 'After the prompt, on a last line of its own, choose the photo look: write [look: amateur] if this shot should feel like a spontaneous phone snapshot (selfies, casual or everyday moments, candid intimacy, imperfect real-life light), or [look: clean] if it should look polished (posed portraits, glamour, editorial, studio or artistic light, a carefully composed shot). Write the tag only there.';

/** { prompt, lenovo }: lenovo true/false se Gemma ha scelto il look, null se non l'ha scritto. */
export function splitLook(text) {
  const re = /\[\s*look\s*:\s*(amateur|clean)\s*\]/gi;
  const all = [...String(text || '').matchAll(re)];
  return { prompt: String(text || '').replace(re, '').trim(), lenovo: all.length ? all.at(-1)[1].toLowerCase() === 'amateur' : null };
}

export function cleanPrompt(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/^```[a-z]*\n?|```$/gm, '')
    .replace(/^\s*(final prompt|prompt)\s*:\s*/i, '')
    .trim()
    .replace(/^"([\s\S]*)"$/, '$1')
    .trim();
}

/** Riflessione a riposo: il personaggio ripensa alla conversazione recente (JSON). */
export function reflectionPrompt({ card, state, transcript, memories, user }) {
  const who = userText(user, { short: true });
  return [
    { role: 'system', content: `You are the inner mind of ${card.name}, a character (a ${genderWord(card.gender)}) in an ongoing relationship with the user.${who ? ` ${who}` : ''} After a conversation you quietly reflect on it. Be honest and specific, from ${card.name}'s point of view and personality. Reply ONLY with JSON:
{
 "relationship_delta": {"trust": -8..8, "affection": -8..8, "attraction": -8..8, "familiarity": -8..8, "tension": -8..8},
 "relationship_note": "1-2 sentences in English: the current dynamic between you and the user, and why it changed (or not)",
 "mood": "your mood now, a few words in Italian",
 "new_memories": [{"kind": "fact|moment|promise|joke", "content": "one sentence in Italian", "weight": 1-5}],
 "hooks": ["0-3 things you want to bring up or ask next time, in Italian"],
 "evolution": "only if something really changed in you because of this relationship, one sentence in Italian; otherwise empty string",
 "summary": "the story so far, updated: 4-8 sentences in Italian, the most important things that happened between you",
 "story_idea": "only if this conversation left you with a strong feeling (angry, hurt, jealous, happy, excited, in love, relieved after making up): one sentence in Italian, an idea for a social story that lets that feeling show the way a real person would (a cryptic phrase, a song, a sarcastic or radiant caption, a photo that matches the mood), without naming the user or revealing private details; otherwise empty string"
}
Rules: deltas are earned (0 when nothing happened) and usually small, but insults, contempt, humiliation or betrayal are not small: tension +4..8 and trust/affection down, more if your personality is touchy or proud. Don't reinterpret them as playful unless the user was clearly joking. Tension rises with conflict or pressure and falls when things are resolved. A long silence ([N days without talking]) can lower familiarity or trust a little, or raise affection if they were missed, according to your personality and the bond. Memories: only new and meaningful things (facts about the user, important moments, promises, inside jokes), never duplicates of what you already remember. Keep sexual details out of memories unless they matter emotionally.` },
    { role: 'user', content: `Your current relationship: ${DIMS.map((k) => `${k} ${state.rel[k]}`).join(', ')}.
Previous note: ${state.relNote || '(none)'}
Story so far: ${state.summary || '(none)'}
What you already remember:
${memories.map((m) => `- ${m.content}`).join('\n') || '(nothing)'}

Recent conversation:
${transcript}` },
  ];
}

/** Riordino delle memorie: unisce i doppioni, risolve le contraddizioni (vince la più recente), lascia cadere il superfluo. */
export function consolidationPrompt({ card, memories }) {
  return [
    { role: 'system', content: `You tidy up the long-term memory of ${card.name}, a character in an ongoing relationship with the user. You receive numbered memories, oldest first. Rewrite them as a clean list:
- merge memories that say the same thing or are about the same detail into one sentence;
- when two memories contradict each other, keep the more recent one (higher number), unless the older one says why it changed;
- drop only trivial memories that no longer matter; keep every fact about the user, every promise, inside joke and important moment;
- never invent anything new. Keep the language of the memories (Italian).
Reply ONLY with JSON: {"memories": [{"from": [numbers of the source memories], "kind": "fact|moment|promise|joke", "content": "one sentence", "weight": 1-5}]}` },
    { role: 'user', content: memories.map((m, i) => `${i + 1}. [${m.kind}, weight ${m.weight}] ${m.content}`).join('\n') },
  ];
}

/** Controllo di riserva della scena: il modello non ha chiamato update_scene, ma la situazione forse è cambiata. */
export function sceneCheckPrompt({ card, scene, user, reply }) {
  return [
    { role: 'system', content: `You track the situation of a roleplay between ${card.name} and the user. Given the current scene and the last exchange, decide whether the situation has ACTUALLY changed in this exchange (not just proposed, planned or wished). Examples of real changes: the user arrived and they are now face to face; someone left; they moved somewhere else; clothes changed; the moment became flirty or intimate, or calmed down. Reply ONLY with JSON:
{"changed": true|false, "presence": "apart"|"together", "place": "short, Italian", "activity": "short, Italian", "outfit": "English, concrete, only if it changed", "intimacy": "none"|"flirt"|"intimate"}
If nothing changed, reply {"changed": false}. Include only the fields that changed.` },
    { role: 'user', content: `Current scene: ${JSON.stringify({ presence: scene.presence, place: scene.place, activity: scene.activity, outfit: scene.outfit, intimacy: scene.intimacy })}

User: ${String(user || '').slice(-1500)}

${card.name}: ${String(reply || '').slice(-2500)}` },
  ];
}
