import fs from 'node:fs/promises';
import path from 'node:path';
import config from './config.js';
import { db } from './db.js';
import * as ollama from './ollama.js';
import * as store from './store.js';
import * as queue from './queue.js';
import { promptProfile } from './auth.js';
import { emit, mediaUrl, renderMedia } from './jobs.js';
import { getWorkflow, dimensions, dimensionsForRatio, randomSeed } from './workflows.js';
import { promptEngineerSystem, cleanPrompt } from './prompts.js';
import { profilePrompt, composePrompt, socialPhotoRequest, commentPrompt, catchupPrompt } from './social-prompts.js';
import * as notify from './notify.js';

/**
 * Social dei personaggi: profilo, caroselli curati, storie, mi piace e commenti.
 *
 * Tutto passa dalla coda a goccia (queue.js): il personaggio pianifica un post (Gemma scrive didascalia e
 * foto), poi le foto si generano una alla volta quando la GPU è libera. Pubblicato il post, gli altri
 * personaggi dell'utente lo vedono nel corso del tempo: qualcuno mette mi piace, qualcuno commenta,
 * l'autore risponde. Si conoscono: la prima volta che interagiscono Gemma decide come (vicini di casa,
 * palestra, ex compagni di scuola…) e da lì resta quello. I commenti sono conversazioni di gruppo: tu e i
 * personaggi potete rispondere a chiunque. Ogni tanto due amici si vedono e pubblicano una foto insieme.
 * A server spento la loro vita continua: alla riaccensione Gemma racconta cosa hanno fatto nel frattempo.
 * Nessun follower o commento inventato: ogni interazione viene da un personaggio vero o da te.
 */

const q = {
  profile: db.prepare('SELECT * FROM social_profiles WHERE character_id = ?'),
  usernames: db.prepare('SELECT username FROM social_profiles WHERE character_id != ?'),
  upsertProfile: db.prepare(`INSERT INTO social_profiles (character_id, username, bio, world, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(character_id) DO UPDATE SET username = excluded.username, bio = excluded.bio, world = excluded.world, updated_at = excluded.updated_at`),
  post: db.prepare('SELECT * FROM posts WHERE id = ?'),
  insertPost: db.prepare(`INSERT INTO posts (id, owner_id, character_id, kind, status, requested, created_at) VALUES (?, ?, ?, ?, 'planned', ?, ?)`),
  updatePost: db.prepare('UPDATE posts SET status = ?, caption = ?, location = ?, media = ?, error = ?, published_at = ? WHERE id = ?'),
  deletePost: db.prepare('DELETE FROM posts WHERE id = ?'),
  feed: db.prepare(`SELECT * FROM posts WHERE owner_id = ? AND kind = 'post' AND status = 'published' AND published_at < ? ORDER BY published_at DESC LIMIT ?`),
  feedChar: db.prepare(`SELECT * FROM posts WHERE character_id = ? AND kind = 'post' AND status = 'published' AND published_at < ? ORDER BY published_at DESC LIMIT ?`),
  stories: db.prepare(`SELECT * FROM posts WHERE owner_id = ? AND kind = 'story' AND status = 'published' AND published_at > ? ORDER BY published_at`),
  inProgress: db.prepare(`SELECT * FROM posts WHERE owner_id = ? AND status IN ('planned', 'generating', 'error') ORDER BY created_at`),
  byCharacter: db.prepare('SELECT * FROM posts WHERE character_id = ?'),
  published: db.prepare(`SELECT * FROM posts WHERE owner_id = ? AND status = 'published' ORDER BY published_at DESC`),
  lastOf: db.prepare('SELECT MAX(created_at) AS at FROM posts WHERE character_id = ? AND kind = ?'),
  recentCaptions: db.prepare(`SELECT caption FROM posts WHERE character_id = ? AND caption != '' ORDER BY created_at DESC LIMIT 6`),
  latest: db.prepare(`SELECT * FROM posts WHERE character_id = ? AND status = 'published' AND published_at > ? ORDER BY published_at DESC LIMIT 2`),
  countPosts: db.prepare(`SELECT COUNT(*) AS n FROM posts WHERE character_id = ? AND kind = 'post' AND status = 'published'`),
  likesReceived: db.prepare(`SELECT COUNT(*) AS n FROM post_likes l JOIN posts p ON p.id = l.post_id WHERE p.character_id = ?`),
  likes: db.prepare('SELECT liker FROM post_likes WHERE post_id = ? ORDER BY created_at'),
  like: db.prepare('INSERT OR IGNORE INTO post_likes (post_id, liker, created_at) VALUES (?, ?, ?)'),
  unlike: db.prepare('DELETE FROM post_likes WHERE post_id = ? AND liker = ?'),
  likesBy: db.prepare('DELETE FROM post_likes WHERE liker = ?'),
  comments: db.prepare('SELECT * FROM post_comments WHERE post_id = ? ORDER BY created_at'),
  insertComment: db.prepare('INSERT INTO post_comments (id, post_id, character_id, reply_to, content, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  authorLikes: db.prepare('UPDATE post_comments SET liked_by_author = 1 WHERE id = ?'),
  userComments: db.prepare(`SELECT c.content, c.created_at, p.caption, p.kind FROM post_comments c JOIN posts p ON p.id = c.post_id
    WHERE p.character_id = ? AND c.character_id IS NULL AND c.created_at > ? ORDER BY c.created_at DESC LIMIT 3`),
  bond: db.prepare('SELECT note FROM character_bonds WHERE a = ? AND b = ?'),
  insertBond: db.prepare('INSERT OR IGNORE INTO character_bonds (a, b, note, created_at) VALUES (?, ?, ?, ?)'),
  bondsOf: db.prepare('SELECT * FROM character_bonds WHERE a = ? OR b = ?'),
  seen: db.prepare('UPDATE posts SET seen_at = ? WHERE id = ? AND seen_at IS NULL'),
  setTags: db.prepare('UPDATE posts SET tags = ? WHERE id = ?'),
  tagged: db.prepare(`SELECT * FROM posts WHERE owner_id = ? AND kind = 'post' AND status = 'published' AND tags LIKE ? ORDER BY published_at DESC`),
  lastJoint: db.prepare(`SELECT MAX(created_at) AS at FROM posts WHERE owner_id = ? AND tags != '[]'`),
  lastAuto: db.prepare(`SELECT MAX(created_at) AS at FROM posts WHERE owner_id = ? AND requested = 0`),
  autoSince: db.prepare(`SELECT kind, COUNT(*) AS n FROM posts WHERE owner_id = ? AND requested = 0 AND created_at > ? GROUP BY kind`),
  charComments: db.prepare('SELECT COUNT(*) AS n FROM post_comments WHERE post_id = ? AND character_id IS NOT NULL'),
  insertLife: db.prepare(`INSERT INTO life_log (id, character_id, from_ts, to_ts, summary, post_idea, met_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`),
  lifeRecent: db.prepare(`SELECT * FROM life_log WHERE character_id = ? AND created_at > ? ORDER BY created_at DESC LIMIT 2`),
  idea: db.prepare(`SELECT * FROM life_log WHERE character_id = ? AND idea_used = 0 AND post_idea != '' AND created_at > ? ORDER BY created_at DESC LIMIT 1`),
  useIdea: db.prepare('UPDATE life_log SET idea_used = 1 WHERE id = ?'),
  meta: db.prepare('SELECT value FROM app_meta WHERE key = ?'),
  setMeta: db.prepare(`INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`),
};

const DAY = 86400 * 1000;
const STORY_MS = DAY;
const short = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
/** Anteprima per le notifiche: tagliata a fine parola, con i puntini. */
const preview = (s, n) => { const t = short(s, 1000); return t.length <= n ? t : `${t.slice(0, n).replace(/\s+\S*$/, '')}…`; };
const rand = (a, b) => a + Math.random() * (b - a);
const minutes = (a, b) => Math.round(rand(a, b) * 60 * 1000);
const shuffle = (arr) => arr.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
const json = (text) => { try { return JSON.parse(text); } catch { return null; } };

// ---------------------------------------------------------------------------
// Profili, legami tra personaggi
// ---------------------------------------------------------------------------
export function profile(characterId) {
  const r = q.profile.get(characterId);
  return r ? { username: r.username, bio: r.bio, world: json(r.world) || {} } : null;
}

const slug = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 24);

function uniqueUsername(characterId, wanted, name) {
  const taken = new Set(q.usernames.all(characterId).map((r) => r.username));
  let u = slug(wanted) || slug(name) || 'utente';
  if (u.length < 3) u = `${u}${Math.floor(rand(10, 99))}`;
  while (taken.has(u)) u = `${slug(wanted || name).slice(0, 20)}${Math.floor(rand(10, 999))}`;
  return u;
}

/** Profilo pubblico: scritto da Gemma la prima volta che il personaggio pubblica (GPU già a Ollama). */
async function ensureProfile(conv, model) {
  const have = profile(conv.id);
  if (have) return have;
  let j = null;
  try {
    j = json(await ollama.complete({ model, format: 'json', timeout: 120000, options: { temperature: 0.9, num_predict: 700 }, messages: profilePrompt(conv.card) }));
  } catch (e) { console.warn('[social] profilo:', e.message); }
  const world = j?.world && typeof j.world === 'object' ? {
    home: short(j.world.home, 400),
    people: (Array.isArray(j.world.people) ? j.world.people : []).map((x) => short(x, 60)).slice(0, 4),
    places: (Array.isArray(j.world.places) ? j.world.places : []).map((x) => short(x, 80)).slice(0, 5),
    items: (Array.isArray(j.world.items) ? j.world.items : []).map((x) => short(x, 60)).slice(0, 5),
    pet: short(j.world.pet, 200),
  } : {};
  const p = { username: uniqueUsername(conv.id, j?.username, conv.card.name), bio: short(j?.bio, 160), world };
  q.upsertProfile.run(conv.id, p.username, p.bio, JSON.stringify(p.world), Date.now());
  return p;
}

export function updateProfile(characterId, { username, bio }) {
  const p = profile(characterId) || { username: '', bio: '', world: {} };
  const c = store.get(characterId);
  q.upsertProfile.run(characterId, username !== undefined ? uniqueUsername(characterId, username, c?.card.name) : p.username || uniqueUsername(characterId, '', c?.card.name),
    bio !== undefined ? short(bio, 160) : p.bio, JSON.stringify(p.world || {}), Date.now());
  return profile(characterId);
}

const pair = (x, y) => (x < y ? [x, y] : [y, x]);
function bondNote(x, y) { return q.bond.get(...pair(x, y))?.note || null; }

/** Persone dell'app che il personaggio conosce (con chi ha già interagito). */
function bondsOf(characterId) {
  return q.bondsOf.all(characterId, characterId).map((b) => {
    const other = store.get(b.a === characterId ? b.b : b.a);
    return other ? { id: other.id, name: other.card.name, note: b.note, avatarUrl: mediaUrl(other.avatar) } : null;
  }).filter(Boolean);
}

const charInfo = (id) => {
  const c = store.get(id);
  if (!c) return { id, name: '?', avatarUrl: null, username: null };
  return { id, name: c.card.name, avatarUrl: mediaUrl(c.avatar), username: profile(id)?.username || null };
};

const userName = (ownerId) => promptProfile(ownerId)?.name || 'the user';

// ---------------------------------------------------------------------------
// Post: lettura, salvataggio, eventi
// ---------------------------------------------------------------------------
function loadPost(id) {
  const r = q.post.get(id);
  return r ? parseRow(r) : null;
}
const parseRow = (r) => ({ ...r, media: json(r.media) || [], tags: json(r.tags) || [] });

function savePost(p) {
  q.updatePost.run(p.status, p.caption || '', p.location || '', JSON.stringify(p.media || []), p.error || null, p.published_at || null, p.id);
}

const publicMedia = (m) => ({
  id: m.id, type: m.type, status: m.status, error: m.error || null, width: m.width, height: m.height,
  url: mediaUrl(m.file), prompt: m.prompt, description: m.description, workflowName: m.workflowName,
  showsMe: !!m.showsMe, startedAt: m.startedAt || null, finishedAt: m.finishedAt || null, seed: m.seed, aspect: m.aspect,
});

export function publicPost(p) {
  const likes = q.likes.all(p.id).map((r) => r.liker);
  const typing = queue.find(p.owner_id, (j) => j.kind === 'social.comment' && j.payload.postId === p.id && j.payload.forUser && j.status !== 'error')
    .map((j) => store.get(j.payload.characterId)?.card.name).filter(Boolean);
  return {
    id: p.id, kind: p.kind, status: p.status, error: p.error || null, caption: p.caption, location: p.location,
    tags: (p.tags || []).filter((id) => store.get(id)).map(charInfo),
    requested: !!p.requested, createdAt: p.created_at, publishedAt: p.published_at, seen: !!p.seen_at,
    expiresAt: p.kind === 'story' && p.published_at ? p.published_at + STORY_MS : null,
    character: charInfo(p.character_id),
    media: p.media.map(publicMedia),
    likes: { count: likes.length, byUser: likes.includes('user'), names: likes.filter((l) => l !== 'user').map((id) => store.get(id)?.card.name).filter(Boolean) },
    comments: q.comments.all(p.id).map((c) => ({
      id: c.id, replyTo: c.reply_to, content: c.content, createdAt: c.created_at, likedByAuthor: !!c.liked_by_author,
      author: c.character_id ? { kind: 'character', ...charInfo(c.character_id) } : { kind: 'user' },
    })),
    typing: [...new Set(typing)],
  };
}

function changed(postOrId) {
  const p = typeof postOrId === 'string' ? loadPost(postOrId) : postOrId;
  if (p) emit(queue.channel(p.owner_id), { type: 'social', what: 'post', post: publicPost(p) });
}

// ---------------------------------------------------------------------------
// Creazione: piano (Gemma) → foto (ComfyUI), un pezzo alla volta
// ---------------------------------------------------------------------------
/** Contenuti automatici nelle ultime 24 ore (quelli chiesti da te non contano). */
export function counters(ownerId) {
  const out = { posts: 0, stories: 0 };
  for (const r of q.autoSince.all(ownerId, Date.now() - DAY)) out[r.kind === 'story' ? 'stories' : 'posts'] = r.n;
  return out;
}

/** withId: l'amico con cui si sono visti (foto insieme, taggato nel post). */
export function createPost(conv, kind = 'post', { requested = false, hint = '', withId = null } = {}) {
  const id = store.newId();
  q.insertPost.run(id, conv.ownerId, conv.id, kind === 'story' ? 'story' : 'post', requested ? 1 : 0, Date.now());
  const friend = withId && kind === 'post' ? store.get(withId) : null;
  if (friend) q.setTags.run(JSON.stringify([friend.id]), id);
  queue.add({
    ownerId: conv.ownerId, characterId: conv.id, kind: 'post.plan', gpu: 'ollama',
    priority: requested ? queue.PRIORITY.requested : queue.PRIORITY.plan,
    payload: { postId: id, hint: short(hint, 300) },
    label: friend ? `${conv.card.name} e ${friend.card.name} si vedono` : `${conv.card.name} prepara ${kind === 'story' ? 'una storia' : 'un post'}`,
  });
  const p = loadPost(id);
  changed(p);
  return publicPost(p);
}

/** Foto del profilo: dimensioni note se è una foto della chat (per il formato delle foto "stessa persona"). */
function avatarRatio(conv) {
  for (const m of conv.messages) for (const md of m.media || []) if (md.file === conv.avatar && md.width) return md.width / md.height;
  return 3 / 4;
}

const sameFace = (c) => config.social.identity && c?.card.style === 'krea' && !!c.avatar;

/**
 * Motore di ogni foto. Caroselli: se il personaggio compare ed è in stile Krea, "stessa persona, nuova scena"
 * a partire dalla foto profilo (il volto resta quello); i due amici insieme partono dalle due foto profilo.
 * Altrimenti il motore del suo stile, con l'aspetto descritto a parole. Storie: istantanee.
 */
function mediaFor(conv, kind, photo, friend) {
  const subject = friend ? photo.subject : photo.showsMe ? 'me' : 'none';
  const base = { id: store.newId(), type: 'image', description: photo.description, showsMe: subject !== 'none', subject, prompt: '', seed: randomSeed(), status: 'engineering', createdAt: Date.now() };
  if (kind === 'post') {
    if (subject === 'both' && sameFace(conv) && sameFace(friend)) {
      const w = getWorkflow('qwen-duo-real', 'image', 'duo');
      if (w?.id === 'qwen-duo-real') return { ...base, mode: 'duo', workflow: w.id, workflowName: w.name, aspect: null, ...dimensionsForRatio(w, avatarRatio(conv)), sourceFile: conv.avatar, extraSources: [friend.avatar] };
    }
    const one = subject === 'me' ? conv : subject === 'friend' ? friend : null;
    if (one && sameFace(one)) {
      const w = getWorkflow('qwen-scene-real', 'image', 'scene');
      if (w?.id === 'qwen-scene-real') return { ...base, mode: 'scene', workflow: w.id, workflowName: w.name, aspect: null, ...dimensionsForRatio(w, avatarRatio(one)), sourceFile: one.avatar };
    }
  }
  const w = getWorkflow(conv.card.style === 'zimage' ? 'zimage-turbo' : 'krea2-real', 'image');
  if (!w) throw new Error('Nessun workflow immagine disponibile su ComfyUI');
  const aspect = kind === 'story' ? '9:16' : '3:4';
  return { ...base, mode: 'text2img', workflow: w.id, workflowName: w.name, aspect, ...dimensions(w, aspect) };
}

const levelFor = (card) => (config.social.level === 'sensual' && card.intimacy !== 'mai' ? 'sensual' : 'neutral');

async function engineer(conv, friend, prof, md, kind, model) {
  const w = getWorkflow(md.workflow, md.type, md.mode);
  const out = await ollama.complete({
    model, timeout: 120000, options: { temperature: 0.7, num_predict: 450 },
    messages: [
      { role: 'system', content: promptEngineerSystem(w) },
      { role: 'user', content: socialPhotoRequest({ card: conv.card, friend: friend?.card, profile: prof, photo: md, media: md, kind, level: levelFor(conv.card) }) },
    ],
  });
  return cleanPrompt(out) || md.description;
}

queue.register('post.plan', async (job, payload) => {
  try {
    await plan(payload);
  } catch (e) {
    // all'ultimo tentativo il post resta visibile come "non riuscito", con il tasto Riprova
    const post = job.lastAttempt && loadPost(payload.postId);
    if (post?.status === 'planned') { post.status = 'error'; post.error = e.message; savePost(post); changed(post); }
    throw e;
  }
});

const SUBJECTS = ['both', 'me', 'friend', 'none'];

async function plan({ postId, hint }) {
  const post = loadPost(postId);
  if (!post || post.status !== 'planned') return;
  const conv = store.get(post.character_id);
  if (!conv) { q.deletePost.run(postId); return; }
  const friend = post.tags[0] ? store.get(post.tags[0]) : null;
  const model = config.ollama.model;
  const prof = await ensureProfile(conv, model);
  const friendProf = friend ? await ensureProfile(friend, model) : null;
  const note = friend ? bondNote(conv.id, friend.id) : null;
  const out = await ollama.complete({
    model, format: 'json', timeout: 150000, options: { temperature: 0.95, num_predict: 1000 },
    messages: composePrompt({
      card: conv.card, state: conv.state, profile: prof, kind: post.kind, hint,
      recent: q.recentCaptions.all(conv.id).map((r) => r.caption),
      bonds: bondsOf(conv.id), memories: conv.state.hooks || [],
      lately: q.lifeRecent.all(conv.id, Date.now() - 2 * DAY).map((l) => l.summary),
      together: friend ? { name: friend.card.name, username: friendProf.username, gender: friend.card.gender, note, about: `${friend.card.personality} ${friend.card.life}` } : null,
    }),
  });
  const j = json(out);
  const raw = post.kind === 'story' ? [j?.photo] : (Array.isArray(j?.photos) ? j.photos : []);
  let photos = raw.filter((p) => p && short(p.description, 10)).slice(0, post.kind === 'story' ? 1 : 4)
    .map((p) => ({ description: short(p.description, 700), showsMe: p.shows_me !== false, subject: SUBJECTS.includes(p.who) ? p.who : 'both' }));
  if (!photos.length) throw new Error('Gemma non ha scritto le foto del post');
  if (friend && !photos.some((p) => p.subject === 'both')) photos[0].subject = 'both';   // la foto insieme ci deve essere
  if (friend && !note && j?.bond) q.insertBond.run(...pair(conv.id, friend.id), short(j.bond, 240), Date.now());
  post.caption = short(j.caption, post.kind === 'story' ? 120 : 1200).replace(/^"|"$/g, '');
  if (friend && !post.caption.includes(`@${friendProf.username}`)) post.caption = `${post.caption} @${friendProf.username}`.trim();
  post.location = short(j.location, 80);
  post.media = photos.map((p) => mediaFor(conv, post.kind, p, friend));
  // Prompt delle foto adesso, finché Gemma è in VRAM; le foto vanno in coda una per una
  for (const md of post.media) {
    md.prompt = await engineer(conv, friend, prof, md, post.kind, model);
    md.status = 'queued';
  }
  post.status = 'generating';
  savePost(post);
  changed(post);
  post.media.forEach((md, i) => queue.add({
    ownerId: post.owner_id, characterId: conv.id, kind: 'post.image', gpu: 'comfy',
    priority: post.requested ? queue.PRIORITY.requested : queue.PRIORITY.finish,
    payload: { postId, mediaId: md.id },
    label: post.kind === 'story' ? `Storia di ${conv.card.name}` : `Foto ${i + 1}/${post.media.length} del post di ${conv.card.name}`,
  }));
}

queue.register('post.image', async (job, { postId, mediaId }) => {
  const post = loadPost(postId);
  const md = post?.media.find((m) => m.id === mediaId);
  if (!md || md.status === 'done') return;
  const conv = store.get(post.character_id);
  if (!conv) return;
  const friend = post.tags[0] ? store.get(post.tags[0]) : null;
  md.status = 'running';
  md.startedAt = Date.now();
  md.error = null;
  savePost(post);
  changed(post);
  try {
    // le foto profilo potrebbero essere cambiate o sparite: si parte da quelle attuali
    const subject = md.subject || (md.showsMe ? 'me' : 'none');
    if (md.mode === 'scene') {
      const one = subject === 'friend' ? friend : conv;
      if (!one?.avatar) throw new Error('Il personaggio non ha più una foto profilo');
      md.sourceFile = one.avatar;
    }
    if (md.mode === 'duo') {
      if (!conv.avatar || !friend?.avatar) throw new Error('Manca una delle due foto profilo');
      md.sourceFile = conv.avatar;
      md.extraSources = [friend.avatar];
    }
    // LoRA del corpo solo con una persona sola nella foto (con due si applicherebbero a entrambe)
    const bodyOf = subject === 'me' ? conv.card : subject === 'friend' ? friend?.card : null;
    await renderMedia(md, {
      ownerId: post.owner_id, card: bodyOf || null,
      onEvent: (e) => emit(queue.channel(post.owner_id), { ...e, postId }),
    });
  } catch (e) {
    md.error = e.message;
    md.status = job.lastAttempt ? 'error' : 'queued';
    savePost(post);
    changed(post);
    if (!job.lastAttempt) throw e;
  }
  finish(post, conv);
});

/** Quando tutte le foto sono pronte (o fallite) il post si pubblica con quelle riuscite. */
function finish(post, conv) {
  if (!post.media.every((m) => ['done', 'error'].includes(m.status))) { savePost(post); changed(post); return; }
  const ok = post.media.filter((m) => m.status === 'done');
  if (!ok.length) {
    post.status = 'error';
    post.error = post.media.find((m) => m.error)?.error || 'Generazione non riuscita';
    savePost(post);
    changed(post);
    return;
  }
  post.media = ok;
  post.status = 'published';
  post.error = null;
  post.published_at = Date.now();
  savePost(post);
  if (!conv.avatar) {
    conv.avatar = (ok.find((m) => m.subject === 'me' || (!m.subject && m.showsMe)) || ok[0]).file;
    store.save(conv, { touch: false });
    emit(conv.id, { type: 'character', avatarUrl: mediaUrl(conv.avatar) });
  }
  changed(post);
  const friend = post.tags[0] ? store.get(post.tags[0]) : null;
  const name = conv.card.name;
  if (friend) notify.add(post.owner_id, { kind: 'tag', characterId: conv.id, postId: post.id, text: `${name} ha pubblicato una foto con ${friend.card.name}: «${preview(post.caption, 90)}»` });
  else if (post.kind === 'post') notify.add(post.owner_id, { kind: 'post', characterId: conv.id, postId: post.id, text: `${name} ha pubblicato un post: «${preview(post.caption, 90)}»` });
  else if (post.requested) notify.add(post.owner_id, { kind: 'post', characterId: conv.id, postId: post.id, text: `La storia di ${name} è pronta` });
  engage(post);
}

/** Gli altri personaggi vedono il post nel corso del tempo: mi piace, qualche commento. Chi è taggato reagisce per primo. */
function engage(post) {
  const others = shuffle(store.list(post.owner_id).filter((c) => c.id !== post.character_id && c.card.social !== false));
  let commenters = 0;
  for (const c of others) {
    const tagged = post.tags.includes(c.id);
    const known = !!bondNote(c.id, post.character_id);
    if (tagged || Math.random() < (known ? 0.75 : 0.45)) {
      queue.add({ ownerId: post.owner_id, characterId: c.id, kind: 'social.like', gpu: 'none', priority: queue.PRIORITY.chatter,
        payload: { postId: post.id, characterId: c.id }, delayMs: tagged ? minutes(0.5, 8) : minutes(1, 40), label: `${c.card.name} guarda il post` });
    }
    const pComment = tagged ? 0.85 : (known ? 0.5 : 0.3) * (post.kind === 'story' ? 0 : 1);
    if ((tagged || commenters < 2) && Math.random() < pComment) {
      if (!tagged) commenters++;
      queue.add({ ownerId: post.owner_id, characterId: c.id, kind: 'social.comment', gpu: 'ollama', priority: queue.PRIORITY.chatter,
        payload: { postId: post.id, characterId: c.id }, delayMs: tagged ? minutes(2, 20) : minutes(3, 90), label: `${c.card.name} commenta` });
    }
  }
}

queue.register('social.like', async (job, { postId, characterId }) => {
  const post = loadPost(postId);
  if (!post || post.status !== 'published' || !store.get(characterId)) return;
  q.like.run(postId, characterId, Date.now());
  changed(post);
});

// ---- Commenti: conversazioni di gruppo ----
const MAX_CHARACTER_COMMENTS = 16;   // sotto un post, per non far parlare i personaggi all'infinito

/** Il commento da cui parte la conversazione (le risposte di Instagram stanno tutte sotto il primo). */
function rootOf(comments, c) {
  const byId = new Map(comments.map((x) => [x.id, x]));
  let r = c;
  for (let i = 0; r?.reply_to && byId.get(r.reply_to) && i < 50; i++) r = byId.get(r.reply_to);
  return r;
}
const threadOf = (comments, root) => comments.filter((c) => rootOf(comments, c)?.id === root.id);

/** Qualcuno nella conversazione che potrebbe intervenire: chi ha già scritto lì, l'autore, chi è taggato, gli amici. */
function bystander(post, thread, exclude) {
  const ids = new Set([...thread.map((c) => c.character_id).filter(Boolean), post.character_id, ...post.tags]);
  for (const b of q.bondsOf.all(post.character_id, post.character_id)) ids.add(b.a === post.character_id ? b.b : b.a);
  const list = [...ids].filter((id) => !exclude.includes(id)).map((id) => store.get(id)).filter((c) => c && c.card.social !== false);
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

function queueReply(post, who, replyTo, { depth = 0, forUser = false, delayMs, label } = {}) {
  if (!who) return;
  queue.add({ ownerId: post.owner_id, characterId: who.id, kind: 'social.comment', gpu: 'ollama',
    priority: forUser ? queue.PRIORITY.reply : queue.PRIORITY.chatter,
    payload: { postId: post.id, characterId: who.id, replyTo, depth, forUser }, delayMs: delayMs ?? minutes(2, 30), label });
}

/** Commento o risposta di un personaggio (a un altro personaggio o a te). */
queue.register('social.comment', async (job, { postId, characterId, replyTo, forUser, depth = 0 }) => {
  const post = loadPost(postId);
  const conv = store.get(characterId);
  const author = post && store.get(post.character_id);
  if (!post || post.status !== 'published' || !conv || !author) return;
  const comments = q.comments.all(postId);
  const target = replyTo ? comments.find((c) => c.id === replyTo) : null;
  if (replyTo && !target) return;
  if (!forUser && q.charComments.get(postId).n >= MAX_CHARACTER_COMMENTS) return;
  const uname = userName(post.owner_id);
  const nameOf = (c) => (c?.character_id ? store.get(c.character_id)?.card.name || '?' : uname);
  const byId = new Map(comments.map((c) => [c.id, c]));

  // Con chi sta parlando: il personaggio a cui risponde, o l'autore del post
  const otherId = target?.character_id && target.character_id !== conv.id ? target.character_id : author.id !== conv.id ? author.id : null;
  const other = otherId && store.get(otherId);
  const note = other ? bondNote(conv.id, other.id) : null;
  // La conversazione: tutto il filo se è una risposta, altrimenti gli ultimi commenti sotto il post
  const root = target ? rootOf(comments, target) : null;
  const thread = (root ? threadOf(comments, root) : comments).slice(-10);

  const out = await ollama.complete({
    model: config.ollama.model, format: 'json', timeout: 90000, options: { temperature: 0.95, num_predict: 220 },
    messages: commentPrompt({
      card: { ...conv.card, id: conv.id }, state: conv.state, author: { id: author.id, ...author.card },
      post: { kind: post.kind, caption: post.caption, location: post.location, photos: post.media.map((m) => m.description) },
      thread: thread.map((c) => ({ name: nameOf(c), content: c.content, isUser: !c.character_id, to: c.reply_to && byId.get(c.reply_to) ? nameOf(byId.get(c.reply_to)) : null })),
      target: target ? { kind: target.character_id ? 'character' : 'user', name: nameOf(target), content: target.content } : null,
      bond: note ? { name: other.card.name, note } : null,
      needsBond: other && !note ? other.card.name : null,
      userName: uname,
      user: promptProfile(post.owner_id),
      tagged: post.tags.map((id) => store.get(id)?.card.name).filter(Boolean),
    }),
  });
  const j = json(out);
  const text = short(j?.comment || (j ? '' : out), 400).replace(/^["«]|["»]$/g, '').replace(/^@?[\w.]+:\s*/, '').replace(/^@[\w.]+\s+/, '');
  if (!text) throw new Error('Gemma non ha scritto il commento');
  if (other && !note && j?.bond) q.insertBond.run(...pair(conv.id, other.id), short(j.bond, 240), Date.now());

  const id = store.newId();
  q.insertComment.run(id, postId, conv.id, replyTo || null, text, Date.now());
  // L'autore che risponde al tuo commento spesso ci mette anche un mi piace
  const likedYours = target && !target.character_id && conv.id === author.id && Math.random() < 0.75;
  if (likedYours) q.authorLikes.run(target.id);
  changed(post);

  // Notifiche: ti ha risposto, oppure ha scritto in una conversazione dove avevi scritto anche tu
  const whose = post.character_id === conv.id ? 'al tuo commento' : `al tuo commento sotto il post di ${author.card.name}`;
  if (target && !target.character_id) notify.add(post.owner_id, { kind: 'reply', characterId: conv.id, postId, commentId: id, text: `${conv.card.name} ha risposto ${whose}: «${preview(text, 100)}»` });
  else if (root && threadOf(comments, root).some((c) => !c.character_id)) notify.add(post.owner_id, { kind: 'comment', characterId: conv.id, postId, commentId: id, text: `${conv.card.name} ha scritto nella conversazione sotto ${conv.id === author.id ? 'il suo post' : `il post di ${author.card.name}`}: «${preview(text, 100)}»` });

  // La conversazione va avanti da sola, un po' alla volta: chi è stato chiamato in causa risponde, a volte si aggiunge qualcun altro
  if (depth >= 3) return;
  if (!replyTo && conv.id !== author.id && Math.random() < 0.65) {
    queueReply(post, author, id, { depth: 1, label: `${author.card.name} risponde a ${conv.card.name}` });
  } else if (target?.character_id && target.character_id !== conv.id && Math.random() < 0.35) {
    const back = store.get(target.character_id);
    queueReply(post, back, id, { depth: depth + 1, label: `${back?.card.name} risponde a ${conv.card.name}` });
  } else if (Math.random() < 0.22) {
    const third = bystander(post, thread, [conv.id, target?.character_id].filter(Boolean));
    queueReply(post, third, id, { depth: depth + 1, delayMs: minutes(5, 45), label: `${third?.card.name} si aggiunge alla conversazione` });
  }
});

// ---------------------------------------------------------------------------
// Piano automatico: un contenuto alla volta, con un ritmo regolare e di giorno
// ---------------------------------------------------------------------------
/** Di notte i personaggi dormono: niente contenuti nuovi (commenti e mi piace già in coda vanno avanti). */
export function asleep(date = new Date()) {
  const n = config.drip.night;
  if (!n || n.from === n.to) return false;
  const h = date.getHours();
  return n.from < n.to ? h >= n.from && h < n.to : h >= n.from || h < n.to;
}

// Ogni personaggio ha il suo ritmo: la distanza tra due contenuti varia tra 0,7 e 1,3 volte la media
const jitter = (id, at) => { let h = 7; for (const ch of `${id}:${at}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 0.7 + (h % 600) / 1000; };

/** Due amici che si vedono: raro (al massimo uno ogni DRIP_MEET_DAYS giorni), di preferenza chi si conosce già. */
function canMeet(ownerId) { return Date.now() - (q.lastJoint.get(ownerId)?.at || 0) > config.drip.meetEveryDays * DAY; }
function meetFriend(c, chars) {
  if (chars.length < 2 || !canMeet(c.ownerId) || Math.random() > 0.35) return null;
  const others = chars.filter((x) => x.id !== c.id);
  const known = others.filter((x) => bondNote(c.id, x.id));
  const pool = known.length && Math.random() < 0.8 ? known : others;
  return pool[Math.floor(Math.random() * pool.length)];
}

queue.onIdle(async (ownerId) => {
  if (asleep()) return;
  if (queue.find(ownerId, (j) => (j.kind.startsWith('post.') || j.kind === 'life.catchup') && j.status !== 'error').length) return;
  const chars = store.list(ownerId).filter((c) => c.card.social !== false);
  if (!chars.length) return;
  const now = Date.now();
  if (now - (q.lastAuto.get(ownerId)?.at || 0) < config.drip.gapMinutes * 60 * 1000) return;
  const n = counters(ownerId);
  const last = (c, kind) => q.lastOf.get(c.id, kind)?.at || 0;
  const due = (kind, everyHours) => chars.filter((c) => now - last(c, kind) > everyHours * 3600 * 1000 * jitter(c.id, last(c, kind)))
    .sort((a, b) => last(a, kind) - last(b, kind))[0];
  let c;
  if (n.posts < config.drip.postsPerDay && (c = due('post', config.drip.postEveryHours))) {
    // Un'idea rimasta da quando il server era spento (e magari si è visto con qualcuno)
    const idea = q.idea.get(c.id, now - 2 * DAY);
    if (idea) q.useIdea.run(idea.id);
    const met = idea?.met_id && canMeet(ownerId) ? chars.find((x) => x.id === idea.met_id) : null;
    createPost(c, 'post', { hint: idea?.post_idea || '', withId: (met || meetFriend(c, chars))?.id });
  } else if (n.stories < config.drip.storiesPerDay && (c = due('story', config.drip.storyEveryHours))) {
    createPost(c, 'story');
  }
});

// ---------------------------------------------------------------------------
// Vita a server spento: alla riaccensione ognuno racconta cosa ha fatto nel frattempo
// ---------------------------------------------------------------------------
queue.register('life.catchup', async (job, { characterId, from, to }) => {
  const conv = store.get(characterId);
  if (!conv) return;
  const model = config.ollama.model;
  const prof = await ensureProfile(conv, model);
  const bonds = bondsOf(conv.id);
  const out = await ollama.complete({
    model, format: 'json', timeout: 120000, options: { temperature: 0.9, num_predict: 500 },
    messages: catchupPrompt({ card: conv.card, state: conv.state, profile: prof, from, to, bonds, recent: q.recentCaptions.all(conv.id).map((r) => r.caption).slice(0, 3) }),
  });
  const j = json(out);
  const summary = short(j?.summary, 600);
  if (!summary) throw new Error('Gemma non ha raccontato cosa ha fatto');
  const metName = String(j.met || '').trim().toLowerCase();
  const met = metName ? bonds.find((b) => b.name.toLowerCase() === metName || b.name.toLowerCase().startsWith(metName)) : null;
  q.insertLife.run(store.newId(), conv.id, from, to, summary, short(j.post_idea, 300), met?.id || null, Date.now());
  notify.add(conv.ownerId, { kind: 'life', characterId: conv.id, text: `Mentre eri via, ${conv.card.name}: ${preview(summary, 220)}` });
});

const beat = () => q.setMeta.run('alive_at', String(Date.now()));

/** Battito ogni minuto; se il server è rimasto spento a lungo, ognuno racconta com'è andata. */
export function startLife() {
  const prev = Number(q.meta.get('alive_at')?.value) || 0;
  const now = Date.now();
  beat();
  setInterval(beat, 60 * 1000);
  notify.prune();
  if (!prev || now - prev < config.drip.catchupHours * 3600 * 1000) return;
  console.log(`  Server spento per ${Math.round((now - prev) / 3600000)} ore: i personaggi raccontano cosa hanno fatto`);
  for (const c of store.list().filter((x) => x.card.social !== false)) {
    queue.add({ ownerId: c.ownerId, characterId: c.id, kind: 'life.catchup', gpu: 'ollama', priority: queue.PRIORITY.plan,
      payload: { characterId: c.id, from: prev, to: now }, label: `${c.card.name} racconta cosa ha fatto` });
  }
}

// ---------------------------------------------------------------------------
// Azioni dell'utente
// ---------------------------------------------------------------------------
export function getPost(ownerId, id) {
  const p = loadPost(id);
  return p && p.owner_id === ownerId ? p : null;
}

export function toggleLike(post) {
  if (q.likes.all(post.id).some((r) => r.liker === 'user')) q.unlike.run(post.id, 'user');
  else q.like.run(post.id, 'user', Date.now());
  changed(post.id);
  return publicPost(loadPost(post.id));
}

/** Il tuo commento: risponde l'autore del post, o il personaggio a cui hai risposto. */
export function addUserComment(post, { text, replyTo }) {
  const content = short(text, 600);
  if (!content) throw Object.assign(new Error('Commento vuoto'), { status: 400 });
  if (post.status !== 'published') throw Object.assign(new Error('Il post non è ancora pubblicato'), { status: 400 });
  const comments = q.comments.all(post.id);
  const target = replyTo ? comments.find((c) => c.id === replyTo) : null;
  const id = store.newId();
  q.insertComment.run(id, post.id, null, target ? target.id : null, content, Date.now());
  // Risponde subito chi hai chiamato in causa (o l'autore); a volte, più tardi, si aggiunge qualcun altro
  const responder = store.get(target?.character_id || post.character_id);
  queueReply(post, responder, id, { forUser: true, delayMs: minutes(0.2, 1), label: `${responder?.card.name} risponde al tuo commento` });
  const author = store.get(post.character_id);
  if (responder && author && responder.id !== author.id && Math.random() < 0.35) {
    queueReply(post, author, id, { depth: 1, delayMs: minutes(2, 15), label: `${author.card.name} si aggiunge alla conversazione` });
  } else if (Math.random() < 0.2) {
    const thread = target ? threadOf(comments, rootOf(comments, target)) : [];
    const third = bystander(post, thread, [responder?.id].filter(Boolean));
    queueReply(post, third, id, { depth: 1, delayMs: minutes(3, 30), label: `${third?.card.name} si aggiunge alla conversazione` });
  }
  changed(post.id);
  return publicPost(loadPost(post.id));
}

export function markSeen(post) { q.seen.run(Date.now(), post.id); }

export async function deletePost(post) {
  queue.removeWhere(post.owner_id, (j) => j.payload.postId === post.id);
  for (const m of post.media) if (m.file) await fs.rm(path.join(config.paths.media, m.file), { force: true });
  q.deletePost.run(post.id);
  emit(queue.channel(post.owner_id), { type: 'social', what: 'removed', postId: post.id });
}

/** Riprova un post non riuscito: si rifà il piano o solo le foto fallite. */
export function retryPost(post) {
  if (post.status !== 'error') throw Object.assign(new Error('Il post non è fallito'), { status: 400 });
  queue.removeWhere(post.owner_id, (j) => j.payload.postId === post.id);
  const conv = store.get(post.character_id);
  if (!post.media.length) {
    post.status = 'planned';
    post.error = null;
    savePost(post);
    queue.add({ ownerId: post.owner_id, characterId: post.character_id, kind: 'post.plan', gpu: 'ollama', priority: queue.PRIORITY.requested,
      payload: { postId: post.id }, label: `${conv?.card.name || ''} prepara ${post.kind === 'story' ? 'una storia' : 'un post'}` });
  } else {
    post.status = 'generating';
    post.error = null;
    for (const md of post.media) if (md.status !== 'done') {
      md.status = 'queued';
      md.error = null;
      queue.add({ ownerId: post.owner_id, characterId: post.character_id, kind: 'post.image', gpu: 'comfy', priority: queue.PRIORITY.requested,
        payload: { postId: post.id, mediaId: md.id }, label: `Foto del post di ${conv?.card.name || ''}` });
    }
    savePost(post);
  }
  changed(post.id);
  return publicPost(loadPost(post.id));
}

// ---------------------------------------------------------------------------
// Viste per l'interfaccia
// ---------------------------------------------------------------------------
export function feed(ownerId, { before, characterId, limit = 10 } = {}) {
  const until = Number(before) || Date.now() + 1;
  const rows = characterId ? q.feedChar.all(characterId, until, limit) : q.feed.all(ownerId, until, limit);
  return rows.map((r) => publicPost(parseRow(r)));
}

/** Storie delle ultime 24 ore, per personaggio: prima chi ha storie non ancora viste. */
export function stories(ownerId) {
  const by = new Map();
  for (const r of q.stories.all(ownerId, Date.now() - STORY_MS)) {
    if (!by.has(r.character_id)) by.set(r.character_id, []);
    by.get(r.character_id).push(publicPost(parseRow(r)));
  }
  return [...by.entries()].map(([id, list]) => ({ character: charInfo(id), stories: list, unseen: list.some((s) => !s.seen) }))
    .sort((a, b) => (b.unseen - a.unseen) || (b.stories.at(-1).publishedAt - a.stories.at(-1).publishedAt));
}

export function profileView(conv) {
  const prof = profile(conv.id);
  const mine = q.byCharacter.all(conv.id).map(parseRow);
  return {
    character: charInfo(conv.id),
    username: prof?.username || null,
    bio: prof?.bio || '',
    social: conv.card.social !== false,
    stats: { posts: q.countPosts.get(conv.id).n, likes: q.likesReceived.get(conv.id).n, bonds: bondsOf(conv.id).length },
    bonds: bondsOf(conv.id),
    posts: mine.filter((p) => p.kind === 'post' && p.status === 'published').sort((a, b) => b.published_at - a.published_at).map(publicPost),
    tagged: q.tagged.all(conv.ownerId, `%"${conv.id}"%`).map((r) => publicPost(parseRow(r))),
    stories: mine.filter((p) => p.kind === 'story' && p.status === 'published' && p.published_at > Date.now() - STORY_MS).sort((a, b) => a.published_at - b.published_at).map(publicPost),
    pending: mine.filter((p) => p.status !== 'published').sort((a, b) => a.created_at - b.created_at).map(publicPost),
  };
}

export function queueView(ownerId) {
  return {
    paused: queue.isPaused(ownerId),
    waitingForYou: !queue.userIdle(),
    asleep: asleep(),
    night: config.drip.night,
    counters: counters(ownerId),
    limits: { posts: config.drip.postsPerDay, stories: config.drip.storiesPerDay },
    jobs: queue.list(ownerId).map((j) => ({ id: j.id, kind: j.kind, label: j.label, status: j.status, error: j.error, runAfter: j.run_after, priority: j.priority })),
    posts: q.inProgress.all(ownerId).map((r) => publicPost(parseRow(r))),
  };
}

/** Foto del social per la galleria. */
export function allMedia(ownerId) {
  const out = [];
  for (const r of q.published.all(ownerId)) {
    for (const m of json(r.media) || []) {
      if (m.status === 'done' && m.file) out.push({ ...m, conversationId: r.character_id, conversationTitle: store.get(r.character_id)?.card.name, postId: r.id });
    }
  }
  return out;
}

/** Prima di eliminare un personaggio: file dei suoi post, lavori in coda, i suoi mi piace. */
export async function purgeCharacter(characterId) {
  for (const r of q.byCharacter.all(characterId)) {
    for (const m of json(r.media) || []) if (m.file) await fs.rm(path.join(config.paths.media, m.file), { force: true });
  }
  queue.removeForCharacter(characterId);
  q.likesBy.run(characterId);
}

// ---------------------------------------------------------------------------
// Per la chat: il personaggio sa cosa ha pubblicato e cosa gli hai scritto sotto
// ---------------------------------------------------------------------------
const ago = (ts) => {
  const h = (Date.now() - ts) / 3600000;
  return h < 1 ? 'less than an hour ago' : h < 36 ? `${Math.round(h)} hours ago` : `${Math.round(h / 24)} days ago`;
};

export function chatContext(conv) {
  const life = q.lifeRecent.all(conv.id, Date.now() - 2 * DAY)[0];
  const lifeLine = life ? `What you did in the last ${Math.max(1, Math.round((life.to_ts - life.from_ts) / 3600000))} hours, while you two were not in touch: ${short(life.summary, 400)}` : '';
  const prof = profile(conv.id);
  if (!prof) return lifeLine;
  const lines = [lifeLine, `Your social account: @${prof.username}; the user follows it.`].filter(Boolean);
  for (const r of q.tagged.all(conv.ownerId, `%"${conv.id}"%`).filter((p) => p.published_at > Date.now() - 4 * DAY).slice(0, 1)) {
    lines.push(`- ${store.get(r.character_id)?.card.name || 'A friend'} posted a photo of the two of you together ${ago(r.published_at)}: "${short(r.caption, 140)}"`);
  }
  for (const r of q.latest.all(conv.id, Date.now() - 4 * DAY)) {
    const likes = q.likes.all(r.id).map((l) => l.liker);
    const others = likes.filter((l) => l !== 'user').map((id) => store.get(id)?.card.name).filter(Boolean);
    const comments = q.comments.all(r.id);
    lines.push(`- your ${r.kind} ${ago(r.published_at)}: "${short(r.caption, 140)}" (${likes.includes('user') ? 'the user liked it' : 'the user has not liked it'}${others.length ? `; liked by ${others.join(', ')}` : ''}${comments.length ? `; ${comments.length} comments` : ''})`);
  }
  const mine = q.userComments.all(conv.id, Date.now() - 3 * DAY);
  if (mine.length) lines.push(`The user's recent comments on your posts: ${mine.map((c) => `"${short(c.content, 120)}" (${ago(c.created_at)})`).join('; ')}`);
  return lines.length > 1 || mine.length ? `${lines.join('\n')}\nMention these things only if it comes naturally.` : lifeLine;
}
