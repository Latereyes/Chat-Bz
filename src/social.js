import fs from 'node:fs/promises';
import path from 'node:path';
import config from './config.js';
import { db } from './db.js';
import * as ollama from './ollama.js';
import * as store from './store.js';
import * as queue from './queue.js';
import { listUsers } from './auth.js';
import { emit, mediaUrl, renderMedia } from './jobs.js';
import { getWorkflow, dimensions, dimensionsForRatio, randomSeed } from './workflows.js';
import { promptEngineerSystem, cleanPrompt } from './prompts.js';
import { profilePrompt, composePrompt, socialPhotoRequest, commentPrompt } from './social-prompts.js';

/**
 * Social dei personaggi: profilo, caroselli curati, storie, mi piace e commenti.
 *
 * Tutto passa dalla coda a goccia (queue.js): il personaggio pianifica un post (Gemma scrive didascalia e
 * foto), poi le foto si generano una alla volta quando la GPU è libera. Pubblicato il post, gli altri
 * personaggi dell'utente lo vedono nel corso del tempo: qualcuno mette mi piace, qualcuno commenta,
 * l'autore risponde. Si conoscono: la prima volta che interagiscono Gemma decide come (vicini di casa,
 * palestra, ex compagni di scuola…) e da lì resta quello. Ai tuoi commenti risponde l'autore.
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
};

const DAY = 86400 * 1000;
const STORY_MS = DAY;
const short = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
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

const userName = (ownerId) => listUsers().find((u) => u.id === ownerId)?.displayName || 'the user';

// ---------------------------------------------------------------------------
// Post: lettura, salvataggio, eventi
// ---------------------------------------------------------------------------
function loadPost(id) {
  const r = q.post.get(id);
  return r ? { ...r, media: json(r.media) || [] } : null;
}

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
const runCount = new Map();   // ownerId -> { posts, stories } creati in automatico da questa accensione
export const counters = (ownerId) => runCount.get(ownerId) || { posts: 0, stories: 0 };

export function createPost(conv, kind = 'post', { requested = false, hint = '' } = {}) {
  const id = store.newId();
  q.insertPost.run(id, conv.ownerId, conv.id, kind === 'story' ? 'story' : 'post', requested ? 1 : 0, Date.now());
  queue.add({
    ownerId: conv.ownerId, characterId: conv.id, kind: 'post.plan', gpu: 'ollama',
    priority: requested ? queue.PRIORITY.requested : queue.PRIORITY.plan,
    payload: { postId: id, hint: short(hint, 300) },
    label: `${conv.card.name} prepara ${kind === 'story' ? 'una storia' : 'un post'}`,
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

/**
 * Motore di ogni foto. Caroselli: se il personaggio compare ed è in stile Krea, "stessa persona, nuova scena"
 * a partire dalla foto profilo (il volto resta quello); altrimenti il motore del suo stile. Storie: istantanee.
 */
function mediaFor(conv, kind, photo) {
  const base = { id: store.newId(), type: 'image', description: photo.description, showsMe: !!photo.showsMe, prompt: '', seed: randomSeed(), status: 'engineering', createdAt: Date.now() };
  if (kind === 'post' && photo.showsMe && config.social.identity && conv.card.style === 'krea' && conv.avatar) {
    const w = getWorkflow('qwen-scene-real', 'image', 'scene');
    if (w?.id === 'qwen-scene-real') {
      return { ...base, mode: 'scene', workflow: w.id, workflowName: w.name, aspect: null, ...dimensionsForRatio(w, avatarRatio(conv)), sourceFile: conv.avatar };
    }
  }
  const w = getWorkflow(conv.card.style === 'zimage' ? 'zimage-turbo' : 'krea2-real', 'image');
  if (!w) throw new Error('Nessun workflow immagine disponibile su ComfyUI');
  const aspect = kind === 'story' ? '9:16' : '3:4';
  return { ...base, mode: 'text2img', workflow: w.id, workflowName: w.name, aspect, ...dimensions(w, aspect) };
}

const levelFor = (card) => (config.social.level === 'sensual' && card.intimacy !== 'mai' ? 'sensual' : 'neutral');

async function engineer(conv, prof, md, kind, model) {
  const w = getWorkflow(md.workflow, md.type, md.mode);
  const out = await ollama.complete({
    model, timeout: 120000, options: { temperature: 0.7, num_predict: 400 },
    messages: [
      { role: 'system', content: promptEngineerSystem(w) },
      { role: 'user', content: socialPhotoRequest({ card: conv.card, profile: prof, photo: md, media: md, kind, level: levelFor(conv.card) }) },
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

async function plan({ postId, hint }) {
  const post = loadPost(postId);
  if (!post || post.status !== 'planned') return;
  const conv = store.get(post.character_id);
  if (!conv) { q.deletePost.run(postId); return; }
  const model = config.ollama.model;
  const prof = await ensureProfile(conv, model);
  const out = await ollama.complete({
    model, format: 'json', timeout: 150000, options: { temperature: 0.95, num_predict: 900 },
    messages: composePrompt({
      card: conv.card, state: conv.state, profile: prof, kind: post.kind, hint,
      recent: q.recentCaptions.all(conv.id).map((r) => r.caption),
      bonds: bondsOf(conv.id), memories: conv.state.hooks || [],
    }),
  });
  const j = json(out);
  const raw = post.kind === 'story' ? [j?.photo] : (Array.isArray(j?.photos) ? j.photos : []);
  const photos = raw.filter((p) => p && short(p.description, 10)).slice(0, post.kind === 'story' ? 1 : 4)
    .map((p) => ({ description: short(p.description, 700), showsMe: p.shows_me !== false }));
  if (!photos.length) throw new Error('Gemma non ha scritto le foto del post');
  post.caption = short(j.caption, post.kind === 'story' ? 120 : 1200).replace(/^"|"$/g, '');
  post.location = short(j.location, 80);
  post.media = photos.map((p) => mediaFor(conv, post.kind, p));
  // Prompt delle foto adesso, finché Gemma è in VRAM; le foto vanno in coda una per una
  for (const md of post.media) {
    md.prompt = await engineer(conv, prof, md, post.kind, model);
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
  md.status = 'running';
  md.startedAt = Date.now();
  md.error = null;
  savePost(post);
  changed(post);
  try {
    // la foto profilo potrebbe essere cambiata o sparita: si parte da quella attuale
    if (md.mode === 'scene') {
      if (!conv.avatar) throw new Error('Il personaggio non ha più una foto profilo');
      md.sourceFile = conv.avatar;
    }
    await renderMedia(md, {
      ownerId: post.owner_id, card: md.showsMe ? conv.card : null,
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
    conv.avatar = (ok.find((m) => m.showsMe) || ok[0]).file;
    store.save(conv, { touch: false });
    emit(conv.id, { type: 'character', avatarUrl: mediaUrl(conv.avatar) });
  }
  changed(post);
  engage(post);
}

/** Gli altri personaggi vedono il post nel corso del tempo: mi piace, qualche commento. */
function engage(post) {
  const others = shuffle(store.list(post.owner_id).filter((c) => c.id !== post.character_id && c.card.social !== false));
  let commenters = 0;
  for (const c of others) {
    const known = !!bondNote(c.id, post.character_id);
    if (Math.random() < (known ? 0.75 : 0.45)) {
      queue.add({ ownerId: post.owner_id, characterId: c.id, kind: 'social.like', gpu: 'none', priority: queue.PRIORITY.chatter,
        payload: { postId: post.id, characterId: c.id }, delayMs: minutes(1, 40), label: `${c.card.name} guarda il post` });
    }
    const pComment = (known ? 0.5 : 0.3) * (post.kind === 'story' ? 0 : 1);
    if (commenters < 2 && Math.random() < pComment) {
      commenters++;
      queue.add({ ownerId: post.owner_id, characterId: c.id, kind: 'social.comment', gpu: 'ollama', priority: queue.PRIORITY.chatter,
        payload: { postId: post.id, characterId: c.id }, delayMs: minutes(3, 90), label: `${c.card.name} commenta` });
    }
  }
}

queue.register('social.like', async (job, { postId, characterId }) => {
  const post = loadPost(postId);
  if (!post || post.status !== 'published' || !store.get(characterId)) return;
  q.like.run(postId, characterId, Date.now());
  changed(post);
});

/** Commento o risposta di un personaggio (a un altro personaggio o a te). */
queue.register('social.comment', async (job, { postId, characterId, replyTo, forUser, depth = 0 }) => {
  const post = loadPost(postId);
  const conv = store.get(characterId);
  const author = post && store.get(post.character_id);
  if (!post || post.status !== 'published' || !conv || !author) return;
  const comments = q.comments.all(postId);
  const target = replyTo ? comments.find((c) => c.id === replyTo) : null;
  if (replyTo && !target) return;
  const uname = userName(post.owner_id);
  const nameOf = (c) => (c.character_id ? store.get(c.character_id)?.card.name || '?' : uname);

  // Con chi sta parlando: l'autore del post, o il personaggio a cui risponde
  const otherId = target?.character_id && target.character_id !== conv.id ? target.character_id : author.id !== conv.id ? author.id : null;
  const other = otherId && store.get(otherId);
  const note = other ? bondNote(conv.id, other.id) : null;

  const out = await ollama.complete({
    model: config.ollama.model, format: 'json', timeout: 90000, options: { temperature: 0.95, num_predict: 220 },
    messages: commentPrompt({
      card: { ...conv.card, id: conv.id }, state: conv.state, author: { id: author.id, ...author.card },
      post: { kind: post.kind, caption: post.caption, location: post.location, photos: post.media.map((m) => m.description) },
      thread: comments.slice(-8).map((c) => ({ name: nameOf(c), content: c.content })),
      target: target ? { kind: target.character_id ? 'character' : 'user', name: nameOf(target), content: target.content } : null,
      bond: note ? { name: other.card.name, note } : null,
      needsBond: other && !note ? other.card.name : null,
      userName: uname,
    }),
  });
  const j = json(out);
  const text = short(j?.comment || (j ? '' : out), 400).replace(/^["«]|["»]$/g, '').replace(/^@?[\w.]+:\s*/, '');
  if (!text) throw new Error('Gemma non ha scritto il commento');
  if (other && !note && j?.bond) q.insertBond.run(...pair(conv.id, other.id), short(j.bond, 240), Date.now());

  const id = store.newId();
  q.insertComment.run(id, postId, conv.id, replyTo || null, text, Date.now());
  // L'autore che risponde al tuo commento spesso ci mette anche un mi piace
  if (target && !target.character_id && conv.id === author.id && Math.random() < 0.75) q.authorLikes.run(target.id);
  changed(post);

  // Un po' di conversazione tra personaggi: l'autore risponde, a volte l'altro ribatte una volta
  if (!replyTo && conv.id !== author.id && Math.random() < 0.6) {
    queue.add({ ownerId: post.owner_id, characterId: author.id, kind: 'social.comment', gpu: 'ollama', priority: queue.PRIORITY.chatter,
      payload: { postId, characterId: author.id, replyTo: id, depth: 1 }, delayMs: minutes(2, 30), label: `${author.card.name} risponde a ${conv.card.name}` });
  } else if (target?.character_id && target.character_id !== conv.id && depth < 2 && Math.random() < 0.3) {
    const back = store.get(target.character_id);
    if (back) queue.add({ ownerId: post.owner_id, characterId: back.id, kind: 'social.comment', gpu: 'ollama', priority: queue.PRIORITY.chatter,
      payload: { postId, characterId: back.id, replyTo: id, depth: depth + 1 }, delayMs: minutes(2, 30), label: `${back.card.name} risponde a ${conv.card.name}` });
  }
});

// ---------------------------------------------------------------------------
// Piano automatico: un contenuto alla volta, entro i limiti per accensione
// ---------------------------------------------------------------------------
queue.onIdle(async (ownerId) => {
  if (queue.find(ownerId, (j) => j.kind.startsWith('post.') && j.status !== 'error').length) return;
  const chars = store.list(ownerId).filter((c) => c.card.social !== false);
  if (!chars.length) return;
  const n = counters(ownerId);
  const now = Date.now();
  const last = (c, kind) => q.lastOf.get(c.id, kind)?.at || 0;
  const pick = (kind, everyHours) => chars.filter((c) => now - last(c, kind) > everyHours * 3600 * 1000)
    .sort((a, b) => last(a, kind) - last(b, kind))[0];
  let c;
  if (n.posts < config.drip.maxPostsPerRun && (c = pick('post', config.drip.postEveryHours))) {
    createPost(c, 'post');
    runCount.set(ownerId, { ...n, posts: n.posts + 1 });
  } else if (n.stories < config.drip.maxStoriesPerRun && (c = pick('story', config.drip.storyEveryHours))) {
    createPost(c, 'story');
    runCount.set(ownerId, { ...n, stories: n.stories + 1 });
  }
});

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
  const target = replyTo ? q.comments.all(post.id).find((c) => c.id === replyTo) : null;
  const id = store.newId();
  q.insertComment.run(id, post.id, null, target ? target.id : null, content, Date.now());
  const responder = store.get(target?.character_id || post.character_id);
  if (responder) {
    queue.add({ ownerId: post.owner_id, characterId: responder.id, kind: 'social.comment', gpu: 'ollama', priority: queue.PRIORITY.reply,
      payload: { postId: post.id, characterId: responder.id, replyTo: id, forUser: true }, delayMs: minutes(0.2, 1),
      label: `${responder.card.name} risponde al tuo commento` });
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
  return rows.map((r) => publicPost({ ...r, media: json(r.media) || [] }));
}

/** Storie delle ultime 24 ore, per personaggio: prima chi ha storie non ancora viste. */
export function stories(ownerId) {
  const by = new Map();
  for (const r of q.stories.all(ownerId, Date.now() - STORY_MS)) {
    if (!by.has(r.character_id)) by.set(r.character_id, []);
    by.get(r.character_id).push(publicPost({ ...r, media: json(r.media) || [] }));
  }
  return [...by.entries()].map(([id, list]) => ({ character: charInfo(id), stories: list, unseen: list.some((s) => !s.seen) }))
    .sort((a, b) => (b.unseen - a.unseen) || (b.stories.at(-1).publishedAt - a.stories.at(-1).publishedAt));
}

export function profileView(conv) {
  const prof = profile(conv.id);
  const mine = q.byCharacter.all(conv.id).map((r) => ({ ...r, media: json(r.media) || [] }));
  return {
    character: charInfo(conv.id),
    username: prof?.username || null,
    bio: prof?.bio || '',
    social: conv.card.social !== false,
    stats: { posts: q.countPosts.get(conv.id).n, likes: q.likesReceived.get(conv.id).n, bonds: bondsOf(conv.id).length },
    bonds: bondsOf(conv.id),
    posts: mine.filter((p) => p.kind === 'post' && p.status === 'published').sort((a, b) => b.published_at - a.published_at).map(publicPost),
    stories: mine.filter((p) => p.kind === 'story' && p.status === 'published' && p.published_at > Date.now() - STORY_MS).sort((a, b) => a.published_at - b.published_at).map(publicPost),
    pending: mine.filter((p) => p.status !== 'published').sort((a, b) => a.created_at - b.created_at).map(publicPost),
  };
}

export function queueView(ownerId) {
  return {
    paused: queue.isPaused(ownerId),
    waitingForYou: !queue.userIdle(),
    counters: counters(ownerId),
    limits: { posts: config.drip.maxPostsPerRun, stories: config.drip.maxStoriesPerRun },
    jobs: queue.list(ownerId).map((j) => ({ id: j.id, kind: j.kind, label: j.label, status: j.status, error: j.error, runAfter: j.run_after, priority: j.priority })),
    posts: q.inProgress.all(ownerId).map((r) => publicPost({ ...r, media: json(r.media) || [] })),
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
  const prof = profile(conv.id);
  if (!prof) return '';
  const lines = [`Your social account: @${prof.username}; the user follows it.`];
  for (const r of q.latest.all(conv.id, Date.now() - 4 * DAY)) {
    const likes = q.likes.all(r.id).map((l) => l.liker);
    const others = likes.filter((l) => l !== 'user').map((id) => store.get(id)?.card.name).filter(Boolean);
    const comments = q.comments.all(r.id);
    lines.push(`- your ${r.kind} ${ago(r.published_at)}: "${short(r.caption, 140)}" (${likes.includes('user') ? 'the user liked it' : 'the user has not liked it'}${others.length ? `; liked by ${others.join(', ')}` : ''}${comments.length ? `; ${comments.length} comments` : ''})`);
  }
  const mine = q.userComments.all(conv.id, Date.now() - 3 * DAY);
  if (mine.length) lines.push(`The user's recent comments on your posts: ${mine.map((c) => `"${short(c.content, 120)}" (${ago(c.created_at)})`).join('; ')}`);
  return lines.length > 1 || mine.length ? `${lines.join('\n')}\nMention your posts or their comments only if it comes naturally.` : '';
}
