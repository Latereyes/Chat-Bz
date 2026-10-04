import express from 'express';
import os from 'node:os';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import config from './src/config.js';
import * as auth from './src/auth.js';
import * as store from './src/store.js';
import * as ollama from './src/ollama.js';
import * as comfy from './src/comfy.js';
import * as chat from './src/chat.js';
import { gpu } from './src/gpu.js';
import { bus, cancel, mediaUrl, recoverInterrupted } from './src/jobs.js';
import { workflows, loadWorkflows, publicInfo, checkAvailability } from './src/workflows.js';
import * as memory from './src/memory.js';
import * as life from './src/life.js';
import { publicCharacter, draftFromIdea, normalizeCard, RELATIONS, PACES, INTIMACY, STYLES } from './src/characters.js';
import { updateScene, initialState, DIM_LABEL, intimacyOpen, closeness } from './src/relationship.js';

const app = express();
app.set('trust proxy', false);
app.use(express.json({ limit: '2mb' }));
app.use(express.static(config.paths.public, { index: 'index.html' }));
app.use('/vendor', express.static(path.join(config.root, 'node_modules', 'marked', 'lib')));
app.use('/vendor', express.static(path.join(config.root, 'node_modules', 'dompurify', 'dist')));
app.use(auth.session);

const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  res.status(e.status || 500).json({ error: e.message });
});
const httpError = (status, message) => Object.assign(new Error(message), { status });

/** Personaggio dell'utente corrente (404 se non esiste o è di un altro utente). */
function ownConv(req) {
  const c = store.get(req.params.id);
  if (!c || c.ownerId !== req.user.id) throw httpError(404, 'Personaggio non trovato');
  return c;
}

const withUrls = (c) => ({
  ...publicCharacter(c, mediaUrl),
  state: c.state,
  running: chat.isRunning(c.id),
  messages: c.messages.map(({ sceneBefore, ...m }) => ({
    ...m,
    ...(m.media ? { media: m.media.map((md) => ({ ...md, url: mediaUrl(md.file), sourceUrl: mediaUrl(md.sourceFile) })) } : {}),
    ...(m.attachments ? { attachments: m.attachments.map((a) => ({ ...a, url: mediaUrl(a.file) })) } : {}),
  })),
});

// ---- Autenticazione ----
app.post('/api/auth/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const { token, user } = auth.login(username, password, req.socket.remoteAddress);
  auth.setSessionCookie(res, token);
  res.json({ user: auth.publicUser(user) });
}));

app.post('/api/auth/logout', (req, res) => {
  auth.logout(req.token);
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Accesso richiesto', code: 'auth_required' });
  res.json({ user: auth.publicUser(req.user) });
});

app.post('/api/auth/password', wrap(async (req, res) => {
  if (!req.user) throw httpError(401, 'Accesso richiesto');
  const { current, next } = req.body || {};
  auth.changePassword(req.user, current, next, req.token);
  res.json({ user: auth.publicUser(req.user) });
}));

// Tutto ciò che segue richiede un utente autenticato con password definitiva
app.use('/api', auth.requireUser);

// ---- Amministrazione utenti ----
app.get('/api/users', auth.requireAdmin, (req, res) => res.json(auth.listUsers()));
app.post('/api/users', auth.requireAdmin, wrap(async (req, res) => res.json(auth.createUser(req.body || {}))));
app.post('/api/users/:id/reset-password', auth.requireAdmin, wrap(async (req, res) => {
  res.json(auth.resetPassword(req.params.id, req.body?.password));
}));

// ---- Stato e configurazione ----
app.get('/api/status', wrap(async (req, res) => {
  const [o, c] = await Promise.all([ollama.isUp(), comfy.isUp()]);
  res.json({ ollama: o, comfy: c, gpu: gpu.state() });
}));

app.get('/api/config', wrap(async (req, res) => {
  let models = [];
  try { models = (await ollama.listModels()).filter((m) => m.tools); } catch {}
  res.json({
    defaultModel: config.ollama.model,
    options: { relations: RELATIONS, paces: PACES, intimacy: INTIMACY, styles: STYLES, dims: DIM_LABEL },
    models,
    workflows: workflows().map(publicInfo),
  });
}));

app.post('/api/workflows/reload', auth.requireAdmin, wrap(async (req, res) => {
  loadWorkflows();
  res.json((await checkAvailability(comfy.listModels)).map(publicInfo));
}));

app.post('/api/gpu/release', wrap(async (req, res) => { await gpu.release(); res.json(gpu.state()); }));

// ---- Eventi in tempo reale (SSE), solo quelli delle proprie conversazioni ----
app.get('/api/events', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const userId = req.user.id;
  const send = (evt) => res.write(`data: ${JSON.stringify(evt)}\n\n`);
  const onEvent = (evt) => { if (store.get(evt.conversationId)?.ownerId === userId) send(evt); };
  const onGpu = (state) => send({ type: 'gpu', state });
  send({ type: 'gpu', state: gpu.state() });
  bus.on('event', onEvent);
  gpu.on('state', onGpu);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(ping); bus.off('event', onEvent); gpu.off('state', onGpu); });
});

// ---- Personaggi ----
app.get('/api/characters', (req, res) => res.json(store.list(req.user.id).map((c) => publicCharacter(c, mediaUrl))));

app.post('/api/characters/draft', wrap(async (req, res) => {
  const { idea, current, model } = req.body || {};
  const card = await gpu.run('ollama', 'Scrivo la scheda del personaggio', () => draftFromIdea(String(idea || '').slice(0, 2000), { model, current: current ? normalizeCard(current) : null }));
  res.json(card);
}));

app.post('/api/characters', wrap(async (req, res) => {
  const c = store.create(req.user.id, req.body || {});
  if (c.card.greeting) {
    c.messages.push({ id: store.newId(), role: 'assistant', content: c.card.greeting, media: [], status: 'done', presence: c.state.scene.presence, createdAt: Date.now() });
  }
  await store.save(c);
  res.json(withUrls(c));
}));

app.get('/api/characters/:id', wrap(async (req, res) => res.json(withUrls(ownConv(req)))));

app.patch('/api/characters/:id', wrap(async (req, res) => {
  const c = ownConv(req);
  const prev = c.card;
  c.card = normalizeCard({ ...prev, ...(req.body || {}) });
  // Cambiare il rapporto di partenza ha senso solo prima di iniziare: altrimenti il rapporto è quello vissuto
  if (c.card.relation !== prev.relation && !c.messages.some((m) => m.role === 'user')) c.state.rel = initialState(c.card).rel;
  await store.save(c, { touch: false });
  res.json(withUrls(c));
}));

app.delete('/api/characters/:id', wrap(async (req, res) => {
  const c = ownConv(req);
  chat.stop(c.id);
  for (const m of c.messages) for (const md of m.media || []) cancel(md.id);
  await store.remove(c.id);
  res.json({ ok: true });
}));

/** Correzione a mano della scena (chip in alto nella chat). */
app.patch('/api/characters/:id/scene', wrap(async (req, res) => {
  const c = ownConv(req);
  c.state.scene = updateScene(c.state.scene, req.body || {});
  await store.save(c, { touch: false });
  res.json(c.state.scene);
}));

/** Rapporto e memorie (pannello "Rapporto" della scheda). */
app.get('/api/characters/:id/relationship', wrap(async (req, res) => {
  const c = ownConv(req);
  res.json({ state: c.state, closeness: closeness(c.state.rel), intimacyOpen: intimacyOpen(c.card, c.state.rel), memories: memory.list(c.id) });
}));
app.delete('/api/characters/:id/memories/:memId', wrap(async (req, res) => { memory.remove(ownConv(req).id, req.params.memId); res.json({ ok: true }); }));

/** Ricomincia da capo: cancella messaggi, memorie e rapporto (la scheda resta). */
app.post('/api/characters/:id/reset', wrap(async (req, res) => {
  const c = ownConv(req);
  chat.stop(c.id);
  for (const m of c.messages) for (const md of m.media || []) cancel(md.id);
  await store.removeMessages(c, c.messages.map((m) => m.id));
  memory.clear(c.id);
  c.state = initialState(c.card);
  if (c.card.greeting) c.messages.push({ id: store.newId(), role: 'assistant', content: c.card.greeting, media: [], status: 'done', presence: c.state.scene.presence, createdAt: Date.now() });
  await store.save(c);
  res.json(withUrls(c));
}));

/** Usa una foto generata come immagine del profilo. */
app.post('/api/characters/:id/avatar', wrap(async (req, res) => {
  const c = ownConv(req);
  const file = String(req.body?.file || '');
  const ok = c.messages.some((m) => (m.media || []).some((md) => md.file === file && md.type === 'image'));
  if (!ok) throw httpError(400, 'Foto non valida');
  c.avatar = file;
  await store.save(c, { touch: false });
  res.json({ avatarUrl: mediaUrl(file) });
}));

app.post('/api/characters/:id/messages', wrap(async (req, res) => {
  const c = ownConv(req);
  const { text, tool, model, attachments } = req.body || {};
  res.json(await chat.send(c, { text, tool, model, attachments }));
}));

app.post('/api/characters/:id/regenerate', wrap(async (req, res) => res.json(chat.regenerate(ownConv(req), { model: req.body?.model }))));

app.post('/api/characters/:id/stop', wrap(async (req, res) => { chat.stop(ownConv(req).id); res.json({ ok: true }); }));

// ---- Immagini allegate (già ridimensionate dal browser) ----
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const looksLikeImage = (b) => (b[0] === 0xff && b[1] === 0xd8) // JPEG
  || (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) // PNG
  || (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP');

app.post('/api/uploads', express.raw({ type: Object.keys(IMAGE_TYPES), limit: '16mb' }), wrap(async (req, res) => {
  const ctype = (req.headers['content-type'] || '').split(';')[0];
  if (req.body?.length > 15 * 1024 * 1024) throw httpError(413, 'Immagine troppo grande (max 15 MB)');
  const ext = IMAGE_TYPES[ctype];
  if (!ext || !Buffer.isBuffer(req.body) || req.body.length < 16 || !looksLikeImage(req.body)) {
    throw httpError(400, 'Formato non supportato: servono immagini JPEG, PNG o WebP');
  }
  const file = `${req.user.id}/up-${randomUUID()}.${ext}`;
  await fs.mkdir(path.join(config.paths.media, req.user.id), { recursive: true });
  await fs.writeFile(path.join(config.paths.media, file), req.body);
  res.json({ file, url: mediaUrl(file), width: Number(req.query.w) || 0, height: Number(req.query.h) || 0 });
}));

// ---- Media ----
app.post('/api/characters/:id/media/:mediaId/cancel', wrap(async (req, res) => {
  ownConv(req);
  res.json({ ok: cancel(req.params.mediaId) });
}));

app.post('/api/characters/:id/messages/:messageId/media/:mediaId/regenerate', wrap(async (req, res) => {
  res.json(chat.regenerateMedia(ownConv(req), req.params.messageId, req.params.mediaId, { prompt: req.body?.prompt }));
}));

app.get('/api/media', (req, res) => res.json(store.allMedia(req.user.id).map((m) => ({ ...m, url: mediaUrl(m.file) }))));

// I file generati sono visibili solo al proprietario
app.get('/media/:owner/:file', (req, res) => {
  if (!req.user || req.user.mustChangePassword || req.user.id !== req.params.owner) return res.sendStatus(404);
  if (!/^[\w-]+\.\w+$/.test(req.params.file)) return res.sendStatus(404);
  res.sendFile(path.join(config.paths.media, req.params.owner, req.params.file), { maxAge: '7d', immutable: true }, (err) => {
    if (err && !res.headersSent) res.sendStatus(404);
  });
});

app.get('/{*path}', (req, res) => res.sendFile(path.join(config.paths.public, 'index.html')));

recoverInterrupted();
life.start();
const server = app.listen(config.port, config.host, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i?.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`\n  ChatBz pronto`);
  console.log(`  → su questo PC:     http://localhost:${config.port}`);
  for (const ip of ips) console.log(`  → telefono/tablet: http://${ip}:${config.port}   (stessa rete Wi-Fi)`);
  console.log(`\n  Ollama:  ${config.ollama.url}  (${config.ollama.model})`);
  console.log(`  ComfyUI: ${config.comfy.url}`);
  console.log(`  Workflow: ${workflows().map((w) => `${w.name} [${w.type}]`).join(', ')}\n`);
  comfy.connect().catch(() => console.warn('  ⚠ ComfyUI non raggiungibile per ora'));
  // Workflow utilizzabili = quelli con tutti i modelli presenti su ComfyUI (ricontrollo ogni 5 minuti)
  const refresh = () => checkAvailability(comfy.listModels).then((list) => {
    const off = list.filter((w) => w.available === false);
    if (off.length) console.log(`  Workflow non disponibili (modelli mancanti): ${off.map((w) => `${w.name} → ${w.missing.join(', ')}`).join(' | ')}`);
  });
  refresh();
  setInterval(refresh, 5 * 60 * 1000);
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`\n  ⚠ La porta ${config.port} è già in uso: ChatBz è probabilmente già avviato in un'altra finestra.\n    Chiudi quella finestra oppure usa un'altra porta (set PORT=3101 prima di avviare).\n`);
  else console.error(e);
  process.exit(1);
});
