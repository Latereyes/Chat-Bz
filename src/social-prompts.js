import { LEVEL, visualSignature } from './prompts.js';
import { stageText } from './relationship.js';

/**
 * Prompt del social: profilo, post e storie scritti dal personaggio, commenti e risposte.
 * Lo stile viene dal social di ChatBz 1 (voce in prima persona, dettagli concreti, niente slogan),
 * con in più il suo "mondo" ricorrente e le persone che conosce nell'app.
 */

const short = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const he = (card) => (card.gender === 'uomo' ? 'adult man' : card.gender === 'altro' ? 'adult person' : 'adult woman');

export function momentText(date = new Date()) {
  const h = date.getHours();
  const part = h < 6 ? 'night' : h < 9 ? 'early morning' : h < 12 ? 'morning' : h < 15 ? 'midday' : h < 19 ? 'afternoon' : h < 23 ? 'evening' : 'late night';
  return `${date.toLocaleDateString('en-GB', { weekday: 'long', month: 'long' })}, ${part} (${date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })})`;
}

const who = (card) => `${card.name}, ${card.age}. Personality: ${short(card.personality, 900)}
Life: ${short(card.life, 700)}
How they write: ${short(card.speech, 300)}`;

/** Profilo pubblico e "mondo" ricorrente (casa, persone, posti, oggetti), scritti una volta e riusati. */
export function profilePrompt(card) {
  return [
    { role: 'system', content: `You create the social media profile (Instagram-like) of a fictional adult person, so that their feed stays consistent over time. Reply ONLY with JSON:
{
 "username": "plausible handle, lowercase, letters digits dots underscores, no @",
 "bio": "Italian, max 120 characters, in their own voice, like a real bio (can be a bit cryptic or ironic, emoji only if natural)",
 "world": {
   "home": "ENGLISH, 25-40 words: how their home looks (rooms, colours, furniture, light, clutter)",
   "people": ["2-4 recurring people in their life: first name + relation (Italian)"],
   "places": ["3-5 real-feeling regular places with the city (Italian)"],
   "items": ["3-5 objects they are often seen with (ENGLISH)"],
   "pet": "ENGLISH visual description of a pet with its name, or empty string"
 }
}
Stay consistent with their life description.` },
    { role: 'user', content: who(card) },
  ];
}

const worldText = (world) => (world?.home ? `Their recurring world (reuse naturally, not all at once): home: ${world.home}. People: ${(world.people || []).join(', ')}. Places: ${(world.places || []).join(', ')}. Often seen with: ${(world.items || []).join(', ')}. Pet: ${world.pet || 'none'}.` : '');

/** Il prossimo post (carosello) o storia, scritto dal personaggio. */
export function composePrompt({ card, state, profile, kind, recent, bonds, hint, memories }) {
  const story = kind === 'story';
  const system = `You run the social account (Instagram-like) of ${card.name} and write their next ${story ? 'STORY' : 'POST'} in character, like a real person, not a brand or an influencer agency.
Reply ONLY with JSON:
${story
    ? '{"caption": "Italian, very short text written over the photo (0-8 words) or empty string", "photo": {"description": "ENGLISH, 30-60 words", "shows_me": true|false}}'
    : '{"caption": "Italian, first person", "location": "a specific place or empty string", "photos": [{"description": "ENGLISH, 30-70 words", "shows_me": true|false}]}'}
Rules:
- ${story ? 'A story is a quick, casual vertical snapshot of right now: what they see or do in this moment.' : 'A post is a small carousel about ONE moment or outing: 2-4 photos of the same occasion (different angles, a detail, a selfie, the place, a friend\'s hand...). Sometimes a single strong photo is enough.'}
- caption: spontaneous and specific (a concrete detail, a name, a place, a small complaint or joke), in their own voice and way of writing. No slogans, no clichés ("vibes", "magia", "viaggio"), no hashtags inside it, emojis only if natural (0-2). Don't explain the photo.
- photo description: ONLY the scene: framing, what is happening, outfit if they appear, the place with concrete everyday details, light matching the time of day and season. Do NOT describe their face, hair or body (added automatically) and never use their name.
- shows_me: true if ${card.name} appears in the photo (selfie, mirror selfie, someone else took it); false for a detail, a place, food, an object, a view (no face; a hand or arm at most).
- It must fit their real life and this moment of the day, and be different from their recent posts. Coffee and breakfast are overused.
- The feed is public: clothed and presentable, no nudity.`;
  const user = [
    who(card),
    profile?.bio ? `Bio: ${profile.bio}` : '',
    worldText(profile?.world),
    `Right now: ${momentText()}.${state?.scene?.mood ? ` Mood: ${state.scene.mood}.` : ''}`,
    state?.summary ? `What has been happening in their private life lately (don't reveal private details, at most hint at them): ${short(state.summary, 600)}` : '',
    memories?.length ? `On their mind: ${memories.map((m) => short(m, 120)).join(' / ')}` : '',
    bonds?.length ? `People they know on the app (can be mentioned or tagged in the caption, only if natural): ${bonds.map((b) => `${b.name} (${b.note})`).join('; ')}` : '',
    recent?.length ? `Their recent captions, do NOT repeat topics or wording:\n${recent.map((c) => `- ${short(c, 160)}`).join('\n')}` : '',
    hint ? `The user asked for: ${short(hint, 300)}` : '',
  ].filter(Boolean).join('\n');
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

/** Richiesta al prompt engineer per una foto del feed. */
export function socialPhotoRequest({ card, profile, photo, media, kind, level }) {
  const scene = media.mode === 'scene';
  return [
    photo.showsMe
      ? `Subject: ${he(card)}, ${card.age} years old.${scene ? ' The input image shows this person; ' : ' '}Appearance (keep it exactly, it defines who this is): ${visualSignature(card.look, level) || '(not specified)'}`
      : 'No person is the subject: the photo shows a detail, an object, food or a place (a hand or arm at most, never a face).',
    scene ? `Source image description: ${short(card.look, 600)}` : null,
    `Context: ${kind === 'story' ? 'a story on a social profile: vertical, spontaneous, taken right now with a phone' : 'one photo of a carousel post on a social profile, a real moment, not a photoshoot'}. Local time: ${momentText()}.`,
    profile?.world?.home && /home|kitchen|bedroom|living|sofa|bathroom|casa/i.test(photo.description) ? `Their home: ${profile.world.home}` : null,
    `What the photo should show (written by the person): ${photo.description}`,
    LEVEL[level],
    card.style === 'krea' ? 'Look: a real, candid, unretouched photo (phone camera), natural light and skin texture, slightly imperfect framing.' : 'Look: polished, flattering, well-lit photo.',
    `Output format: ${media.width}x${media.height}.`,
    'Write the final prompt now.',
  ].filter(Boolean).join('\n');
}

/**
 * Commento (o risposta) di un personaggio sotto un post. Se i due personaggi non si conoscono ancora,
 * Gemma decide anche come si conoscono ("bond"), e da lì in poi resta quello.
 */
export function commentPrompt({ card, state, author, post, thread, target, bond, needsBond, userName }) {
  const own = author.id === card.id;
  const toUser = target?.kind === 'user';
  const system = `You are ${card.name} on a social network (Instagram-like) where you and people you know post photos. Write as yourself, a real person with your own personality and way of writing: in Italian, short and natural (one sentence, two at most), specific to the post or the comment, at most one emoji. Never generic ("bellissima foto!", "che bello!"), never formal, never mention AI. You can joke, tease, ask something, be a bit jealous or dry, according to who you are and how you know them.
Reply ONLY with JSON: {"comment": "..."${needsBond ? ', "bond": "one sentence in Italian: how you and the other person know each other (neighbours, gym, old classmates, colleague, friend of a friend...), specific and consistent with both your lives"' : ''}}`;
  const lines = [
    who(card),
    own ? `This is YOUR post (${post.kind === 'story' ? 'story' : 'post'}).` : `This is a ${post.kind === 'story' ? 'story' : 'post'} by ${author.name}.`,
    `Caption: "${short(post.caption, 500)}"${post.location ? ` · ${post.location}` : ''}`,
    `Photos: ${post.photos.map((p) => short(p, 200)).join(' / ') || '(none)'}`,
    !own ? `About ${author.name}: ${short(author.personality, 400)} ${short(author.life, 300)}` : null,
    bond ? `How you know ${bond.name}: ${bond.note}` : null,
    needsBond && !bond ? `You have never interacted with ${needsBond} on the app before: decide how you two know each other.` : null,
    toUser ? `${userName || 'The user'} is the person you talk with in private chat. Your relationship: ${stageText(state.rel)}${state.relNote ? ` ${state.relNote}` : ''} This comment is public: everyone can read it.` : null,
    thread.length ? `Comments so far:\n${thread.map((c) => `- ${c.name}: ${short(c.content, 200)}`).join('\n')}` : null,
    target ? `Write your reply to ${target.name}: "${short(target.content, 300)}"` : 'Write your comment.',
  ];
  return [{ role: 'system', content: system }, { role: 'user', content: lines.filter(Boolean).join('\n') }];
}
