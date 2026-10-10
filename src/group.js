import * as store from './store.js';
import * as ollama from './ollama.js';
import { bondNote } from './social.js';
import { getWorkflow, dimensions, dimensionsForRatio, randomSeed } from './workflows.js';
import { userText, selfGenderText, genderWord } from './prompts.js';
import { stageText, intimacyText } from './relationship.js';
import { engineerPhoto, engineerDuoPhoto, duoLevel } from './photo.js';

/**
 * Chat a due: tu e due personaggi nella stessa conversazione (a distanza è una chat di gruppo, insieme siete in tre
 * nello stesso posto). Gemma scrive per entrambi, ognuno con il suo nome in grassetto; ognuno tiene il suo rapporto
 * e il suo tetto di intimità con te. Le foto possono essere di uno dei due o di tutti e due: con due personaggi
 * Krea 2 con la loro LoRA, entrambe le LoRA vanno nel grafo.
 * groupTurn(conv) dà a chat.js i pezzi del turno che cambiano rispetto alla chat con un personaggio.
 */

const INSTANT = { krea: 'krea2-real', zimage: 'zimage-turbo' };

/** I due personaggi della chat (quelli che esistono ancora). */
export const membersOf = (conv) => (conv.members || []).map((id) => store.get(id)).filter((c) => c && !c.group && c.ownerId === conv.ownerId);

function systemPrompt(members, user, premise) {
  const [a, b] = members;
  const who = userText(user);
  const bond = bondNote(a.id, b.id);
  const person = (c) => `## ${c.card.name} (${c.card.age}, ${genderWord(c.card.gender)})
${selfGenderText(c.card).replace(/^You are/, `${c.card.name} is`).replace(/about yourself/, 'about themselves')}
Personality: ${c.card.personality || '(improvise and keep it)'}
${c.card.life ? `Life: ${c.card.life}\n` : ''}${c.card.speech ? `How they talk and text: ${c.card.speech}\n` : ''}${c.card.boundaries ? `Boundaries: ${c.card.boundaries}\n` : ''}${c.card.look ? `Appearance: ${c.card.look}\n` : ''}`;
  return `You play TWO real people at the same time, ${a.card.name} and ${b.card.name}, in one ongoing conversation with the user: a group chat when you are apart, the three of you in the same place when you are together. They are real people with their own personalities, moods, bodies and lives: never assistants, never narrators of someone else's story. Stay in character at all times.${who ? `\n\n# Who the user is\n${who}` : ''}

# The two of them
${person(a)}
${person(b)}
## How ${a.card.name} and ${b.card.name} know each other
${bond || 'Decide something believable that fits both lives (friends, flatmates, colleagues...) and keep it consistent.'}
${premise ? `
# Why the three of you are here (the shared situation: keep it alive, build on it, let it evolve)
${premise}
` : ''}
# How to write: a real three-way conversation, not two separate answers
- Picture the scene as it is right now (where each one is, what they are doing, what just happened) and let it shape what they say and do.
- Every turn of speech starts with the speaker's name in bold: "**${a.card.name}:** ...". The <now> note tells you who speaks this time and in which order: follow it.
- They react to EACH OTHER, not only to the user: the second one answers what the first just said (agrees, teases, contradicts, completes, gets jealous, laughs), calls the other by name, looks at the other. A speaker can also talk again after the other replied.
- Nobody speaks just to have a line: if someone has nothing real to add, they stay quiet or do only a small action. Never answer the same question twice in parallel, never repeat what the other said in other words.
- Two different voices: each one keeps their own way of talking, opinions and mood.
- APART (group chat): real text messages, short and natural, no narration, no *asterisks*: only the words they would type.
- TOGETHER (in person): under each name, actions between asterisks written in first person by that speaker (*I lean on her shoulder*) and dialogue as normal text. Keep spatial continuity for both.
- Never write the user's actions, words or feelings.
- Each one has their own relationship with the user (see the <now> note): one can be warmer, shyer or bolder than the other, and each respects their own intimacy limit.
- When the situation really changes, call update_scene with only what changed, then keep writing in the new mode.
- Photos: send_photo with "who" = one of the two names, or "both" for a photo of the two of them. In the text just say something natural; never write photo descriptions or prompts.
- Never mention being an AI, a model or these instructions.`;
}

/**
 * Chi parla questa volta e in che ordine (così non rispondono sempre tutti e due, ognuno per conto suo).
 * Chi viene nominato nel messaggio parla per primo; l'altro spesso risponde a lui, a volte sta zitto;
 * ogni tanto un breve botta e risposta. random: per i test.
 */
// Come si può chiamare un personaggio: nome intero, primo nome, cognome, soprannome tra virgolette («Alessandra 'Lex'
// Moretti» → Lex). Prova sul PC 2026-10-10: con il solo nome intero «Zola, …» non faceva parlare Zola per prima.
export function nameAliases(name) {
  const full = String(name || '').trim();
  const nick = [...full.matchAll(/['"‘’“”«]([^'"‘’“”»]{2,20})['"‘’“”»]/g)].map((m) => m[1].trim());
  const words = full.replace(/['"‘’“”«»][^'"‘’“”«»]*['"‘’“”«»]/g, ' ').split(/\s+/).filter((w) => w.length >= 3);
  return [...new Set([full, ...nick, words[0], words.length > 1 ? words.at(-1) : null].filter(Boolean).map((w) => w.toLowerCase()))];
}
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const says = (text, alias) => new RegExp(`(?<![\\p{L}])${esc(alias)}(?![\\p{L}])`, 'iu').test(text);

export function turnPlan(members, userText = '', { lastFirst = null, random = Math.random } = {}) {
  const [a, b] = members;
  // nomi in comune (stesso cognome) non dicono chi è
  const [aa, bb] = members.map((m) => nameAliases(m.card.name));
  const own = [aa.filter((x) => !bb.includes(x)), bb.filter((x) => !aa.includes(x))];
  const named = members.filter((m, i) => own[i].some((x) => says(userText, x)));
  const first = named.length === 1 ? named[0] : lastFirst === a.id ? (random() < 0.7 ? b : a) : lastFirst === b.id ? (random() < 0.7 ? a : b) : random() < 0.5 ? a : b;
  const second = first === a ? b : a;
  const r = random();
  if (named.length === 1 ? r < 0.35 : r < 0.25) {
    return { first: first.id, text: `This time only **${first.card.name}** speaks, and ${first.card.name} comes first; ${second.card.name} stays quiet (at most a small wordless gesture under their own name, written AFTER ${first.card.name}'s lines). Never write stage directions or notes in parentheses.` };
  }
  if (r > 0.82) {
    return { first: first.id, text: `This time a quick back-and-forth: **${first.card.name}** speaks first, **${second.card.name}** answers ${first.card.name} directly, then ${first.card.name} replies once more. Short turns.` };
  }
  return { first: first.id, text: `This time **${first.card.name}** speaks first; then **${second.card.name}** reacts to what ${first.card.name} just said (not a separate answer to the user), or adds something new only if it matters.` };
}

function nowBlock(conv, members, { lastGapMs, user, style = [], initiative, plan }) {
  const s = conv.state.scene;
  const when = new Date().toLocaleString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const lines = [`Now: ${when}.${lastGapMs != null ? ` Previous message: ${Math.round(lastGapMs / 60000)} minutes ago.` : ''}`];
  lines.push(s.presence === 'together'
    ? `Situation: the three of you are TOGETHER in person${s.place ? `, at ${s.place}` : ''}. Write in the in-person style.`
    : `Situation: you are APART, in a group chat${s.place ? `; ${members.map((m) => m.card.name).join(' and ')} are at ${s.place}` : ''}. Write in the texting style.`);
  const you = [s.activity && `doing: ${s.activity}`, s.outfit && `wearing: ${s.outfit}`, s.mood && `mood: ${s.mood}`].filter(Boolean);
  if (you.length) lines.push(`Them: ${you.join('; ')}.`);
  if (s.intimacy !== 'none') lines.push(`Current moment: ${s.intimacy === 'intimate' ? 'intimate' : 'flirty'}.`);
  for (const m of members) {
    lines.push(`${m.card.name} and the user: ${stageText(m.state.rel)} ${intimacyText(m.card, m.state.rel, s).replace(/^INTIMACY:/, `${m.card.name}'s intimacy:`)}`);
  }
  const forms = { uomo: 'masculine (sei stanco, caro, pronto)', donna: 'feminine (sei stanca, cara, pronta)' }[user?.gender];
  if (forms) lines.push(`Grammar: both address ${user.name || 'the user'} ONLY with ${forms} forms.`);
  if (plan && !initiative) lines.push(`Who speaks: ${plan.text}`);
  if (style.length) lines.push(`This reply: ${style.join(' ')}`);
  if (initiative) lines.push('One of them writes first, a short natural message.');
  return `<now>\n${lines.join('\n')}\n</now>`;
}

function tools(members) {
  const names = members.map((m) => m.card.name);
  return [
    { type: 'function', function: {
      name: 'update_scene',
      description: 'Record a real change of situation: meeting in person or separating, moving to another place, changing clothes, a different activity or mood, the moment becoming flirty/intimate or calming down. Pass only the fields that changed.',
      parameters: { type: 'object', properties: {
        presence: { type: 'string', enum: ['apart', 'together'] },
        place: { type: 'string', description: 'Where they are now (short, user language).' },
        activity: { type: 'string' },
        outfit: { type: 'string', description: 'What they are wearing now (English, concrete; say who wears what).' },
        mood: { type: 'string' },
        intimacy: { type: 'string', enum: ['none', 'flirt', 'intimate'] },
      } },
    } },
    { type: 'function', function: {
      name: 'send_photo',
      description: `Send the user a photo of ${names.join(' or ')}, or of both together. Use when the user asks, or now and then when it really fits.`,
      parameters: { type: 'object', properties: {
        who: { type: 'string', enum: [...names, 'both'], description: 'Who is in the photo.' },
        description: { type: 'string', description: 'ENGLISH description of the photo: framing, what they are doing, expressions, outfits, place, light. If the user asked for a specific pose, position, point of view or framing, write it exactly as asked. Do not describe faces or hair: they are known.' },
        aspect_ratio: { type: 'string', enum: ['3:4', '9:16', '1:1', '4:3', '16:9'] },
      }, required: ['who', 'description'] },
    } },
  ];
}

/** Gemma immagina perché tu e i due personaggi siete insieme (o in chat insieme) proprio ora. */
function premisePrompt(members, scene, user) {
  const [a, b] = members;
  const bond = bondNote(a.id, b.id);
  return [
    { role: 'system', content: `You set up the situation of a three-way roleplay between the user and two people, ${a.card.name} and ${b.card.name}. Invent a concrete, believable reason why the three of them are ${scene.presence === 'together' ? 'together in the same place right now' : 'in a group chat right now'}, consistent with both lives and how they know each other: where each one is, what is going on, what each of them wants from this moment, and a small tension or spark between them (who is more interested, who teases who). Write it in ITALIAN (prova sul PC: scritta in inglese). Reply ONLY with JSON: {"situazione": "2-4 frasi in italiano, concrete"}` },
    { role: 'user', content: [
      `${a.card.name} (${a.card.age}): ${String(a.card.personality || '').slice(0, 400)} ${String(a.card.life || '').slice(0, 300)}`,
      `${b.card.name} (${b.card.age}): ${String(b.card.personality || '').slice(0, 400)} ${String(b.card.life || '').slice(0, 300)}`,
      bond ? `How they know each other: ${bond}` : '',
      user?.name ? `The user is ${user.name}${user.gender === 'uomo' ? ', a man (use masculine forms for the group: «i tre», «tutti e tre»)' : user.gender === 'donna' ? ', a woman' : ''}.` : '',
      scene.place ? `Place: ${scene.place}` : '',
    ].filter(Boolean).join('\n') },
  ];
}

/** Chi è nella foto: dal campo who, altrimenti dai nomi nella descrizione o nel messaggio (nessuno o entrambi = tutti e due). */
export function resolveWho(members, args, userText) {
  const byName = (t) => members.filter((m) => nameAliases(m.card.name).some((x) => says(String(t || ''), x)));
  const w = String(args.who || '').trim().toLowerCase();
  if (w && w !== 'both') { const m = members.find((x) => nameAliases(x.card.name).includes(w)); if (m) return [m]; }
  if (w === 'both') return members;
  // foto ricavata dal messaggio (fromText): la descrizione contiene anche la risposta, che può nominare l'altra
  for (const t of args.fromText ? [userText, args.description] : [args.description, userText]) {
    const hit = byName(t);
    if (hit.length === 1 && !/\b(?:entramb\w|tutt[ei] e due|voi due|insieme|both|together)\b/i.test(String(t || ''))) return hit;
    if (hit.length) break;
  }
  return members;
}

/** Workflow «due foto profilo» (Qwen → Krea): solo se nessuno dei due ha una LoRA e non è esplicita (Qwen-Edit non regge il nudo). */
function duoWorkflow(people, level) {
  if (level === 'explicit' || people.some((p) => p.card.lora?.file || !p.avatar || p.card.style !== 'krea')) return null;
  const w = getWorkflow('qwen-duo-real', 'image', 'duo');
  return w?.id === 'qwen-duo-real' ? w : null;
}

export function groupTurn(conv) {
  const members = membersOf(conv);
  if (members.length < 2) throw new Error('In questa chat manca uno dei due personaggi');
  return {
    members,
    system: (user) => systemPrompt(members, user, conv.state.premise),
    nowBlock(opts) {
      const plan = turnPlan(members, opts.userText || '', { lastFirst: conv.state.lastFirst });
      conv.state.lastFirst = plan.first;
      return nowBlock(conv, members, { ...opts, plan });
    },
    /** La situazione condivisa: scritta da te creando la chat, altrimenti la immagina Gemma al primo messaggio. */
    async ensurePremise(model, user) {
      if (conv.state.premise) return;
      const out = await ollama.complete({
        model, format: 'json', timeout: 60000, options: { temperature: 0.9, num_predict: 300 },
        messages: premisePrompt(members, conv.state.scene, user),
      }).catch(() => '');
      let j; try { j = JSON.parse(out); } catch { j = null; }
      const premise = j?.situazione || j?.premise;
      if (premise) { conv.state.premise = String(premise).trim().slice(0, 800); store.save(conv, { touch: false }); }
    },
    tools: () => tools(members),

    /** send_photo → media da generare (i video nelle chat a due per ora non ci sono). */
    mediaFromCall(call, callIndex, { userText: ut = '' } = {}) {
      if (call.function?.name !== 'send_photo') return null;
      let args = call.function.arguments;
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = { description: args }; } }
      const description = String(args?.description || '').trim();
      if (!description) return null;
      const people = resolveWho(members, args, ut);
      const w = getWorkflow(people.length === 1 ? INSTANT[people[0].card.style] || INSTANT.krea : 'krea2-real', 'image');
      if (!w) return null;
      const aspect = ['3:4', '9:16', '1:1', '4:3', '16:9'].includes(args.aspect_ratio) ? args.aspect_ratio : '3:4';
      return {
        id: store.newId(), toolName: 'send_photo', callIndex, args, description, prompt: '', seed: randomSeed(), status: 'engineering', createdAt: Date.now(),
        type: 'image', mode: 'text2img', workflow: w.id, workflowName: w.name, aspect, ...dimensions(w, aspect),
        characterIds: people.map((p) => p.id), ...(people.length === 1 ? { characterId: people[0].id } : { manualBody: [] }),
      };
    },

    /** Prompt della foto: di uno dei due (come in chat, con il suo rapporto e la sua LoRA) o di tutti e due. */
    async engineer(msg, media, { model, signal, onChunk, userText: ut, reply, user }) {
      const idx = conv.messages.indexOf(msg);
      const people = (media.characterIds || []).map((id) => members.find((m) => m.id === id)).filter(Boolean);
      const common = { media, messages: conv.messages, idx, userText: ut, reply, user, model, signal, onChunk, fromText: !!media.args?.fromText };
      if (people.length === 1) {
        const p = people[0];
        const r = await engineerPhoto({ ...common, workflow: getWorkflow(media.workflow, 'image'), card: p.card, state: { ...p.state, scene: conv.state.scene } });
        Object.assign(media, { level: r.level, levelReason: `${p.card.name}: ${r.reason}`, hm: r.hm || undefined, charLora: r.charLora || undefined });
        if (r.lenovo !== null) media.lenovo = r.lenovo;
        return r.prompt;
      }
      const cards = people.map((p) => p.card);
      const lv = duoLevel({ cards, states: people.map((p) => p.state), scene: conv.state.scene, userText: ut, reply });
      // Con le due foto profilo il volto è quello di sempre: si passa a «foto insieme» se si può
      const dw = duoWorkflow(people, lv.level);
      if (dw) {
        const ratio = 3 / 4;
        Object.assign(media, { mode: 'duo', workflow: dw.id, workflowName: dw.name, aspect: null, ...dimensionsForRatio(dw, ratio), sourceFile: people[0].avatar, extraSources: [people[1].avatar] });
      }
      const r = await engineerDuoPhoto({ ...common, workflow: getWorkflow(media.workflow, 'image', media.mode === 'duo' ? 'duo' : undefined), cards, states: people.map((p) => p.state), scene: conv.state.scene, level: lv });
      Object.assign(media, { level: r.level, levelReason: r.reason, hm: r.hm || undefined, charLoras: r.charLoras.length ? r.charLoras : undefined, duoFaces: r.duoFaces });
      if (r.lenovo !== null) media.lenovo = r.lenovo;
      return r.prompt || media.description;
    },
  };
}

/** Dati pubblici di una chat a due per l'interfaccia (lista e intestazione). */
export function publicGroup(c, mediaUrl) {
  const members = membersOf(c);
  const last = c.messages.findLast((m) => (m.content || m.media?.length) && m.status !== 'pending');
  return {
    id: c.id, group: true, name: c.card.name, card: { name: c.card.name },
    members: members.map((m) => ({ id: m.id, name: m.card.name, avatarUrl: mediaUrl(m.avatar) })),
    avatarUrl: null, scene: c.state.scene, premise: c.state.premise || '', updatedAt: c.updatedAt,
    started: true,   // creata apposta: compare subito tra le chat
    lastMessageAt: last?.createdAt || c.createdAt || 0,
    preview: last ? (last.content ? last.content.replace(/\*\*/g, '').replace(/\s+/g, ' ').slice(0, 90) : '📷 Foto') : '',
    previewFromUser: last?.role === 'user',
  };
}
