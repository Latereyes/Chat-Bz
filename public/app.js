// ChatBz 2 — frontend (vanilla JS, nessun build step). Base: interfaccia di LocalAI.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Icone (stile lucide) ----------
const P = {
  panel: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 3v18"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  gallery: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  spark: '<path d="M12 2c.5 4.8 2.7 7.6 7.5 8.3v1.4C14.7 12.4 12.5 15.2 12 22h-.1c-.5-6.8-2.7-9.6-7.5-10.3v-1.4C9.2 9.6 11.4 6.8 11.9 2z" fill="currentColor" stroke="none"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  video: '<rect x="2" y="5" width="14" height="14" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
  brain: '<path d="M9.5 2A2.5 2.5 0 0 0 7 4.5v.1A3 3 0 0 0 4.6 9 3 3 0 0 0 5 14.6 3 3 0 0 0 8 19.5 2.5 2.5 0 0 0 12 21V4.5A2.5 2.5 0 0 0 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 1 17 4.5v.1A3 3 0 0 1 19.4 9a3 3 0 0 1-.4 5.6 3 3 0 0 1-3 4.9A2.5 2.5 0 0 1 12 21"/>',
  send: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>',
  down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
  pencil: '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  text: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h10"/>',
  x: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  chip: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6M9 9h1"/>',
  clip: '<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  page: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h4"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3"/><path d="m16 7 3 3"/><path d="m19 4 2 2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  heart: '<path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.2 5.2 3 1.6-1.8 3.1-3 5.2-3 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/>',
  pin: '<path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9"/>',
  tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor"/>',
  social: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".6" fill="currentColor"/>',
  comment: '<path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6.2A8 8 0 1 1 21 12z"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  open: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
};
const icon = (n, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${P[n] || ''}</svg>`;
$$('[data-icon]').forEach((el) => { el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon, el.classList.contains('auth-mark') ? 38 : 18)); });

// ---------- Stato ----------
const prefs = (() => { try { return JSON.parse(localStorage.getItem('chatbz.prefs') || '{}'); } catch { return {}; } })();
const savePrefs = () => { try { localStorage.setItem('chatbz.prefs', JSON.stringify(prefs)); } catch {} };

const state = {
  config: null,
  convs: [],        // personaggi (lista)
  conv: null,       // personaggio aperto, con messaggi
  tool: null,
  gpu: null,
  view: 'home',
  stick: true,
  attachments: [],
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (!opts.raw && data.code === 'auth_required') showLogin();
    if (!opts.raw && data.code === 'password_change_required') showPasswordForm(true);
    throw Object.assign(new Error(data.error || `Errore ${res.status}`), { status: res.status, code: data.code });
  }
  return data;
}

// ---------- Testo dei messaggi ----------
marked.use({
  gfm: true, breaks: true,
  renderer: { link({ href, text }) { return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`; } },
});
const renderMd = (text) => DOMPurify.sanitize(marked.parse(text || ''), { ADD_ATTR: ['target'] });

async function copyText(text, btn) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  if (btn) {
    const old = btn.innerHTML;
    btn.innerHTML = icon('check', 16);
    setTimeout(() => { btn.innerHTML = old; }, 1400);
  }
}

// ---------- Elementi ----------
const el = {
  app: $('#app'), thread: $('#thread'), scroller: $('#scroller'),
  input: $('#input'), composer: $('#composer'), send: $('#send'),
  convList: $('#conv-list'), modelName: $('#model-name'), modelMenu: $('#model-menu'),
  gpuPill: $('#gpu-pill'), gpuLabel: $('#gpu-label'), gpuMenu: $('#gpu-menu'),
  toBottom: $('#to-bottom'), gallery: $('#gallery'), lightbox: $('#lightbox'), lbBody: $('#lb-body'),
  head: $('#char-head'), sceneChip: $('#scene-chip'), sceneMenu: $('#scene-menu'),
};

const initial = (name) => esc((name || '?').trim().slice(0, 1).toUpperCase());
const avatarHtml = (c, cls = '') => (c?.studio ? `<span class="ava ava-letter ${cls}">${icon('spark', 16)}</span>` : c?.avatarUrl
  ? `<img class="ava ${cls}" src="${esc(c.avatarUrl)}" alt="">`
  : `<span class="ava ava-letter ${cls}">${initial(c?.name)}</span>`);

// ---------- Sidebar ----------
const isMobile = () => matchMedia('(max-width: 860px)').matches;
function setSidebar(open) {
  el.app.classList.toggle('collapsed', !open);
  if (!isMobile()) { prefs.sidebar = open; savePrefs(); }
}
setSidebar(isMobile() ? false : prefs.sidebar !== false);
$('#btn-collapse').onclick = () => setSidebar(false);
$('#btn-open').onclick = () => setSidebar(true);
$('#scrim').onclick = () => setSidebar(false);
$('#btn-new').onclick = () => { openCharModal(null); if (isMobile()) setSidebar(false); };
$('#btn-home').onclick = () => { showHome(); if (isMobile()) setSidebar(false); };
$('#btn-gallery').onclick = () => { openGallery(); if (isMobile()) setSidebar(false); };
$('#btn-studio').onclick = () => { openStudio(); if (isMobile()) setSidebar(false); };
$('#btn-social').onclick = () => { openSocial(); if (isMobile()) setSidebar(false); };

const timeLabel = (ts) => {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const diff = (now - d) / 86400000;
  return diff < 6 ? d.toLocaleDateString('it-IT', { weekday: 'short' }) : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
};
const sceneLabel = (s) => (s ? `${s.presence === 'together' ? 'Insieme' : 'A distanza'}${s.place ? ` · ${s.place}` : ''}` : '');

// Nella lista dei messaggi compaiono solo le chat iniziate dall'utente (oltre al saluto), dalla più recente.
// Le altre restano raggiungibili da Personaggi e dal profilo; la chat aperta resta visibile finché ci sei dentro.
const sortedConvs = () => [...state.convs].sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
function renderConvList() {
  const shown = sortedConvs().filter((c) => c.started || state.conv?.id === c.id);
  el.convList.innerHTML = shown.map((c) => `
    <div class="conv char-row ${state.conv?.id === c.id ? 'active' : ''}" data-id="${c.id}">
      ${avatarHtml(c)}
      <div class="char-meta"><div class="char-top"><b>${esc(c.name)}</b><small>${timeLabel(c.updatedAt)}</small></div>
      <span class="conv-title">${c.previewFromUser ? 'Tu: ' : ''}${esc(c.preview || sceneLabel(c.scene))}</span></div>
    </div>`).join('') || `<div class="conv-group">${state.convs.length ? 'Nessuna chat iniziata: scegli un personaggio da Personaggi' : 'Nessun personaggio'}</div>`;
}

el.convList.addEventListener('click', (e) => {
  const row = e.target.closest('.conv');
  if (!row) return;
  openConv(row.dataset.id);
  if (isMobile()) setSidebar(false);
});

async function loadConvs() {
  state.convs = await api('/api/characters').catch(() => []);
  renderConvList();
  if (state.view === 'home') renderHome();
  if (state.view === 'social') renderSide();
}

// ---------- Viste / routing ----------
let titleBase = 'ChatBz';
function setTitle(name) {
  titleBase = name ? `${name} · ChatBz` : 'ChatBz';
  document.title = `${notif.unread ? `(${notif.unread}) ` : ''}${titleBase}`;
}
function showView(v) {
  state.view = v;
  for (const name of ['home', 'chat', 'gallery', 'social']) $(`#view-${name}`).hidden = v !== name;
  $('#btn-gallery').classList.toggle('active', v === 'gallery');
  $('#btn-social').classList.toggle('active', v === 'social');
  $('#btn-home').classList.toggle('active', v === 'home');
  $('#btn-studio').classList.toggle('active', v === 'chat' && !!state.conv?.studio);
  setStudioMode(v === 'chat' && !!state.conv?.studio);
  const tab = v === 'chat' ? (state.conv?.studio ? 'studio' : '') : v;
  $$('#tabbar [data-tab-go]').forEach((b) => b.classList.toggle('on', b.dataset.tabGo === tab));
  el.app.dataset.view = v === 'chat' && state.conv?.studio ? 'studio' : v;
}

function showHome(push = true) {
  state.conv = null;
  showView('home');
  renderHead();
  renderHome();
  setTitle('Personaggi');
  if (push && location.pathname !== '/personaggi') history.pushState(null, '', '/personaggi');
  renderConvList();
}

function renderHome() {
  const h = new Date().getHours();
  $('#home-title').textContent = state.convs.length
    ? (h < 6 ? 'Ancora sveglio?' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera') + ', con chi parli?'
    : 'Crea il tuo primo personaggio';
  $('#char-grid').innerHTML = state.convs.map((c) => `
    <button class="char-tile" data-id="${c.id}">${avatarHtml(c, 'big')}<b>${esc(c.name)}</b><small>${esc(sceneLabel(c.scene))}</small></button>`).join('')
    + `<button class="char-tile new" data-new>${icon('plus', 28)}<b>Nuovo personaggio</b><small>da un'idea in una frase</small></button>`;
}
$('#char-grid').onclick = (e) => {
  const t = e.target.closest('.char-tile'); if (!t) return;
  if (t.dataset.new !== undefined) openCharModal(null); else openConv(t.dataset.id);
};

async function openConv(id, push = true) {
  let c;
  try { c = await api(`/api/characters/${id}`); }
  catch { return showHome(); }
  state.conv = c;
  showView('chat');
  el.thread.innerHTML = '';
  for (const m of c.messages) renderMessage(m);
  setTitle(c.name);
  if (push && location.pathname !== `/c/${id}`) history.pushState(null, '', `/c/${id}`);
  renderHead();
  renderConvList();
  updateSend();
  scrollToBottom(true);
  if (!isMobile()) el.input.focus();
}

window.addEventListener('popstate', route);
function route() {
  const m = location.pathname.match(/^\/c\/([\w-]+)/);
  if (m) openConv(m[1], false);
  else if (location.pathname.startsWith('/studio')) openStudio(false);
  else if (location.pathname.startsWith('/galleria')) openGallery(false);
  else if (location.pathname.startsWith('/social')) openSocial(location.pathname.split('/')[2] || null, false);
  else if (location.pathname.startsWith('/personaggi')) showHome(false);
  else openSocial(null, false);   // la home è il social
}

// Sezioni principali dal basso (mobile)
$('#tabbar').onclick = (e) => {
  const go = e.target.closest('[data-tab-go]')?.dataset.tabGo;
  if (go === 'social') openSocial();
  else if (go === 'home') showHome();
  else if (go === 'new') openCharModal(null);
  else if (go === 'studio') openStudio();
  else if (go === 'gallery') openGallery();
};

// ---------- Intestazione: personaggio e scena ----------
function renderHead() {
  const c = state.conv;
  el.head.hidden = !c;
  $('#btn-char-social').hidden = !c || !!c.studio;
  if (!c) { $('#btn-studio-clear').hidden = true; return; }
  $('#char-ava').innerHTML = avatarHtml(c);
  $('#char-name').textContent = c.name;
  $('#btn-studio-clear').hidden = !c.studio;
  el.sceneChip.hidden = !!c.studio;
  if (c.studio) return;
  const s = c.scene || c.state?.scene;
  el.sceneChip.innerHTML = `${icon(s?.presence === 'together' ? 'heart' : 'pin', 13)}<span>${esc(sceneLabel(s))}</span>`;
  el.sceneChip.classList.toggle('together', s?.presence === 'together');
}
$('#char-who').onclick = () => state.conv && !state.conv.studio && openCharModal(state.conv);
el.sceneChip.onclick = (e) => {
  e.stopPropagation();
  const s = state.conv?.scene || {};
  const f = el.sceneMenu;
  f.presence.value = s.presence || 'apart';
  f.place.value = s.place || '';
  f.activity.value = s.activity || '';
  f.outfit.value = s.outfit || '';
  f.hidden = !f.hidden;
};
el.sceneMenu.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = el.sceneMenu;
  try {
    const scene = await api(`/api/characters/${state.conv.id}/scene`, { method: 'PATCH', body: { presence: f.presence.value, place: f.place.value, activity: f.activity.value, outfit: f.outfit.value } });
    state.conv.scene = scene;
    f.hidden = true;
    renderHead();
  } catch (err) { alert(err.message); }
});
document.addEventListener('click', (e) => { if (!e.target.closest('.scene-wrap')) el.sceneMenu.hidden = true; });

function setAvatar(id, url) {
  for (const c of [state.conv, ...state.convs]) if (c?.id === id) c.avatarUrl = url;
  if (cmChar?.id === id && !cm.hidden) { cmChar.avatarUrl = url; showCmAvatar(); }
  renderHead();
  renderConvList();
  if (state.conv?.id === id) for (const a of $$('.msg-ai .avatar', el.thread)) a.innerHTML = avatarHtml(state.conv);
}

// ---------- Scroll ----------
el.scroller.addEventListener('scroll', () => {
  const gap = el.scroller.scrollHeight - el.scroller.scrollTop - el.scroller.clientHeight;
  state.stick = gap < 140;
  el.toBottom.hidden = gap < 400;
});
el.toBottom.onclick = () => scrollToBottom(true);
function scrollToBottom(force) {
  if (force || state.stick) el.scroller.scrollTop = el.scroller.scrollHeight;
}

// ---------- Messaggi ----------
const findMsg = (id) => state.conv?.messages.find((m) => m.id === id);

function upsertMsg(m) {
  if (!state.conv) return m;
  const i = state.conv.messages.findIndex((x) => x.id === m.id);
  if (i >= 0) { Object.assign(state.conv.messages[i], m); return state.conv.messages[i]; }
  state.conv.messages.push(m);
  return m;
}

/** A distanza: ogni paragrafo è un messaggio a sé (bolle). Insieme: prosa, con le *azioni* in corsivo. */
function renderText(m) {
  if (m.presence === 'together') return `<div class="md prose">${renderMd(m.content)}</div>`;
  const parts = (m.content || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return parts.map((p) => `<div class="bubble-ai">${renderMd(p)}</div>`).join('');
}

function isLastAi(m) {
  if (state.conv?.studio) return false;
  const last = state.conv?.messages.at(-1);
  return last && last.id === m.id;
}

function renderMessage(m) {
  let node = document.getElementById(`m-${m.id}`);
  $('.studio-empty', el.thread)?.remove();
  if (m.role === 'user') {
    const imgs = (m.attachments || []).map((a, i) => `<img src="${esc(a.url)}" alt="" data-att="${i}" loading="lazy">`).join('');
    const TOOL_LABEL = { photo: ['image', 'Foto'], video: ['video', 'Video'] };
    const tl = TOOL_LABEL[m.tool];
    const tag = tl ? `<div class="tag">${icon(tl[0], 13)}${tl[1]}</div>` : m.studio ? studioTag(m.studio) : '';
    const story = m.story ? `<div class="story-ref">${m.story.url ? `<img src="${esc(m.story.url)}" alt="">` : ''}<span>Risposta alla sua storia${m.story.caption ? ` «${esc(m.story.caption)}»` : ''}</span></div>` : '';
    const html = `${story}${imgs ? `<div class="user-images">${imgs}</div>` : ''}${m.content || tag ? `<div class="bubble">${tag}${esc(m.content)}</div>` : ''}`;
    if (node) { node.innerHTML = html; return; }
    el.thread.insertAdjacentHTML('beforeend', `<div class="msg msg-user" id="m-${m.id}">${html}</div>`);
    return;
  }
  if (!node) {
    el.thread.insertAdjacentHTML('beforeend', `<div class="msg msg-ai" id="m-${m.id}">
      <div class="avatar">${avatarHtml(state.conv)}</div>
      <div class="ai-body">
        <div class="status-line" hidden></div>
        <div class="ai-text"></div>
        <div class="media-grid"></div>
        <div class="msg-error" hidden></div>
        <div class="msg-tools" hidden></div>
      </div></div>`);
    node = document.getElementById(`m-${m.id}`);
  }
  const live = m.status === 'pending' || m.status === 'streaming' || m.status === 'waiting';
  node.classList.toggle('together', m.presence === 'together');
  node.classList.toggle('initiative', !!m.initiative);

  const st = $('.status-line', node);
  const showStatus = live && !m.content && !(m.media || []).length;
  st.hidden = !showStatus;
  if (showStatus) {
    const txt = m.status === 'waiting' ? `aspetta la GPU (${esc(m.waitReason || 'occupata')})…` : '';
    st.innerHTML = `<span class="typing"><i></i><i></i><i></i></span>${txt ? `<span>${txt}</span>` : ''}`;
  }

  const txt = $('.ai-text', node);
  txt.innerHTML = renderText(m);
  txt.classList.toggle('cursor', m.status === 'streaming' && !!m.content);

  for (const media of m.media || []) renderMedia(m, media);
  $('.media-grid', node).classList.toggle('multi', (m.media || []).filter((x) => x.type === 'image').length > 1);

  const err = $('.msg-error', node);
  err.hidden = !m.error;
  if (m.error) err.textContent = `⚠ ${m.error}`;

  const tools = $('.msg-tools', node);
  tools.hidden = live || (!m.content && !(m.media || []).length);
  if (!tools.hidden) {
    const tps = m.stats?.evalCount && m.stats?.evalMs ? `${(m.stats.evalCount / (m.stats.evalMs / 1000)).toFixed(0)} tok/s` : '';
    tools.innerHTML = `<span class="stats">${timeLabel(m.createdAt)}</span>
      ${m.content ? `<button data-copy-msg title="Copia">${icon('copy', 16)}</button>` : ''}
      ${isLastAi(m) ? `<button data-regen title="Rigenera la risposta">${icon('refresh', 16)}</button>` : ''}
      ${tps ? `<span class="stats">${tps}</span>` : ''}`;
  }
  if (m.status === 'stopped' && !m.content && !(m.media || []).length) txt.innerHTML = '<p style="color:var(--faint)">Interrotto.</p>';
}

/** Il tasto "rigenera" sta solo sull'ultima risposta. */
function refreshTools() {
  for (const m of state.conv?.messages.slice(-3) || []) if (m.role === 'assistant') renderMessage(m);
}

const pending = new Set();
function scheduleRender(m) {
  if (pending.has(m.id)) return;
  pending.add(m.id);
  requestAnimationFrame(() => { pending.delete(m.id); renderMessage(m); scrollToBottom(); });
}

el.thread.addEventListener('click', async (e) => {
  const cm = e.target.closest('[data-copy-msg]');
  if (cm) return copyText(findMsg(cm.closest('.msg').id.slice(2))?.content || '', cm);
  if (e.target.closest('[data-regen]')) {
    if (state.conv?.running) return;
    try {
      state.conv.running = true; updateSend();
      await api(`/api/characters/${state.conv.id}/regenerate`, { body: { model: currentModel() } });
    } catch (err) { state.conv.running = false; updateSend(); alert(err.message); }
    return;
  }
  const act = e.target.closest('[data-media-act]');
  if (act) return mediaAction(act);
  const ui = e.target.closest('.user-images img');
  if (ui) {
    const m = findMsg(ui.closest('.msg').id.slice(2));
    const a = m?.attachments?.[ui.dataset.att];
    if (a) openLightbox({ url: a.url, type: 'image', id: a.id || 'img', workflowName: 'Foto inviata', prompt: a.description || '', width: a.width, height: a.height });
    return;
  }
  const img = e.target.closest('img.result');
  if (img) {
    const card = img.closest('.media-card');
    const m = findMsg(card.dataset.msg);
    openLightbox(m?.media.find((x) => x.id === card.dataset.id));
  }
});

// ---------- Eventi dal server ----------
let es, esWasOpen = false, lastEventAt = Date.now(), hiddenAt = 0;
function connectEvents() {
  if (es) es.close();
  lastEventAt = Date.now();
  es = new EventSource('/api/events');
  es.onopen = () => {
    if (esWasOpen) resync();   // dopo una disconnessione: quello che è successo nel frattempo
    esWasOpen = true;
  };
  es.onmessage = (e) => { lastEventAt = Date.now(); try { onEvent(JSON.parse(e.data)); } catch (err) { console.error(err); } };
}

/**
 * Riallinea la vista aperta con il server: dopo una disconnessione, o quando torni sulla pagina
 * (sul telefono il browser congela le pagine in background e gli eventi persi non arrivano più).
 */
function resync() {
  loadNotifs();
  loadConvs();
  if (state.view === 'chat' && state.conv) { if (state.conv.studio) openStudio(false); else openConv(state.conv.id, false); }
  else if (state.view === 'social') refreshSocial();
  else if (state.view === 'gallery') openGallery(false);
  const pm = $('#post-modal');
  if (!pm.hidden && pm.dataset.post) api(`/api/social/posts/${pm.dataset.post}`).then(updatePost).catch(() => {});
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (!started || Date.now() - hiddenAt < 4000) return;
  if (!es || es.readyState === EventSource.CLOSED || Date.now() - lastEventAt > 45000) connectEvents();   // onopen → resync
  else resync();
});
// Connessione muta (il server manda un segnale ogni 20 s): si riapre
setInterval(() => { if (started && !document.hidden && Date.now() - lastEventAt > 50000) connectEvents(); }, 15000);

function onEvent(evt) {
  if (evt.type === 'ping') return;
  if (evt.type === 'gpu') return renderGpu(evt.state);
  if (evt.type === 'character') return setAvatar(evt.conversationId, evt.avatarUrl);
  if (evt.type === 'social' || evt.postId) return onSocialEvent(evt);
  if (evt.type === 'done' || evt.type === 'message') clearTimeout(onEvent.t), (onEvent.t = setTimeout(loadConvs, 400));
  if (!state.conv || evt.conversationId !== state.conv.id) return;

  switch (evt.type) {
    case 'message': {
      const m = upsertMsg(evt.message);
      if (m.role === 'assistant' && m.status === 'pending') { state.conv.running = true; updateSend(); }
      renderMessage(m);
      refreshTools();
      scrollToBottom(m.role === 'user' || m.initiative);
      break;
    }
    case 'removed': {
      state.conv.messages = state.conv.messages.filter((m) => m.id !== evt.messageId);
      document.getElementById(`m-${evt.messageId}`)?.remove();
      break;
    }
    case 'status': {
      const m = findMsg(evt.messageId); if (!m) break;
      m.status = evt.status; m.waitReason = evt.reason;
      renderMessage(m);
      break;
    }
    case 'delta': {
      const m = findMsg(evt.messageId); if (!m) break;
      m.status = 'streaming';
      if (evt.content) m.content += evt.content;
      scheduleRender(m);
      break;
    }
    case 'content': {
      const m = findMsg(evt.messageId); if (!m) break;
      m.content = evt.content;
      scheduleRender(m);
      break;
    }
    case 'scene': {
      state.conv.scene = evt.scene;
      renderHead();
      const m = findMsg(evt.messageId);
      if (m) { m.presence = evt.presence; scheduleRender(m); }
      break;
    }
    case 'state': {
      state.conv.state = evt.state;
      state.conv.scene = evt.state.scene;
      renderHead();
      break;
    }
    case 'media': {
      const m = findMsg(evt.messageId); if (!m) break;
      m.media = m.media || [];
      const i = m.media.findIndex((x) => x.id === evt.media.id);
      const prev = i >= 0 ? m.media[i] : null;
      const md = { ...(prev || {}), ...evt.media };
      if (md.status !== 'running') { delete md._preview; delete md._phase; delete md._value; delete md._max; }
      if (i >= 0) m.media[i] = md; else m.media.push(md);
      renderMessage(m);
      scrollToBottom(!prev);
      break;
    }
    case 'prompt_delta': {
      const [m, md] = findMedia(evt.mediaId); if (!md) break;
      md._draft = (md._draft || '') + evt.delta;
      renderMedia(m, md);
      break;
    }
    case 'progress': {
      const [, md] = findMedia(evt.mediaId); if (!md) break;
      if (evt.phase) { md._phase = PHASES[evt.phase] || evt.phase; md._max = 0; }
      if (evt.max) { md._value = evt.value; md._max = evt.max; md._phase = md._phase === 'Codifica del prompt' || !md._phase ? 'Generazione' : md._phase; }
      const card = document.querySelector(`.media-card[data-id="${md.id}"]`);
      if (card) patchProgress(card, md);
      break;
    }
    case 'preview': {
      const [, md] = findMedia(evt.mediaId); if (!md) break;
      md._preview = evt.dataUrl;
      const card = document.querySelector(`.media-card[data-id="${md.id}"]`);
      if (card) patchProgress(card, md);
      break;
    }
    case 'done': {
      const m = findMsg(evt.messageId); if (!m) break;
      m.status = evt.status; m.error = evt.error; m.stats = evt.stats;
      state.conv.running = false;
      renderMessage(m);
      updateSend();
      break;
    }
  }
}

// ---------- Modello ----------
function currentModel() { return prefs.model || state.config?.defaultModel; }
function renderModel() {
  const name = currentModel() || '';
  const models = state.config?.models || [];
  const cur = models.find((m) => m.name === name);
  el.modelName.textContent = cur?.label || name.replace(/:latest$/, '');
  el.modelMenu.innerHTML = models.length
    ? models.map((m) => `<button class="menu-item" data-model="${esc(m.name)}" title="${esc(m.name)}"><div>${esc(m.label || m.name)}<small>${esc([m.params, m.quant, m.vision ? 'vede le immagini' : ''].filter(Boolean).join(' · '))}</small></div>${m.name === name ? `<span class="check">${icon('check', 16)}</span>` : ''}</button>`).join('')
    : '<div class="menu-note">Nessun modello Ollama con supporto ai tool trovato.</div>';
}
el.modelMenu.onclick = (e) => {
  const b = e.target.closest('[data-model]'); if (!b) return;
  prefs.model = b.dataset.model; savePrefs(); renderModel(); el.modelMenu.hidden = true;
};
document.addEventListener('click', (e) => {
  if (!e.target.closest('#model-menu') && !e.target.closest('[data-user-act="model"]')) el.modelMenu.hidden = true;
  if (!e.target.closest('#gpu-menu')) el.gpuMenu.hidden = true;
});

// ---------- Composer ----------
const coarse = matchMedia('(pointer: coarse)').matches;
function autosize() { el.input.style.height = 'auto'; el.input.style.height = `${Math.min(el.input.scrollHeight, 200)}px`; }
el.input.addEventListener('input', () => { autosize(); updateSend(); });
el.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.isComposing) { e.preventDefault(); el.composer.requestSubmit(); }
});

function updateSend() {
  const running = !!state.conv?.running;
  const uploading = state.attachments.some((a) => !a.file);
  el.send.classList.toggle('stop', running);
  el.send.innerHTML = icon(running ? 'stop' : 'send', 18);
  el.send.title = running ? 'Interrompi' : 'Invia';
  el.send.disabled = !running && (uploading || (!el.input.value.trim() && !state.attachments.length && !state.tool));
}

// Foto dell'utente (ridimensionate nel browser)
const MAX_ATT = 4, MAX_SIDE = 1600;
const attBox = $('#attachments');
const fileInput = $('#file-input'), cameraInput = $('#camera-input');

/** Ridimensiona e carica una foto: { file, url, width, height }. */
async function uploadImage(f) {
  const { blob, width, height } = await prepareImage(f);
  const res = await fetch(`/api/uploads?w=${width}&h=${height}`, { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Caricamento non riuscito');
  return data;
}

async function addFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  for (const f of list) {
    if (state.attachments.length >= MAX_ATT) { alert(`Massimo ${MAX_ATT} foto per messaggio`); break; }
    const att = { key: Math.random().toString(36).slice(2), preview: URL.createObjectURL(f) };
    state.attachments.push(att);
    renderAttachments();
    try {
      Object.assign(att, await uploadImage(f));
    } catch (err) {
      state.attachments = state.attachments.filter((a) => a !== att);
      alert(err.message);
    }
    renderAttachments();
  }
}

function renderAttachments() {
  attBox.hidden = !state.attachments.length;
  attBox.innerHTML = state.attachments.map((a) => `<div class="att ${a.file ? '' : 'loading'}" data-key="${a.key}">
    <img src="${a.preview}" alt="">${a.file ? '' : '<span class="spin"></span>'}
    <button type="button" class="att-x" data-remove="${a.key}" title="Rimuovi">${icon('close', 12)}</button></div>`).join('');
  updateSend();
}
attBox.addEventListener('click', (e) => {
  const k = e.target.closest('[data-remove]')?.dataset.remove;
  if (!k) return;
  state.attachments = state.attachments.filter((a) => a.key !== k);
  renderAttachments();
});
$('#btn-attach').onclick = () => fileInput.click();
$('#btn-camera').onclick = () => cameraInput.click();
for (const inp of [fileInput, cameraInput]) inp.onchange = () => { addFiles(inp.files); inp.value = ''; };
el.input.addEventListener('paste', (e) => {
  const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
  if (files.length) { e.preventDefault(); addFiles(files); }
});
const dropZone = $('#view-chat');
dropZone.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); el.composer.classList.add('drag'); } });
dropZone.addEventListener('dragleave', (e) => { if (!dropZone.contains(e.relatedTarget)) el.composer.classList.remove('drag'); });
dropZone.addEventListener('drop', (e) => {
  if (!e.dataTransfer.files.length) return;
  e.preventDefault();
  el.composer.classList.remove('drag');
  addFiles(e.dataTransfer.files);
});

$$('.chip[data-tool]').forEach((c) => {
  c.onclick = () => {
    state.tool = state.tool === c.dataset.tool ? null : c.dataset.tool;
    $$('.chip[data-tool]').forEach((x) => x.classList.toggle('on', x.dataset.tool === state.tool));
    updateSend();
    el.input.focus();
  };
});

el.composer.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.conv) return;
  if (state.conv.running) {
    return api(`${convPath()}/stop`, { method: 'POST' }).catch(() => {});
  }
  let text = el.input.value.trim();
  if (!text && !state.attachments.length && !state.tool) return;
  if (state.attachments.some((a) => !a.file)) return;
  if (!text && state.tool) text = state.tool === 'photo' ? 'mi mandi una foto?' : 'mi mandi un video?';
  await sendMessage(text, state.tool);
});

async function sendMessage(text, tool) {
  const atts = state.attachments.filter((a) => a.file);
  el.input.value = ''; autosize();
  state.attachments = [];
  state.tool = null;
  $$('.chip[data-tool]').forEach((x) => x.classList.remove('on'));
  renderAttachments();
  try {
    state.conv.running = true;
    updateSend();
    state.stick = true;
    const attachments = atts.map(({ file, width, height }) => ({ file, width, height }));
    const out = await api(`${convPath()}/messages`, {
      body: state.conv.studio ? { text, model: currentModel(), attachments, ...readStudioOpts() } : { text, tool, model: currentModel(), attachments },
    });
    // Gli eventi in tempo reale possono arrivare prima della risposta HTTP: non sovrascrivere ciò che è già arrivato
    for (const m of [out.userMessage, out.message]) if (!findMsg(m.id)) renderMessage(upsertMsg(m));
    refreshTools();
    scrollToBottom(true);
    const mine = state.convs.find((c) => c.id === state.conv?.id);
    if (mine) { mine.started = true; mine.lastMessageAt = Date.now(); renderConvList(); }
  } catch (err) {
    if (state.conv) state.conv.running = false;
    el.input.value = text; autosize();
    state.attachments = atts;
    renderAttachments();
    alert(err.message);
  }
  updateSend();
}

// ---------- Scheda del personaggio ----------
const cm = $('#char-modal'), cf = $('#char-form');
let cmChar = null;

function fillOptions() {
  const o = state.config?.options || {};
  for (const sel of $$('select[data-opts]', cf)) {
    sel.innerHTML = Object.entries(o[sel.dataset.opts] || {}).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('');
  }
}

const CARD_FIELDS = ['name', 'age', 'gender', 'style', 'personality', 'life', 'speech', 'boundaries', 'look', 'relation', 'pace', 'intimacy', 'startPresence', 'startPlace', 'greeting'];
// Taglie del corpo (→ LoRA delle foto): automatiche, valgono solo per l'aspetto da cui sono state ricavate
let cardBody = null;
function bodySummary(card) {
  const opts = state.config?.options?.body || {};
  const parts = Object.entries(card.body || {}).filter(([k]) => opts[k]).map(([k, s]) => `${opts[k].label.toLowerCase()} ${opts[k].sizes[s] || s}`);
  return parts.length ? `Fisico nelle foto (automatico, dall'aspetto): ${parts.join(', ')}.` : '';
}
// Forze regolate a mano nello studio (personaggio creato da una sua foto): vincono sulle taglie automatiche
let cardManual = null;
// Cursori del fisico a mano nella scheda (stessi dello studio): spenti = taglie automatiche dall'aspetto
function renderManualBox() {
  const parts = state.config?.options?.body || {};
  $('#cm-manual-box').innerHTML = Object.entries(parts).map(([k, b]) => {
    const [lo, hi] = b.range || [-8, 8];
    const v = cardManual?.[k] ?? 0;
    return `<label title="${esc(b.label)}: negativo = più piccolo, 0 = spento, positivo = più grande"><span>${esc(b.label)}</span><input type="range" data-part="${k}" min="${lo}" max="${hi}" step="0.5" value="${v}"><output>${v}</output></label>`;
  }).join('') + `<small class="hint">${cf.style.value === 'krea' ? 'Valgono per le foto in chat e sul social e sostituiscono le taglie ricavate dall\'aspetto.' : 'Valgono solo con lo stile «Realistico spontaneo (Krea 2)»: con questo stile le foto non le usano.'}</small>`;
}
function showBody() {
  const p = $('#cm-body');
  const woman = cf.gender.value !== 'uomo';
  $('#cm-manual-row').hidden = !woman;
  $('#cm-manual').checked = !!cardManual;
  $('#cm-manual-box').hidden = !cardManual || !woman;
  if (cardManual && woman) { renderManualBox(); p.hidden = true; return; }
  const same = cardBody && cardBody.look === cf.look.value;
  p.textContent = !woman ? '' : same ? bodySummary(cardBody) : cf.look.value.trim() ? "Il fisico nelle foto verrà ricavato dall'aspetto al salvataggio." : '';
  p.hidden = !p.textContent;
}
$('#cm-manual').addEventListener('change', (e) => {
  if (e.target.checked) {
    // si parte dalle forze delle taglie automatiche, se ci sono
    const opts = state.config?.options?.body || {};
    cardManual = Object.fromEntries(Object.keys(opts).map((k) => [k, (cardBody?.look === cf.look.value && opts[k].strengths?.[cardBody.body?.[k]]) || 0]));
  } else cardManual = null;
  showBody();
});
$('#cm-manual-box').addEventListener('input', (e) => {
  const i = e.target.closest('input[data-part]');
  if (!i || !cardManual) return;
  i.nextElementSibling.textContent = i.value;
  cardManual[i.dataset.part] = Number(i.value);
});
function fillCard(card) {
  for (const k of CARD_FIELDS) if (cf[k] && card[k] !== undefined) cf[k].value = card[k];
  cf.initiative.checked = card.initiative !== false;
  cf.social.checked = card.social !== false;
  cardBody = card.body ? { look: card.look, body: card.body } : null;
  cardManual = card.bodyManual ? { ...card.bodyManual } : null;
  showBody();
}
function readCard() {
  const out = {};
  for (const k of CARD_FIELDS) out[k] = cf[k].value;
  out.age = Number(out.age);
  out.initiative = cf.initiative.checked;
  out.social = cf.social.checked;
  if (cardBody && cardBody.look === out.look) out.body = cardBody.body;
  out.bodyManual = cardManual;
  return out;
}
cf.look.addEventListener('input', showBody);
cf.gender.addEventListener('change', showBody);
cf.style.addEventListener('change', () => { if (cardManual) renderManualBox(); });

function setTab(tab) {
  $$('.tab', cm).forEach((t) => t.classList.toggle('on', t.dataset.tab === tab));
  $$('[data-pane]', cm).forEach((p) => { p.hidden = p.dataset.pane !== tab; });
  if (tab === 'rel') renderRelationship();
}
$('#cm-tabs').onclick = (e) => { const t = e.target.closest('.tab'); if (t) setTab(t.dataset.tab); };

// Foto da cui nasce un personaggio nuovo (caricata o dallo studio): dà l'aspetto e diventa il profilo
let cmPhoto = null;
function showPhoto() {
  const img = $('#cm-photo-img');
  img.hidden = !cmPhoto;
  $('img', img).src = cmPhoto?.url || '';
  $('#cm-photo-x').hidden = !cmPhoto;
  $('#cm-photo-label').textContent = cmPhoto ? 'Riscrivi dalla foto' : 'Da una foto';
  $('#cm-photo-hint').textContent = cmPhoto
    ? "Sarà l'immagine del profilo e il volto di riferimento delle sue foto. Scrivi un'idea qui sopra e premi «Riscrivi dalla foto» per cambiare il resto."
    : "Oppure parti da una foto: l'aspetto viene dalla foto, che diventa anche l'immagine del profilo. L'idea qui sopra, se c'è, guida il resto.";
}
async function draftFromPhoto(photo) {
  cmPhoto = photo;
  showPhoto();
  const btns = [$('#cm-photo-btn'), $('#cm-draft')];
  btns.forEach((b) => { b.disabled = true; });
  const label = $('#cm-photo-label');
  label.textContent = 'Guardo la foto…';
  showErr(cf);
  try {
    const r = await api('/api/characters/draft-from-photo', { body: { file: photo.file, idea: cf.idea.value, model: currentModel(), bodyManual: photo.bodyManual || null } });
    if (cmPhoto === photo && !cm.hidden) { fillCard(r.card); cf.idea.value = ''; }
  } catch (err) { showErr(cf, err.message); }
  btns.forEach((b) => { b.disabled = false; });
  showPhoto();
}
$('#cm-photo-btn').onclick = () => (cmPhoto ? draftFromPhoto(cmPhoto) : $('#cm-photo-input').click());
$('#cm-photo-img').onclick = () => $('#cm-photo-input').click();
$('#cm-photo-x').onclick = () => { cmPhoto = null; showPhoto(); };
$('#cm-photo-input').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const label = $('#cm-photo-label');
  label.textContent = 'Carico la foto…';
  try { await draftFromPhoto(await uploadImage(f)); }
  catch (err) { showErr(cf, err.message); showPhoto(); }
};

// Foto profilo di un personaggio esistente: generata dallo studio con il suo aspetto, o caricata
function showCmAvatar() {
  const box = $('#cm-avatar');
  box.hidden = !cmChar;
  if (!cmChar) return;
  const c = state.convs.find((x) => x.id === cmChar.id) || cmChar;
  $('.ava-prev', box).innerHTML = c.avatarUrl ? `<img src="${esc(c.avatarUrl)}" alt="">` : initial(c.name);
  $('#cm-ava-gen').innerHTML = `${icon('spark', 16)}${c.avatarUrl ? 'Rigenera ritratto' : 'Genera ritratto'}`;
}
$('#cm-ava-gen').onclick = async (e) => {
  if (!cmChar) return;
  const btn = e.currentTarget, hint = $('#cm-ava-hint');
  btn.disabled = true;
  try {
    await api('/api/studio/messages', { body: {
      text: 'Foto profilo: ritratto a mezzo busto, sguardo in camera, espressione naturale che rispecchia il carattere, sfondo semplice e sfocato, luce naturale morbida.',
      characterId: cmChar.id, avatarFor: cmChar.id, aspect: '1:1', model: currentModel(),
    } });
    hint.textContent = 'Il ritratto si sta generando nello Studio: appena pronto diventa la foto profilo. Se non ti piace, rigeneralo.';
  } catch (err) { hint.textContent = err.message; }
  btn.disabled = false;
};
$('#cm-ava-up').onclick = () => $('#cm-ava-input').click();
$('#cm-ava-input').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f || !cmChar) return;
  const hint = $('#cm-ava-hint');
  hint.textContent = 'Carico la foto…';
  try {
    const up = await uploadImage(f);
    const r = await api(`/api/characters/${cmChar.id}/avatar`, { body: { file: up.file } });
    setAvatar(cmChar.id, r.avatarUrl);
    showCmAvatar();
    hint.textContent = 'Foto profilo aggiornata.';
  } catch (err) { hint.textContent = err.message; }
};

function openCharModal(c, { photo } = {}) {
  cmChar = c;
  cmPhoto = null;
  showPhoto();
  showCmAvatar();
  $('#cm-ava-hint').textContent = 'È anche il volto di riferimento delle sue foto sul social.';
  $('#cm-photo').hidden = !!c;
  fillOptions();
  cf.reset();
  showErr(cf);
  fillCard(c ? c.card : { relation: 'sconosciuti', pace: 'media', intimacy: 'confidenza', style: 'krea', startPresence: 'apart', age: 25 });
  $('#cm-title').textContent = c ? c.name : 'Nuovo personaggio';
  $('#cm-save').textContent = c ? 'Salva' : 'Crea e inizia';
  $('#cm-delete').hidden = !c;
  $('#cm-tabs').hidden = !c;
  $('#cm-draft-label').textContent = c ? 'Modifica con Gemma' : 'Scrivi la scheda';
  cf.idea.placeholder = c ? 'Cosa vuoi cambiare? «più spigliata», «ha appena cambiato lavoro»…' : "Un'idea in una frase: «barista di Bologna, ironica, timida con chi non conosce»… oppure lascia vuoto per una sorpresa";
  setTab('card');
  cm.hidden = false;
  if (photo && !c) draftFromPhoto(photo);
}

$('#cm-draft').onclick = async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  const label = $('#cm-draft-label');
  const old = label.textContent;
  label.textContent = 'Gemma sta scrivendo…';
  showErr(cf);
  try {
    const hasCard = cmChar || cf.name.value.trim();
    const card = await api('/api/characters/draft', { body: { idea: cf.idea.value, current: hasCard ? readCard() : null, model: currentModel() } });
    fillCard(card);
    cf.idea.value = '';
  } catch (err) { showErr(cf, err.message); }
  label.textContent = old;
  btn.disabled = false;
};

cf.addEventListener('submit', async (e) => {
  e.preventDefault();
  showErr(cf);
  const btn = $('#cm-save');
  btn.disabled = true;
  try {
    if (cmChar) {
      const c = await api(`/api/characters/${cmChar.id}`, { method: 'PATCH', body: readCard() });
      cm.hidden = true;
      await loadConvs();
      if (state.conv?.id === c.id) { state.conv.name = c.name; state.conv.card = c.card; renderHead(); }
    } else {
      const c = await api('/api/characters', { body: { ...readCard(), avatarFile: cmPhoto?.file } });
      cm.hidden = true;
      await loadConvs();
      openConv(c.id);
    }
  } catch (err) { showErr(cf, err.message); }
  btn.disabled = false;
});

$('#cm-delete').onclick = async () => {
  if (!cmChar || !confirm(`Eliminare ${cmChar.name}, la vostra conversazione, i ricordi e tutte le foto?`)) return;
  await api(`/api/characters/${cmChar.id}`, { method: 'DELETE' }).catch((e) => alert(e.message));
  cm.hidden = true;
  await loadConvs();
  showHome();
};

$('#cm-reset').onclick = async () => {
  if (!cmChar || !confirm(`Ricominciare da capo con ${cmChar.name}? Messaggi, ricordi e rapporto verranno cancellati; la scheda resta.`)) return;
  try {
    await api(`/api/characters/${cmChar.id}/reset`, { method: 'POST' });
    cm.hidden = true;
    await loadConvs();
    openConv(cmChar.id, false);
  } catch (e) { alert(e.message); }
};

const KIND = { fact: 'Fatto', moment: 'Momento', promise: 'Promessa', joke: 'Battuta', evolution: 'È cambiata' };
async function renderRelationship() {
  const body = $('#rel-body');
  body.innerHTML = '<p class="hint">Carico…</p>';
  try {
    const r = await api(`/api/characters/${cmChar.id}/relationship`);
    const dims = state.config?.options?.dims || {};
    const st = r.state;
    body.innerHTML = `
      <div class="rel-bars">${Object.entries(dims).map(([k, l]) => `<div class="rel-bar ${k}"><span>${esc(l)}</span><div class="bar"><i style="width:${st.rel[k]}%"></i></div><small>${st.rel[k]}</small></div>`).join('')}</div>
      <p class="hint">Vicinanza ${r.closeness}/100 · intimità ${r.intimacyOpen ? '<b>aperta</b>' : 'non ancora'}${st.scene?.mood ? ` · umore: ${esc(st.scene.mood)}` : ''}</p>
      ${st.relNote ? `<p class="rel-note">${esc(st.relNote)}</p>` : ''}
      ${st.hooks?.length ? `<h3>Ha in mente</h3><ul class="hooks">${st.hooks.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
      ${st.summary ? `<h3>La vostra storia</h3><p class="rel-note">${esc(st.summary)}</p>` : ''}
      <h3>Ricordi</h3>
      ${r.memories.length ? `<div class="mem-list">${r.memories.slice().reverse().map((m) => `<div class="mem" data-mem="${m.id}"><span class="mem-kind">${KIND[m.kind] || m.kind}</span><span class="mem-text">${esc(m.content)}</span><button class="icon-btn" data-forget="${m.id}" title="Dimentica">${icon('trash', 14)}</button></div>`).join('')}</div>`
        : '<p class="hint">Ancora nessun ricordo: si formano quando la conversazione si ferma per qualche minuto.</p>'}`;
  } catch (e) { body.innerHTML = `<p class="auth-error">${esc(e.message)}</p>`; }
}
$('#rel-body').onclick = async (e) => {
  const b = e.target.closest('[data-forget]'); if (!b) return;
  await api(`/api/characters/${cmChar.id}/memories/${b.dataset.forget}`, { method: 'DELETE' }).catch(() => {});
  b.closest('.mem').remove();
};
cm.addEventListener('click', (e) => { if (e.target === cm || e.target.closest('[data-close]')) cm.hidden = true; });

// ---------- Media ----------
const PHASES = {
  'Modello': 'Carico il modello', 'Text encoder': 'Carico il text encoder', 'Video VAE': 'Carico il VAE', 'Audio VAE': 'Carico il VAE audio',
  'VAE': 'Carico il VAE', 'Prompt': 'Codifica del prompt', 'Prompt / dimensioni / durata': 'Codifica del prompt',
  'Sampler': 'Generazione', 'SamplerCustomAdvanced': 'Generazione', 'VAEDecode': 'Decodifica',
  'VAEDecodeAudio': 'Decodifica audio', 'CreateVideo': 'Montaggio video', 'SaveVideo': 'Salvataggio', 'SaveImage': 'Salvataggio',
};
const fmtTime = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`; };

function statusText(md) {
  switch (md.status) {
    case 'engineering': return 'Scrivo il prompt…';
    case 'queued': return 'In coda';
    case 'running': return `<span class="elapsed" data-start="${md.startedAt || Date.now()}">${fmtTime(Date.now() - (md.startedAt || Date.now()))}</span>`;
    case 'done': return md.startedAt && md.finishedAt ? `in ${fmtTime(md.finishedAt - md.startedAt)}` : '';
    case 'error': return 'Errore';
    case 'cancelled': return 'Annullato';
    default: return '';
  }
}

function renderMedia(msg, md) {
  const node = document.getElementById(`m-${msg.id}`);
  if (!node) return;
  const grid = $('.media-grid', node);
  let card = grid.querySelector(`[data-id="${md.id}"]`);
  const ratio = (md.width || 1) / (md.height || 1);
  const sig = `${md.status}|${md.url || ''}`;

  if (!card) {
    card = document.createElement('div');
    card.className = 'media-card';
    card.dataset.id = md.id;
    card.dataset.msg = msg.id;
    grid.append(card);
  }
  if (card.dataset.sig !== sig) {
    card.dataset.sig = sig;
    card.style.maxWidth = `${Math.min(560, Math.round(460 * ratio))}px`;
    const meta = [md.seconds ? `${md.seconds} s` : '', md.width && md.height ? `${md.width}×${md.height}` : ''].filter(Boolean).join(' · ');
    let frame = '';
    if (md.status === 'done' && md.url) {
      frame = md.type === 'video'
        ? `<video src="${md.url}" controls playsinline preload="metadata" loop></video>`
        : `<img class="result" src="${md.url}" alt="" loading="lazy">`;
    } else if (['engineering', 'queued', 'running'].includes(md.status)) {
      const label = md.status === 'engineering' ? (md.type === 'video' ? 'Prepara il video…' : 'Prepara la foto…')
        : md.status === 'queued' ? 'In coda: attendo la GPU…' : '';
      frame = `<img class="preview" alt="" ${md._preview ? `src="${md._preview}"` : 'hidden'}><div class="shimmer"></div>
        ${label ? `<div class="media-state"><div class="big">${icon(md.type, 26)}<span>${label}</span></div></div>` : ''}
        ${md.status === 'running' ? `<div class="media-overlay"><div class="row"><span class="phase">${esc(md._phase || 'Avvio…')}</span><span class="pct"></span></div><div class="bar"><i></i></div></div>` : ''}`;
    }
    const showPrompt = md.status === 'engineering' || card.dataset.promptOpen === '1';
    card.innerHTML = `
      <div class="media-head">${md.sourceUrl ? `<img class="src-thumb" src="${esc(md.sourceUrl)}" alt="" title="Immagine di partenza">` : icon(md.type, 15)}<span class="name">${esc(md.workflowName || '')}</span><span class="sep">·</span><span class="meta">${esc(meta)}</span><span class="grow"></span><span class="st">${statusText(md)}</span></div>
      ${frame ? `<div class="media-frame" style="aspect-ratio:${md.width}/${md.height}">${frame}</div>` : ''}
      ${md.status === 'error' ? `<div class="media-error">${esc(md.error || 'Errore sconosciuto')}</div>` : ''}
      <div class="media-prompt" ${showPrompt ? '' : 'hidden'}><pre>${esc(md.prompt || md._draft || '')}</pre></div>
      ${mediaActions(md)}`;
  } else {
    $('.st', card).innerHTML = statusText(md);
  }
  if (md.status === 'engineering') $('.media-prompt pre', card).textContent = md._draft || md.prompt || '';
  if (md.status === 'running') patchProgress(card, md);
}

function mediaActions(md) {
  const b = (act, ic, label) => `<button type="button" data-media-act="${act}">${icon(ic, 15)}${label}</button>`;
  if (md.status === 'engineering') return '';
  if (md.status === 'queued' || md.status === 'running') return `<div class="media-actions"><span class="grow"></span>${b('cancel', 'x', 'Annulla')}</div>`;
  const ext = md.type === 'video' ? 'mp4' : 'png';
  return `<div class="media-actions">
    ${md.status === 'done' ? `<a href="${md.url}" download="chatbz-${md.id.slice(0, 8)}.${ext}">${icon('download', 15)}Scarica</a>` : ''}
    ${b('regenerate', 'refresh', md.status === 'done' ? 'Rigenera' : 'Riprova')}
    ${md.prompt ? b('prompt', 'text', 'Prompt') : ''}
    <span class="grow"></span>
    ${md.status === 'done' && md.type === 'image' && !state.conv?.studio ? b('avatar', 'user', 'Profilo') : ''}
    ${md.status === 'done' && md.type === 'image' && state.conv?.studio ? b('animate', 'video', 'Anima') : ''}
    ${md.status === 'done' && md.type === 'image' && state.conv?.studio ? b('newchar', 'user', 'Crea personaggio') : ''}
    ${md.status === 'done' && md.type === 'image' && state.conv?.studio && md.characterId && state.convs.some((c) => c.id === md.characterId) ? b('avatar', 'user', 'Foto profilo') : ''}
    ${md.status === 'done' && md.type === 'image' ? b('zoom', 'open', '') : ''}
  </div>`;
}

function patchProgress(card, md) {
  const pv = $('.preview', card);
  if (pv && md._preview && pv.src !== md._preview) { pv.src = md._preview; pv.hidden = false; }
  const phase = $('.phase', card);
  if (phase) phase.textContent = md._phase || 'Avvio…';
  const pct = $('.pct', card), bar = $('.bar i', card);
  if (md._max > 1) {
    if (pct) pct.textContent = `${md._value}/${md._max}`;
    if (bar) bar.style.width = `${(md._value / md._max) * 100}%`;
  } else if (pct) pct.textContent = '';
}

function findMedia(mediaId) {
  for (const m of state.conv?.messages || []) {
    const md = (m.media || []).find((x) => x.id === mediaId);
    if (md) return [m, md];
  }
  return [];
}

async function mediaAction(btn) {
  const card = btn.closest('.media-card');
  const [msg, md] = findMedia(card.dataset.id);
  if (!md) return;
  const act = btn.dataset.mediaAct;
  const cid = state.conv.id;
  const base = convPath();
  if (act === 'cancel') return api(`${base}/media/${md.id}/cancel`, { method: 'POST' });
  if (act === 'animate') {
    const text = prompt('Come si muove la scena? (facoltativo: lascia vuoto e decide Gemma)', '');
    if (text === null) return;
    return api(`${base}/messages/${msg.id}/media/${md.id}/animate`, { body: { text, model: currentModel() } }).catch((e) => alert(e.message));
  }
  if (act === 'zoom') return openLightbox(md);
  // con il fisico a mano (anche tutto a 0) il personaggio eredita quelle forze
  if (act === 'newchar') return openCharModal(null, { photo: { file: md.file, url: md.url, bodyManual: md.manualBody ? Object.fromEntries(md.manualBody.map((l) => [l.part, l.strength])) : null } });
  if (act === 'avatar') {
    // nello studio: foto profilo del personaggio scelto come soggetto
    const target = state.conv.studio ? md.characterId : cid;
    return api(`/api/characters/${target}/avatar`, { body: { file: md.file } })
      .then((r) => { setAvatar(target, r.avatarUrl); if (state.conv.studio) btn.textContent = 'Foto profilo ✓'; }).catch((e) => alert(e.message));
  }
  if (act === 'regenerate') {
    return api(`${base}/messages/${msg.id}/media/${md.id}/regenerate`, { method: 'POST', body: {} })
      .catch((e) => alert(e.message));
  }
  if (act === 'prompt') {
    const box = $('.media-prompt', card);
    const open = box.hidden;
    box.hidden = !open;
    card.dataset.promptOpen = open ? '1' : '';
    if (open) {
      box.innerHTML = `<textarea spellcheck="false">${esc(md.prompt)}</textarea>
        <div class="row"><button type="button" class="btn" data-media-act="copy-prompt">Copia</button><button type="button" class="btn primary" data-media-act="run-edited">Genera con questo prompt</button></div>`;
    }
    return;
  }
  if (act === 'copy-prompt') return copyText($('textarea', card).value, btn);
  if (act === 'run-edited') {
    const prompt = $('textarea', card).value;
    card.dataset.promptOpen = '';
    $('.media-prompt', card).hidden = true;
    return api(`${base}/messages/${msg.id}/media/${md.id}/regenerate`, { method: 'POST', body: { prompt } })
      .catch((e) => alert(e.message));
  }
}

setInterval(() => {
  for (const e of $$('.elapsed')) e.textContent = fmtTime(Date.now() - Number(e.dataset.start));
}, 1000);

// ---------- GPU ----------
function renderGpu(s) {
  state.gpu = s;
  const pill = el.gpuPill;
  pill.classList.remove('ollama', 'comfy', 'busy');
  let label;
  if (s.active) {
    pill.classList.add('busy', s.active.who === 'comfy' ? 'comfy' : 'ollama');
    label = s.active.phase || (s.active.who === 'comfy' ? 'ComfyUI al lavoro' : 'Gemma al lavoro');
  } else if (s.owner === 'ollama') { pill.classList.add('ollama'); label = 'Gemma in VRAM'; }
  else if (s.owner === 'comfy') { pill.classList.add('comfy'); label = 'ComfyUI in VRAM'; }
  else label = 'GPU libera';
  if (s.queued?.length) label += ` · +${s.queued.length} in coda`;
  el.gpuLabel.textContent = label;
  if (!el.gpuMenu.hidden) renderGpuMenu();
}

function renderGpuMenu() {
  const s = state.gpu || {};
  const who = { ollama: 'Ollama (Gemma)', comfy: 'ComfyUI', none: '—' };
  el.gpuMenu.innerHTML = `
    <div class="menu-note"><b>VRAM condivisa</b><br>Ollama e ComfyUI si alternano sulla GPU: quando uno serve, l'altro viene scaricato.</div>
    <div class="menu-sep"></div>
    <div class="menu-note">In memoria: ${who[s.owner] || 'nessuno'}<br>
    ${s.active ? `In corso: ${esc(s.active.label)}${s.active.phase ? ` — ${esc(s.active.phase)}` : ''}<br>` : ''}
    ${s.queued?.length ? `In coda: ${s.queued.map(esc).join(', ')}` : ''}</div>
    <div class="menu-sep"></div>
    <button class="menu-item" id="btn-release">${icon('chip', 16)}<div>Libera la VRAM<small>Scarica tutti i modelli</small></div></button>`;
  $('#btn-release').onclick = async () => { el.gpuMenu.hidden = true; await api('/api/gpu/release', { method: 'POST' }).catch((e) => alert(e.message)); };
}
el.gpuPill.onclick = (e) => { e.stopPropagation(); el.modelMenu.hidden = true; el.gpuMenu.hidden = !el.gpuMenu.hidden; if (!el.gpuMenu.hidden) renderGpuMenu(); };

/** Ridimensiona nel browser (max 1600 px, JPEG) rispettando l'orientamento EXIF delle foto del telefono. */
async function prepareImage(file) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { throw new Error(`Formato non supportato: ${file.name || 'immagine'}`); }
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
  return { blob, width: w, height: h };
}

// ---------- Studio immagini (l'assistente immagini, separato dai personaggi) ----------
const convPath = () => (state.conv?.studio ? '/api/studio' : `/api/characters/${state.conv.id}`);
const so = { box: $('#studio-opts'), engine: $('#so-engine'), aspect: $('#so-aspect'), char: $('#so-char'), raw: $('#so-raw'), video: $('#so-video'), seed: $('#so-seed'), body: $('#so-body'), bodyBox: $('#so-body-box') };
const SO_ASPECTS = { '3:4': '3:4 verticale', '9:16': '9:16 storia', '1:1': '1:1 quadrato', '4:3': '4:3 orizzontale', '16:9': '16:9 panoramico', '2:3': '2:3 ritratto', '3:2': '3:2 foto' };

function fillStudioOpts() {
  const p = prefs.studio || {};
  const engines = (state.config?.workflows || []).filter((w) => w.available && ((w.type === 'image' && w.mode === 'text2img') || (w.type === 'video' && w.mode === 'text2video')));
  so.engine.innerHTML = '<option value="">Automatico</option>' + engines.map((w) => `<option value="${esc(w.id)}">${w.type === 'video' ? '🎬 ' : ''}${esc(w.name)}</option>`).join('');
  so.aspect.innerHTML = Object.entries(SO_ASPECTS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  so.char.innerHTML = '<option value="">Nessun personaggio</option>' + state.convs.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  so.engine.value = engines.some((w) => w.id === p.engine) ? p.engine : '';
  so.aspect.value = SO_ASPECTS[p.aspect] ? p.aspect : '3:4';
  so.char.value = state.convs.some((c) => c.id === p.characterId) ? p.characterId : '';
  so.raw.checked = !!p.raw;
  so.video.checked = !!p.video;
  so.body.checked = !!p.bodyOn;
  // Cursori delle LoRA del corpo: limiti dalle taglie (stesse forze delle schede), 0 = LoRA spenta
  const parts = state.config?.options?.body || {};
  so.bodyBox.innerHTML = Object.entries(parts).map(([k, b]) => {
    const [lo, hi] = b.range || [-3, 3];
    const v = Math.min(hi, Math.max(lo, Number(p.body?.[k]) || 0));
    return `<label title="${esc(b.label)}: negativo = più piccolo, 0 = spento, positivo = più grande"><span>${esc(b.label)}</span><input type="range" data-part="${k}" min="${lo}" max="${hi}" step="0.5" value="${v}"><output>${v}</output></label>`;
  }).join('') + '<small class="hint">Valgono solo con Krea 2 Real (scelto in automatico) e sostituiscono il fisico del personaggio.</small>';
  syncVideoOpt();
}
/** Con un motore video la richiesta è già un video: «Anche video» non serve. */
function syncVideoOpt() {
  const video = (state.config?.workflows || []).some((w) => w.id === so.engine.value && w.type === 'video');
  so.video.disabled = video;
  so.video.closest('label').style.opacity = video ? 0.45 : '';
  so.bodyBox.hidden = !so.body.checked || video;
}
const bodyValues = () => Object.fromEntries($$('input[data-part]', so.bodyBox).map((i) => [i.dataset.part, Number(i.value)]));
so.bodyBox.addEventListener('input', (e) => { const i = e.target.closest('input[data-part]'); if (i) i.nextElementSibling.textContent = i.value; });
function readStudioOpts() {
  return { engine: so.engine.value, aspect: so.aspect.value, characterId: so.char.value, raw: so.raw.checked, video: so.video.checked, seed: so.seed.value.trim(), body: so.body.checked ? bodyValues() : null };
}
so.box.addEventListener('change', () => {
  const { seed, body, ...p } = readStudioOpts();
  prefs.studio = { ...p, bodyOn: so.body.checked, body: bodyValues() };
  savePrefs(); syncVideoOpt();
});

function setStudioMode(on) {
  so.box.hidden = !on;
  el.composer.classList.toggle('studio', on);
  el.input.placeholder = on ? "Descrivi l'immagine o il video che vuoi… (allega una foto per modificarla o animarla)" : 'Scrivi un messaggio…';
  if (on) fillStudioOpts();
}

function bodyTag(b) {
  const parts = state.config?.options?.body || {};
  return Object.entries(b).map(([k, v]) => `${(parts[k]?.label || k).toLowerCase()} ${v > 0 ? '+' : ''}${v}`).join(', ') || 'tutto a 0';
}
function studioTag(o) {
  const names = Object.fromEntries((state.config?.workflows || []).map((w) => [w.id, w.name]));
  const bits = [o.engineUsed ? names[o.engineUsed] || o.engineUsed : o.engine ? names[o.engine] || o.engine : 'Automatico', o.aspect, o.characterName, o.raw && 'prompt diretto', o.video && '+ video', o.seed != null && `seed ${o.seed}`, o.body && `fisico: ${bodyTag(o.body)}`].filter(Boolean);
  return `<div class="tag">${icon('spark', 13)}${esc(bits.join(' · '))}</div>`;
}

async function openStudio(push = true) {
  let c;
  try { c = await api('/api/studio'); }
  catch { return showHome(); }
  state.conv = c;
  showView('chat');
  el.thread.innerHTML = c.messages.length ? '' : `<div class="studio-empty"><h2>Studio immagini</h2>
    <p>Descrivi quello che vuoi vedere, anche in due parole: Gemma scrive il prompt adatto al motore scelto e ComfyUI genera.
    Puoi ritrarre uno dei tuoi personaggi, allegare una foto da modificare o animare il risultato.</p></div>`;
  for (const m of c.messages) renderMessage(m);
  setTitle('Studio immagini');
  if (push && location.pathname !== '/studio') history.pushState(null, '', '/studio');
  renderHead();
  renderConvList();
  updateSend();
  scrollToBottom(true);
  if (!isMobile()) el.input.focus();
}

$('#btn-studio-clear').onclick = async () => {
  if (!state.conv?.studio || !confirm('Svuotare lo studio? Le richieste e tutte le immagini e i video generati qui verranno eliminati.')) return;
  await api('/api/studio', { method: 'DELETE' }).catch((e) => alert(e.message));
  openStudio(false);
};

// ---------- Galleria ----------
async function openGallery(push = true) {
  showView('gallery');
  state.conv = null;
  renderHead();
  renderConvList();
  if (push) history.pushState(null, '', '/galleria');
  setTitle('Galleria');
  const items = await api('/api/media').catch(() => []);
  state.gallery = items;
  el.gallery.innerHTML = items.length
    ? items.map((m, i) => `<div class="tile" data-i="${i}">${m.type === 'video'
        ? `<video src="${m.url}#t=0.5" muted preload="metadata" playsinline></video><span class="badge">${icon('video', 12)}${m.seconds || ''}s</span>`
        : `<img src="${m.url}" loading="lazy" alt="">`}</div>`).join('')
    : '<div class="empty">Le foto e i video dei tuoi personaggi e dello studio compariranno qui.</div>';
}
el.gallery.addEventListener('click', (e) => {
  const t = e.target.closest('.tile'); if (!t) return;
  openLightbox(state.gallery[t.dataset.i], true);
});
el.gallery.addEventListener('mouseover', (e) => { const v = e.target.closest('.tile video'); if (v) v.play().catch(() => {}); });
el.gallery.addEventListener('mouseout', (e) => { const v = e.target.closest('.tile video'); if (v) v.pause(); });

// ---------- Lightbox ----------
function openLightbox(md, fromGallery = false) {
  if (!md?.url) return;
  const ext = md.type === 'video' ? 'mp4' : 'png';
  el.lbBody.innerHTML = `${md.type === 'video' ? `<video src="${md.url}" controls autoplay loop playsinline></video>` : `<img src="${md.url}" alt="">`}
    <div class="lb-info">
      <h3>${esc(md.workflowName || '')}</h3>
      <pre>${esc([md.aspect, md.width && `${md.width}×${md.height}`, md.seconds && `${md.seconds} s`, md.seed != null && `seed ${md.seed}`].filter(Boolean).join(' · '))}</pre>
      <h3>Prompt</h3><pre>${esc(md.prompt || '')}</pre>
      <a href="${md.url}" download="chatbz-${md.id.slice(0, 8)}.${ext}">${icon('download', 14)}Scarica</a>
      ${fromGallery && md.conversationId ? `<button data-goto="${md.conversationId}">${icon('open', 14)}Apri la chat</button>` : ''}
    </div>`;
  el.lightbox.hidden = false;
}
function closeLightbox() { el.lightbox.hidden = true; el.lbBody.innerHTML = ''; }
$('#lb-close').onclick = closeLightbox;
el.lightbox.onclick = (e) => {
  const g = e.target.closest('[data-goto]');
  if (g) { closeLightbox(); if (g.dataset.goto.startsWith('studio-')) openStudio(); else openConv(g.dataset.goto); return; }
  if (e.target === el.lightbox || e.target === el.lbBody) closeLightbox();
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.lightbox.hidden) closeLightbox(); });

// ---------- Social: feed, storie, profili, commenti e mi piace ----------
const soc = {
  mode: 'feed',          // feed | profile
  characterId: null,
  posts: new Map(),      // id -> post (ultima versione nota)
  stories: [],
  queue: null,
  oldest: null,
  replyTo: new Map(),    // postId -> commento a cui stai rispondendo
};
const feedEl = $('#feed'), storiesEl = $('#stories-row'), profileEl = $('#social-profile'), queuePanel = $('#queue-panel');

const agoLabel = (ts) => {
  if (!ts) return '';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'adesso';
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d} g` : new Date(ts).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
};
const inLabel = (ts) => { const m = Math.max(1, Math.round((ts - Date.now()) / 60000)); return m < 60 ? `tra ${m} min` : `tra ${Math.round(m / 60)} h`; };
const who = (ch, cls = '') => avatarHtml({ name: ch?.name, avatarUrl: ch?.avatarUrl }, cls);

async function openSocial(characterId = null, push = true) {
  state.conv = null;
  soc.mode = characterId ? 'profile' : 'feed';
  soc.characterId = characterId;
  showView('social');
  renderHead();
  renderConvList();
  const url = characterId ? `/social/${characterId}` : '/';
  if (push && location.pathname !== url) history.pushState(null, '', url);
  $('#social-back').hidden = !characterId;
  $('#social-title').textContent = characterId ? '' : 'Home';
  setTitle(characterId ? null : 'Home');
  storiesEl.hidden = true;
  profileEl.hidden = !characterId;
  profileEl.innerHTML = '';
  feedEl.innerHTML = '<p class="hint center">Carico…</p>';
  $('#feed-more').hidden = true;
  refreshQueue();
  renderSide();
  if (characterId) return renderProfile();
  loadStories();
  soc.oldest = null;
  const posts = await api('/api/social/feed').catch(() => []);
  if (soc.mode !== 'feed' || state.view !== 'social') return;
  feedEl.innerHTML = '';
  renderFeed(posts, false);
}
$('#social-back').onclick = () => openSocial();
$('#btn-char-social').onclick = () => { if (state.conv && !state.conv.studio) openSocial(state.conv.id); };

/** Riallinea il social senza ricaricare la pagina: post nuovi in cima, quelli già visti aggiornati sul posto. */
async function refreshSocial() {
  refreshQueue();
  renderSide();
  if (soc.mode === 'profile') return renderProfile();
  loadStories();
  const posts = await api('/api/social/feed').catch(() => null);
  if (!posts || soc.mode !== 'feed' || state.view !== 'social') return;
  if (!$('.post', feedEl)) { feedEl.innerHTML = ''; return renderFeed(posts, false); }
  for (const p of [...posts].reverse()) updatePost(p);   // i nuovi finiscono in cima nell'ordine giusto
}

/** Colonna di lato (schermi larghi): i personaggi e cosa stanno facendo, per scrivere o aprire il profilo. */
function renderSide() {
  const side = $('#social-side');
  if (!side) return;
  side.innerHTML = state.convs.length ? `<h3>I tuoi personaggi</h3>
    ${state.convs.map((c) => `<div class="side-row">
      <button class="ava-btn" data-profile="${c.id}">${avatarHtml(c)}</button>
      <button class="side-who" data-profile="${c.id}"><b>${esc(c.name)}</b><small>${esc(sceneLabel(c.scene))}</small></button>
      <button class="icon-btn" data-side-chat="${c.id}" title="Scrivi">${icon('comment', 17)}</button>
    </div>`).join('')}
    <button class="btn wide ghost" data-side-new>${icon('plus', 15)} Nuovo personaggio</button>`
    : `<h3>Inizia da qui</h3><p class="hint">Crea un personaggio: avrà il suo profilo, pubblicherà foto e storie e commenterà quelle degli altri.</p><button class="btn primary" data-side-new>Crea un personaggio</button>`;
}
$('#social-side').addEventListener('click', (e) => {
  const chat = e.target.closest('[data-side-chat]');
  if (chat) return openConv(chat.dataset.sideChat);
  if (e.target.closest('[data-side-new]')) openCharModal(null);
});

function renderFeed(posts, append) {
  if (!append && !posts.length) {
    feedEl.innerHTML = `<div class="empty">${state.convs.length
      ? 'Ancora nessun post. I personaggi pubblicano un po\' alla volta, quando la GPU è libera e non state chattando; oppure apri un profilo e chiedi un post.'
      : 'Crea un personaggio: pubblicherà qui le sue foto.'}</div>`;
  }
  for (const p of posts) {
    soc.posts.set(p.id, p);
    feedEl.insertAdjacentHTML('beforeend', postHtml(p));
  }
  if (posts.length) soc.oldest = posts.at(-1).publishedAt;
  $('#feed-more').hidden = posts.length < 10;
}
$('#feed-more').onclick = async () => {
  renderFeed(await api(`/api/social/feed?before=${soc.oldest || ''}`).catch(() => []), true);
};

// ---- Post ----
function mediaFrame(md) {
  if (md.status === 'done' && md.url) return `<img src="${esc(md.url)}" alt="" loading="lazy" data-zoom="${md.id}">`;
  const label = { engineering: 'Scrive la foto…', queued: 'In coda', running: 'Sta scattando…', error: 'Non riuscita', planned: 'Ci sta pensando…' }[md.status] || '';
  return `<img class="preview" alt="" hidden><div class="shimmer"></div><div class="media-state"><div class="big">${icon('image', 24)}<span>${label}</span></div></div>
    ${md.status === 'running' ? '<div class="media-overlay"><div class="bar"><i></i></div></div>' : ''}`;
}

function carouselHtml(p) {
  const list = p.media.length ? p.media : [{ id: 'none', status: p.status === 'error' ? 'error' : 'planned' }];
  const first = list[0];
  const ratio = first.width && first.height ? `${first.width}/${first.height}` : p.kind === 'story' ? '9/16' : '3/4';
  return `<div class="carousel" style="aspect-ratio:${ratio}">
      <div class="track">${list.map((md) => `<div class="slide" data-media="${md.id}">${mediaFrame(md)}</div>`).join('')}</div>
      ${list.length > 1 ? `<div class="dots">${list.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div><span class="count">1/${list.length}</span>` : ''}
    </div>`;
}

function statusLine(p) {
  if (p.status === 'published') return '';
  const done = p.media.filter((m) => m.status === 'done').length;
  const txt = p.status === 'planned' ? `${esc(p.character.name)} sta pensando ${p.kind === 'story' ? 'a una storia' : 'a un post'}…`
    : p.status === 'generating' ? `${p.kind === 'story' ? 'Storia' : 'Post'} in preparazione: ${done}/${p.media.length} foto pronte`
      : `Non riuscito: ${esc(p.error || 'errore')}`;
  return `<div class="post-status ${p.status}">${txt}${p.status === 'error' ? ` <button class="link" data-post-act="retry">Riprova</button>` : ''}</div>`;
}

/**
 * Commenti come su Instagram: ogni conversazione parte da un commento e le risposte (di chiunque, a chiunque)
 * stanno sotto, con la @menzione di chi si sta rispondendo. Nel feed se ne vedono pochi, il post aperto li mostra tutti.
 */
function commentsHtml(p, all) {
  const byId = new Map(p.comments.map((c) => [c.id, c]));
  const rootOf = (c) => { let r = c; for (let i = 0; r.replyTo && byId.get(r.replyTo) && i < 50; i++) r = byId.get(r.replyTo); return r.id; };
  const nameOf = (c) => (c.author.kind === 'user' ? (state.user?.displayName || 'Tu') : c.author.username || c.author.name);
  const one = (c, reply) => {
    const name = c.author.kind === 'user' ? 'Tu' : c.author.name;
    const to = byId.get(c.replyTo);
    const mention = to ? `<button class="mention" ${to.author.kind === 'character' ? `data-profile="${to.author.id}"` : ''}>@${esc(nameOf(to))}</button> ` : '';
    return `<div class="comment ${reply ? 'reply' : ''}" data-comment="${c.id}">
      ${c.author.kind === 'user' ? `<span class="ava ava-letter small">${initial(state.user?.displayName)}</span>` : `<button class="ava-btn" data-profile="${c.author.id}">${who(c.author, 'small')}</button>`}
      <div class="c-body"><p><b>${esc(name)}</b> ${mention}${esc(c.content)}</p>
      <small>${agoLabel(c.createdAt)} · <button class="link" data-reply="${c.id}" data-name="${esc(name === 'Tu' ? 'te stesso' : name)}">Rispondi</button>${c.likedByAuthor ? ` · <span class="liked">${icon('heart', 11)} da ${esc(p.character.name)}</span>` : ''}</small></div>
    </div>`;
  };
  if (!all) {
    // anteprima nel feed: gli ultimi due commenti, senza rientri
    const last = p.comments.slice(-2);
    return `${p.comments.length > 2 ? `<button class="link more" data-post-act="open">Mostra tutti i ${p.comments.length} commenti</button>` : ''}${last.map((c) => one(c, false)).join('')}`;
  }
  const roots = p.comments.filter((c) => !c.replyTo || !byId.get(c.replyTo));
  return roots.map((r) => `<div class="c-thread">${one(r, false)}${p.comments.filter((c) => c.id !== r.id && rootOf(c) === r.id).map((c) => one(c, true)).join('')}</div>`).join('');
}

function likesLine(p) {
  if (!p.likes.count) return '';
  const names = [...(p.likes.byUser ? ['te'] : []), ...p.likes.names];
  const shown = names.slice(0, 2).map((x) => (x === 'te' ? 'te' : `<b>${esc(x)}</b>`));
  return `<p class="likes">Piace a ${shown.join(' e ')}${names.length > 2 ? ` e altri ${names.length - 2}` : ''}</p>`;
}

function postHeadHtml(p) {
  return `<button class="ava-btn" data-profile="${p.character.id}">${who(p.character)}</button>
    <div class="ph-who"><span><button class="link strong" data-profile="${p.character.id}">${esc(p.character.username || p.character.name)}</button>${p.tags?.length ? ` <span class="with">con</span> ${p.tags.map((t) => `<button class="link strong" data-profile="${t.id}">${esc(t.username || t.name)}</button>`).join(', ')}` : ''}</span>
    <small>${p.publishedAt ? agoLabel(p.publishedAt) : ''}${p.location ? ` · ${esc(p.location)}` : ''}${p.kind === 'story' ? ' · storia' : ''}</small></div>
    <span class="spacer"></span><button class="icon-btn" data-post-act="delete" title="Elimina">${icon('trash', 16)}</button>`;
}

function postBodyHtml(p, all) {
  const caption = p.caption ? `<p class="caption"><b>${esc(p.character.username || p.character.name)}</b> ${esc(p.caption)}</p>` : '';
  if (p.status !== 'published') return `${statusLine(p)}${caption}`;
  return `<div class="post-actions">
      <button class="act like ${p.likes.byUser ? 'on' : ''}" data-post-act="like" title="Mi piace">${icon('heart', 22)}</button>
      ${p.kind === 'post' ? `<button class="act" data-post-act="focus" title="Commenta">${icon('comment', 22)}</button>` : ''}
    </div>
    ${likesLine(p)}
    ${caption}
    <div class="comments">${commentsHtml(p, all)}</div>
    ${p.typing.length ? `<p class="typing-line"><span class="typing"><i></i><i></i><i></i></span>${esc(p.typing.join(', '))} sta scrivendo…</p>` : ''}`;
}

const mediaSig = (p) => p.media.map((m) => `${m.id}:${m.status}`).join('|') || p.status;
const canComment = (p) => p.status === 'published' && p.kind === 'post';

function postHtml(p, all = false) {
  return `<article class="post" data-post="${p.id}" data-sig="${mediaSig(p)}" ${all ? 'data-all' : ''}>
    <header class="post-head">${postHeadHtml(p)}</header>
    <div class="post-media">${carouselHtml(p)}</div>
    <div class="post-body">${postBodyHtml(p, all)}</div>
    <form class="comment-form" ${canComment(p) ? '' : 'hidden'}><input placeholder="Aggiungi un commento…" autocomplete="off" maxlength="600"><button class="link strong">Pubblica</button></form>
  </article>`;
}

const timers = {};
const debounce = (key, fn, ms) => { clearTimeout(timers[key]); timers[key] = setTimeout(fn, ms); };

/** Aggiorna un post ovunque sia mostrato, senza toccare il commento che stai scrivendo. */
function updatePost(p) {
  soc.posts.set(p.id, p);
  const nodes = $$(`.post[data-post="${p.id}"]`);
  for (const node of nodes) {
    $('.post-head', node).innerHTML = postHeadHtml(p);
    if (node.dataset.sig !== mediaSig(p)) { $('.post-media', node).innerHTML = carouselHtml(p); node.dataset.sig = mediaSig(p); }
    $('.post-body', node).innerHTML = postBodyHtml(p, node.hasAttribute('data-all'));
    $('.comment-form', node).hidden = !canComment(p);
  }
  if (state.view !== 'social') return;
  if (soc.mode === 'feed') {
    // Post appena pubblicato: in cima al feed
    if (!nodes.length && p.kind === 'post' && p.status === 'published') {
      $('.empty', feedEl)?.remove();
      feedEl.insertAdjacentHTML('afterbegin', postHtml(p));
    }
    if (p.kind === 'story' && p.status === 'published') debounce('stories', loadStories, 500);
  } else if (p.character.id === soc.characterId && (p.status === 'published' || !nodes.length)) {
    debounce('profile', renderProfile, 600);
  }
}

function onSocialEvent(evt) {
  if (evt.what === 'notification') return onNotification(evt);
  if (evt.what === 'unread') return setUnread(evt.unread);
  if (evt.what === 'post') return updatePost(evt.post);
  if (evt.what === 'removed') {
    soc.posts.delete(evt.postId);
    $$(`.post[data-post="${evt.postId}"], .pgrid [data-open="${evt.postId}"]`).forEach((n) => n.remove());
    return;
  }
  if (evt.what === 'queue') return debounce('queue', refreshQueue, 700);
  if (evt.type === 'preview' || evt.type === 'progress') {
    const slide = document.querySelector(`.post[data-post="${evt.postId}"] .slide[data-media="${evt.mediaId}"]`);
    if (!slide) return;
    if (evt.type === 'preview') { const pv = $('.preview', slide); if (pv) { pv.src = evt.dataUrl; pv.hidden = false; } }
    if (evt.max) { const bar = $('.bar i', slide); if (bar) bar.style.width = `${(evt.value / evt.max) * 100}%`; }
  }
}

// Carosello: punti e contatore seguono lo scorrimento
document.addEventListener('scroll', (e) => {
  const track = e.target.closest?.('.track');
  if (!track) return;
  const i = Math.round(track.scrollLeft / track.clientWidth);
  const car = track.closest('.carousel');
  $$('.dots i', car).forEach((d, j) => d.classList.toggle('on', j === i));
  const count = $('.count', car);
  if (count) count.textContent = `${i + 1}/${track.children.length}`;
}, true);

document.addEventListener('click', async (e) => {
  const prof = e.target.closest('[data-profile]');
  if (prof && (state.view === 'social' || !$('#post-modal').hidden)) { closePostModal(); return openSocial(prof.dataset.profile); }
  const post = e.target.closest('.post');
  if (!post) return;
  const p = soc.posts.get(post.dataset.post);
  if (!p) return;
  const zoom = e.target.closest('[data-zoom]');
  if (zoom) return openLightbox(p.media.find((m) => m.id === zoom.dataset.zoom));
  const reply = e.target.closest('[data-reply]');
  if (reply) {
    soc.replyTo.set(p.id, reply.dataset.reply);
    const input = $('.comment-form input', post);
    input.placeholder = `Rispondi a ${reply.dataset.name}…`;
    $('.comment-form', post).classList.add('replying');
    input.focus();
    return;
  }
  const act = e.target.closest('[data-post-act]')?.dataset.postAct;
  if (!act) return;
  if (act === 'like') {
    e.target.closest('.like').classList.toggle('on');           // subito, poi conferma dal server
    return api(`/api/social/posts/${p.id}/like`, { method: 'POST' }).then(updatePost).catch((err) => alert(err.message));
  }
  if (act === 'focus') return $('.comment-form input', post).focus();
  if (act === 'open') return openPostModal(p);
  if (act === 'retry') return api(`/api/social/posts/${p.id}/retry`, { method: 'POST' }).then(updatePost).catch((err) => alert(err.message));
  if (act === 'delete') {
    if (!confirm(`Eliminare ${p.kind === 'story' ? 'questa storia' : 'questo post'} di ${p.character.name}?`)) return;
    return api(`/api/social/posts/${p.id}`, { method: 'DELETE' }).catch((err) => alert(err.message));
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('.comment-form');
  if (!form) return;
  e.preventDefault();
  const id = form.closest('.post').dataset.post;
  const input = $('input', form);
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  const replyTo = soc.replyTo.get(id) || null;
  soc.replyTo.delete(id);
  input.placeholder = 'Aggiungi un commento…';
  form.classList.remove('replying');
  try { updatePost(await api(`/api/social/posts/${id}/comments`, { body: { text, replyTo } })); }
  catch (err) { input.value = text; alert(err.message); }
});

// ---- Storie ----
async function loadStories() {
  soc.stories = await api('/api/social/stories').catch(() => []);
  storiesEl.innerHTML = soc.stories.map((g, i) => `<button class="story-ring ${g.unseen ? 'unseen' : ''}" data-story="${i}">${who(g.character)}<span>${esc(g.character.name)}</span></button>`).join('');
  storiesEl.hidden = soc.mode !== 'feed' || state.view !== 'social' || !soc.stories.length;
}
storiesEl.onclick = (e) => { const b = e.target.closest('[data-story]'); if (b) openStories(soc.stories, Number(b.dataset.story)); };

const sv = { groups: [], g: 0, i: 0, timer: null, el: $('#story-viewer') };
function openStories(groups, g = 0) {
  if (!groups[g]?.stories.length) return;
  sv.groups = groups;
  sv.g = g;
  sv.i = Math.max(0, groups[g].stories.findIndex((s) => !s.seen));
  sv.el.hidden = false;
  showStory();
}
function closeStories() {
  clearTimeout(sv.timer);
  sv.el.hidden = true;
  if (state.view === 'social') { if (soc.mode === 'feed') loadStories(); else renderProfile(); }
}
function showStory() {
  clearTimeout(sv.timer);
  const group = sv.groups[sv.g];
  const s = group?.stories[sv.i];
  if (!s) return closeStories();
  const md = s.media[0];
  $('#sv-bars').innerHTML = group.stories.map((_, j) => `<i class="${j < sv.i ? 'done' : j === sv.i ? 'run' : ''}"></i>`).join('');
  $('#sv-who').innerHTML = `<button class="ava-btn" data-sv-profile="${group.character.id}">${who(group.character, 'small')}</button><b>${esc(group.character.username || group.character.name)}</b><small>${agoLabel(s.publishedAt)}</small>`;
  $('#sv-media').innerHTML = md?.url ? `<img src="${esc(md.url)}" alt="">` : '';
  $('#sv-caption').textContent = s.caption || '';
  $('#sv-caption').hidden = !s.caption;
  $('#sv-input').placeholder = `Rispondi a ${group.character.name}…`;
  if (!s.seen) { s.seen = true; api(`/api/social/posts/${s.id}/seen`, { method: 'POST' }).catch(() => {}); }
  sv.timer = setTimeout(nextStory, 6000);
}
function nextStory() {
  const group = sv.groups[sv.g];
  if (sv.i + 1 < group.stories.length) sv.i++;
  else if (sv.g + 1 < sv.groups.length) { sv.g++; sv.i = 0; }
  else return closeStories();
  showStory();
}
function prevStory() {
  if (sv.i > 0) sv.i--;
  else if (sv.g > 0) { sv.g--; sv.i = sv.groups[sv.g].stories.length - 1; }
  showStory();
}
$('#sv-next').onclick = nextStory;
$('#sv-prev').onclick = prevStory;
$('#sv-close').onclick = closeStories;
$('#sv-who').onclick = (e) => { const b = e.target.closest('[data-sv-profile]'); if (b) { closeStories(); openSocial(b.dataset.svProfile); } };
$('#sv-input').addEventListener('focus', () => clearTimeout(sv.timer));
$('#sv-input').addEventListener('blur', () => { if (!sv.el.hidden && !$('#sv-input').value) sv.timer = setTimeout(nextStory, 4000); });
$('#sv-reply').onsubmit = async (e) => {
  e.preventDefault();
  const text = $('#sv-input').value.trim();
  const s = sv.groups[sv.g]?.stories[sv.i];
  if (!text || !s) return;
  try {
    const r = await api(`/api/social/posts/${s.id}/reply`, { body: { text, model: currentModel() } });
    $('#sv-input').value = '';
    clearTimeout(sv.timer);
    sv.el.hidden = true;
    openConv(r.characterId);          // rispondere a una storia è un messaggio in chat
  } catch (err) { alert(err.message); }
};
document.addEventListener('keydown', (e) => {
  if (sv.el.hidden || e.target === $('#sv-input')) return;
  if (e.key === 'Escape') closeStories();
  if (e.key === 'ArrowRight') nextStory();
  if (e.key === 'ArrowLeft') prevStory();
});

// ---- Profilo ----
async function renderProfile() {
  const id = soc.characterId;
  let pr;
  try { pr = await api(`/api/social/profile/${id}`); }
  catch { return openSocial(); }
  if (soc.characterId !== id || state.view !== 'social' || soc.mode !== 'profile') return;
  for (const p of [...pr.posts, ...pr.pending, ...pr.stories]) soc.posts.set(p.id, p);
  $('#social-title').textContent = pr.username ? `@${pr.username}` : pr.character.name;
  const he = state.convs.find((c) => c.id === id)?.card?.gender === 'uomo';
  profileEl.innerHTML = `
    <div class="prof-head">
      <button class="prof-ava ${pr.stories.length ? `has-story ${pr.stories.some((s) => !s.seen) ? 'unseen' : ''}` : ''}" data-prof-stories title="${pr.stories.length ? 'Guarda le storie' : ''}">${who(pr.character, 'big')}</button>
      <div class="prof-info">
        <h3>${esc(pr.character.name)}</h3>
        <p class="prof-stats"><b>${pr.stats.posts}</b> post · <b>${pr.stats.likes}</b> mi piace ricevuti</p>
        ${pr.bio ? `<p class="prof-bio">${esc(pr.bio)}</p>` : '<p class="hint">La bio arriva con il primo post.</p>'}
      </div>
    </div>
    ${pr.bonds.length ? `<div class="bonds">${pr.bonds.map((b) => `<button class="bond" data-profile="${b.id}" title="${esc(b.note)}">${who(b, 'small')}<span><b>${esc(b.name)}</b><small>${esc(b.note)}</small></span></button>`).join('')}</div>` : ''}
    <div class="prof-actions">
      <button class="btn" data-prof="chat">${icon('comment', 15)}${he ? 'Scrivigli' : 'Scrivile'}</button>
      <button class="btn" data-prof="post">${icon('image', 15)}Nuovo post</button>
      <button class="btn" data-prof="story">${icon('plus', 15)}Nuova storia</button>
      ${state.convs.length > 1 ? `<button class="btn" data-prof="with">${icon('users', 15)}Foto con…</button>` : ''}
      <label class="check small"><input type="checkbox" data-prof="auto" ${pr.social ? 'checked' : ''}> Pubblica da ${he ? 'solo' : 'sola'}</label>
    </div>
    <div class="with-pick" id="with-pick" hidden><small>Con chi esce? Pubblicherà una foto insieme, taggando l'altra persona.</small>
      <div>${state.convs.filter((c) => c.id !== id).map((c) => `<button class="bond" data-with="${c.id}">${avatarHtml(c, 'small')}<span><b>${esc(c.name)}</b></span></button>`).join('')}</div></div>
    ${pr.pending.length ? `<div class="pending">${pr.pending.map((p) => postHtml(p)).join('')}</div>` : ''}
    ${pr.posts.length ? `<div class="pgrid">${pr.posts.map((p) => `<button data-open="${p.id}">${p.media[0]?.url ? `<img src="${esc(p.media[0].url)}" loading="lazy" alt="">` : ''}${p.media.length > 1 ? `<span class="multi">${icon('gallery', 14)}</span>` : ''}</button>`).join('')}</div>`
      : !pr.pending.length ? '<div class="empty">Ancora nessun post.</div>' : ''}
    ${pr.tagged?.length ? `<h4 class="grid-title">${icon('tag', 14)} Foto con gli amici</h4><div class="pgrid">${pr.tagged.map((p) => `<button data-open="${p.id}">${p.media[0]?.url ? `<img src="${esc(p.media[0].url)}" loading="lazy" alt="">` : ''}<span class="multi">${icon('tag', 14)}</span></button>`).join('')}</div>` : ''}`;
  for (const p of pr.tagged || []) soc.posts.set(p.id, p);
  feedEl.innerHTML = '';
  $('#feed-more').hidden = true;
  profileEl._stories = pr.stories.length ? [{ character: pr.character, stories: pr.stories }] : [];
}
profileEl.addEventListener('click', async (e) => {
  if (e.target.closest('[data-prof-stories]')) return profileEl._stories?.length && openStories(profileEl._stories);
  const open = e.target.closest('[data-open]');
  if (open) return openPostModal(soc.posts.get(open.dataset.open));
  const id = soc.characterId;
  const w = e.target.closest('[data-with]');
  if (w) {
    const hint = prompt(`Cosa fanno insieme? (facoltativo: lascia vuoto e decidono loro)`, '');
    if (hint === null) return;
    try { await api(`/api/social/profile/${id}/posts`, { body: { kind: 'post', hint, withId: w.dataset.with } }); renderProfile(); }
    catch (err) { alert(err.message); }
    return;
  }
  const b = e.target.closest('[data-prof]');
  if (!b || b.dataset.prof === 'auto') return;
  if (b.dataset.prof === 'chat') return openConv(id);
  if (b.dataset.prof === 'with') { const box = $('#with-pick'); box.hidden = !box.hidden; return; }
  const kind = b.dataset.prof;
  const hint = prompt(`Un'idea per ${kind === 'story' ? 'la storia' : 'il post'}? (facoltativa: lascia vuoto e decide da sé)`, '');
  if (hint === null) return;
  try { await api(`/api/social/profile/${id}/posts`, { body: { kind, hint } }); renderProfile(); }
  catch (err) { alert(err.message); }
});
profileEl.addEventListener('change', async (e) => {
  if (e.target.dataset.prof !== 'auto') return;
  await api(`/api/social/profile/${soc.characterId}`, { method: 'PATCH', body: { social: e.target.checked } }).catch((err) => alert(err.message));
  loadConvs();
});

function openPostModal(p) {
  if (!p) return;
  const pm = $('#post-modal');
  $('#pm-title').textContent = p.character.name;
  $('#pm-body').innerHTML = postHtml(p, true);
  pm.dataset.post = p.id;
  pm.hidden = false;
  api(`/api/social/posts/${p.id}/open`, { method: 'POST' }).catch(() => {});   // le sue notifiche diventano lette
  api(`/api/social/posts/${p.id}`).then(updatePost).catch(() => {});           // la versione più recente
}
async function openPostById(id) {
  try { const p = await api(`/api/social/posts/${id}`); soc.posts.set(p.id, p); openPostModal(p); }
  catch { alert('Questo post non c\'è più.'); }
}
function closePostModal() { const pm = $('#post-modal'); pm.hidden = true; delete pm.dataset.post; $('#pm-body').innerHTML = ''; }
$('#post-modal').addEventListener('click', (e) => { if (e.target.id === 'post-modal' || e.target.closest('[data-close]')) closePostModal(); });

// ---- Coda a goccia ----
async function refreshQueue() {
  const qv = await api('/api/social/queue').catch(() => null);
  if (!qv) return;
  soc.queue = qv;
  const active = qv.jobs.filter((j) => j.status !== 'error');
  const running = active.some((j) => j.status === 'running');
  const btn = $('#btn-queue');
  btn.classList.toggle('paused', qv.paused);
  btn.classList.toggle('busy', running);
  $('#queue-label').textContent = qv.paused ? 'In pausa' : running ? 'Al lavoro' : active.length ? `In coda: ${active.length}` : 'Coda vuota';
  if (!queuePanel.hidden) renderQueue();
}

function renderQueue() {
  const qv = soc.queue;
  if (!qv) return;
  const when = (j) => (j.status === 'running' ? '<b>in corso</b>'
    : j.status === 'error' ? `<span class="err" title="${esc(j.error || '')}">non riuscito</span> · <button class="link" data-retry-job="${j.id}">Riprova</button>`
      : j.runAfter > Date.now() + 30000 ? inLabel(j.runAfter) : 'in attesa');
  queuePanel.innerHTML = `
    <div class="qp-head">
      <p>I contenuti si generano un pezzo alla volta, solo quando la GPU è libera e non stai chattando${qv.waitingForYou ? ' (ora aspetta: hai scritto da poco)' : ''}. Nelle ultime 24 ore: <b>${qv.counters.posts}/${qv.limits.posts}</b> post e <b>${qv.counters.stories}/${qv.limits.stories}</b> storie automatiche; quelli che chiedi tu non contano.${qv.night ? ` Dalle ${qv.night.from} alle ${qv.night.to} i personaggi dormono${qv.asleep ? ' (adesso dormono)' : ''}.` : ''}</p>
      <button class="btn" id="qp-pause">${icon(qv.paused ? 'play' : 'pause', 15)}${qv.paused ? 'Riprendi' : 'Metti in pausa'}</button>
    </div>
    ${qv.jobs.length ? `<ul class="qp-jobs">${qv.jobs.map((j) => `<li><span>${esc(j.label || j.kind)}</span><small>${when(j)}</small></li>`).join('')}</ul>` : '<p class="hint">Niente in coda.</p>'}`;
}
$('#btn-queue').onclick = () => { queuePanel.hidden = !queuePanel.hidden; renderQueue(); };
queuePanel.addEventListener('click', async (e) => {
  if (e.target.closest('#qp-pause')) {
    soc.queue = await api('/api/social/queue/pause', { body: { paused: !soc.queue.paused } }).catch(() => soc.queue);
    return refreshQueue();
  }
  const r = e.target.closest('[data-retry-job]');
  if (r) { await api(`/api/social/queue/jobs/${r.dataset.retryJob}/retry`, { method: 'POST' }).catch(() => {}); refreshQueue(); }
});

// ---------- Notifiche ----------
const notif = { unread: 0, items: [], open: false };
const nmMenu = $('#notif-menu'), nmList = $('#nm-list');
const NOTIF_ICON = { post: 'image', tag: 'tag', reply: 'comment', comment: 'comment', like: 'heart', life: 'spark' };

function setUnread(n) {
  notif.unread = n || 0;
  const b = $('#notif-badge');
  b.textContent = notif.unread > 99 ? '99+' : String(notif.unread);
  b.hidden = !notif.unread;
  document.title = `${notif.unread ? `(${notif.unread}) ` : ''}${titleBase}`;
}

async function loadNotifs() {
  const r = await api('/api/notifications').catch(() => null);
  if (!r) return;
  notif.items = r.items;
  setUnread(r.unread);
  if (!nmMenu.hidden) renderNotifs();
}

function renderNotifs() {
  nmList.innerHTML = notif.items.length ? notif.items.map((n) => `
    <button class="nm-item ${n.read ? '' : 'unread'}" data-notif="${n.id}">
      <span class="nm-ava">${n.character ? avatarHtml(n.character) : `<span class="ava ava-letter">${icon('bell', 16)}</span>`}<i>${icon(NOTIF_ICON[n.kind] || 'bell', 11)}</i></span>
      <span class="nm-text">${esc(n.text)}<small>${agoLabel(n.createdAt)}</small></span>
    </button>`).join('') : '<p class="hint center">Ancora niente: qui arrivano i nuovi post, le risposte ai tuoi commenti e cosa fanno i personaggi quando non ci sei.</p>';
  const canAsk = 'Notification' in window && window.isSecureContext && Notification.permission === 'default';
  $('#nm-browser').hidden = !canAsk;
}

$('#btn-notif').onclick = (e) => {
  e.stopPropagation();
  nmMenu.hidden = !nmMenu.hidden;
  if (!nmMenu.hidden) { renderNotifs(); loadNotifs(); }
};
document.addEventListener('click', (e) => { if (!nmMenu.hidden && !e.target.closest('#notif-menu, #btn-notif')) nmMenu.hidden = true; });
$('#nm-all').onclick = async () => {
  await api('/api/notifications/read', { body: {} }).catch(() => {});
  notif.items.forEach((n) => (n.read = true));
  setUnread(0);
  renderNotifs();
};
$('#nm-browser').onclick = async () => { await Notification.requestPermission().catch(() => {}); renderNotifs(); };
nmList.onclick = async (e) => {
  const b = e.target.closest('[data-notif]');
  if (!b) return;
  const n = notif.items.find((x) => x.id === b.dataset.notif);
  if (!n) return;
  nmMenu.hidden = true;
  if (!n.read) { n.read = true; api('/api/notifications/read', { body: { id: n.id } }).then((r) => setUnread(r.unread)).catch(() => {}); }
  if (n.postId) { if (state.view !== 'social') await openSocial(); openPostById(n.postId); }
  else if (n.character) openSocial(n.character.id);
};

function onNotification(evt) {
  notif.items = [evt.notification, ...notif.items.filter((x) => x.id !== evt.notification.id)].slice(0, 60);
  setUnread(evt.unread);
  if (!nmMenu.hidden) renderNotifs();
  // Pagina in background: anche come notifica del sistema (se l'hai permesso)
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(evt.notification.character?.name || 'ChatBz', { body: evt.notification.text, icon: evt.notification.character?.avatarUrl || undefined, tag: evt.notification.id });
      n.onclick = () => { window.focus(); if (evt.notification.postId) openPostById(evt.notification.postId); n.close(); };
    } catch {}
  }
}

// ---------- Stato servizi ----------
async function pollStatus() {
  try {
    const s = await api('/api/status');
    $('#svc-ollama').className = `svc ${s.ollama ? 'up' : 'down'}`;
    $('#svc-comfy').className = `svc ${s.comfy ? 'up' : 'down'}`;
    renderGpu(s.gpu);
  } catch {
    $('#svc-ollama').className = 'svc down';
    $('#svc-comfy').className = 'svc down';
  }
}

// ---------- Utente, accesso e amministrazione ----------
const authEl = $('#auth'), loginForm = $('#login-form'), pwForm = $('#password-form');
const showErr = (form, msg) => { const p = $('.auth-error', form); p.textContent = msg || ''; p.hidden = !msg; };

function showLogin() {
  if (es) { es.close(); es = null; }
  authEl.hidden = false; loginForm.hidden = false; pwForm.hidden = true;
  showErr(loginForm);
  loginForm.reset();
  setTimeout(() => loginForm.username.focus(), 50);
}

function showPasswordForm(forced) {
  authEl.hidden = false; loginForm.hidden = true; pwForm.hidden = false;
  pwForm.dataset.forced = forced ? '1' : '';
  pwForm.reset();
  showErr(pwForm);
  $('#pw-title').textContent = forced ? 'Scegli la tua password' : 'Cambia password';
  $('#pw-sub').textContent = forced
    ? `Ciao ${state.user?.displayName || ''}! Stai usando una password temporanea: inseriscila e scegline una personale.`
    : 'Inserisci la password attuale e quella nuova.';
  $('#pw-current-label').textContent = forced ? 'Password temporanea' : 'Password attuale';
  $('#pw-cancel').textContent = forced ? 'Esci' : 'Annulla';
  setTimeout(() => pwForm.current.focus(), 50);
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showErr(loginForm);
  try {
    const { user } = await api('/api/auth/login', { body: { username: loginForm.username.value, password: loginForm.password.value }, raw: true });
    state.user = user;
    if (user.mustChangePassword) return showPasswordForm(true);
    authEl.hidden = true;
    startApp();
  } catch (err) { showErr(loginForm, err.message); }
});

pwForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showErr(pwForm);
  if (pwForm.next.value !== pwForm.confirm.value) return showErr(pwForm, 'Le due password non coincidono');
  try {
    const { user } = await api('/api/auth/password', { body: { current: pwForm.current.value, next: pwForm.next.value }, raw: true });
    state.user = user;
    authEl.hidden = true;
    startApp();
  } catch (err) { showErr(pwForm, err.message); }
});

$('#pw-cancel').onclick = () => {
  if (pwForm.dataset.forced) return logout();
  authEl.hidden = true;
};

async function logout() {
  await api('/api/auth/logout', { method: 'POST', raw: true }).catch(() => {});
  location.href = '/';
}

function renderUserBox() {
  const u = state.user;
  document.body.classList.toggle('is-admin', u?.role === 'admin');
  $('#user-avatar').textContent = (u?.displayName || '?').slice(0, 1).toUpperCase();
  $('#user-name').innerHTML = `${esc(u?.displayName)}<small>${u?.role === 'admin' ? 'Amministratore' : 'Utente'}</small>`;
}

const userMenu = $('#user-menu');
$('#user-btn').onclick = (e) => { e.stopPropagation(); userMenu.hidden = !userMenu.hidden; };
document.addEventListener('click', (e) => { if (!e.target.closest('#user-menu')) userMenu.hidden = true; });
userMenu.onclick = (e) => {
  const act = e.target.closest('[data-user-act]')?.dataset.userAct;
  userMenu.hidden = true;
  if (act === 'model') { e.stopPropagation(); el.modelMenu.hidden = false; return; }
  if (act === 'profile') openProfile();
  if (act === 'password') showPasswordForm(false);
  if (act === 'users') openUsers();
  if (act === 'logout') logout();
};

// Profilo dell'utente
const profileModal = $('#profile-modal'), profileForm = $('#profile-form');
function openProfile() {
  const p = state.user?.profile || {};
  profileForm.name.value = p.name || state.user?.displayName || '';
  profileForm.gender.value = p.gender || '';
  profileForm.about.value = p.about || '';
  profileForm.look.value = p.look || '';
  $('#profile-look-status').textContent = '';
  showErr(profileForm);
  profileModal.hidden = false;
}
$('#profile-look-photo').onclick = () => $('#profile-look-file').click();
$('#profile-look-file').onchange = async (e) => {
  const f = e.target.files?.[0]; e.target.value = '';
  if (!f) return;
  const btn = $('#profile-look-photo'), status = $('#profile-look-status');
  btn.disabled = true; status.textContent = 'Leggo la foto…'; showErr(profileForm);
  try {
    const up = await uploadImage(f);
    const { look } = await api('/api/me/look-from-photo', { body: { file: up.file } });
    profileForm.look.value = look;
    status.textContent = 'Rileggi e correggi se serve, poi salva.';
  } catch (err) { status.textContent = ''; showErr(profileForm, err.message); }
  btn.disabled = false;
};
profileModal.addEventListener('click', (e) => { if (e.target === profileModal || e.target.closest('[data-close]')) profileModal.hidden = true; });
profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showErr(profileForm);
  try {
    const { user } = await api('/api/me/profile', { method: 'PUT', body: { name: profileForm.name.value, gender: profileForm.gender.value, about: profileForm.about.value, look: profileForm.look.value } });
    state.user = user;
    profileModal.hidden = true;
  } catch (err) { showErr(profileForm, err.message); }
});

// Gestione utenti (solo admin)
const usersModal = $('#users-modal'), addUserForm = $('#add-user-form');
async function openUsers() {
  usersModal.hidden = false;
  showErr(addUserForm);
  renderWorkflows(state.config?.workflows || []);
  await renderUsers();
}
const MODE_LABEL = { text2img: 'testo → immagine', img2img: 'rielaborazione', edit: 'editing', identity: 'volto di riferimento', scene: 'stessa persona, nuova scena', duo: 'due persone insieme', upscale: 'upscale', text2video: 'testo → video', img2video: 'immagine → video', vision: 'lettura immagini' };
function renderWorkflows(list) {
  $('#wf-list').innerHTML = list.map((w) => `<div class="wf-row ${w.available ? '' : 'off'}">
    <span class="wf-dot"></span><div><b>${esc(w.name)}</b> <small>${esc(MODE_LABEL[w.mode] || w.mode)}</small>
    ${w.available ? '' : `<div class="wf-missing">Modelli mancanti su ComfyUI: ${w.missing.map(esc).join(', ')}</div>`}</div></div>`).join('');
}
$('#btn-wf-reload').onclick = async (e) => {
  e.target.disabled = true;
  try {
    const list = await api('/api/workflows/reload', { method: 'POST' });
    state.config.workflows = list;
    renderWorkflows(list);
  } catch (err) { alert(err.message); }
  e.target.disabled = false;
};
async function renderUsers() {
  const list = await api('/api/users').catch((e) => { showErr(addUserForm, e.message); return []; });
  $('#user-list').innerHTML = list.map((u) => `<div class="user-row">
      <span class="user-avatar">${esc(u.displayName.slice(0, 1).toUpperCase())}</span>
      <div class="who">${esc(u.displayName)}${u.role === 'admin' ? '<span class="badge-role">admin</span>' : ''}${u.mustChangePassword ? '<span class="badge-temp">password temporanea</span>' : ''}
        <small>@${esc(u.username)}</small></div>
      <button class="btn" data-reset="${u.id}" data-name="${esc(u.displayName)}">Reimposta password</button>
    </div>`).join('');
}
$('#user-list').onclick = async (e) => {
  const b = e.target.closest('[data-reset]'); if (!b) return;
  const pw = prompt(`Nuova password temporanea per ${b.dataset.name} (vuoto = 1234).\nAl prossimo accesso dovrà sceglierne una personale.`, '');
  if (pw === null) return;
  try {
    await api(`/api/users/${b.dataset.reset}/reset-password`, { body: { password: pw.trim() || undefined } });
    if (b.dataset.reset === state.user.id) return location.reload();
    await renderUsers();
  } catch (err) { alert(err.message); }
};
addUserForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  showErr(addUserForm);
  const f = addUserForm;
  try {
    await api('/api/users', { body: { displayName: f.displayName.value, username: f.username.value, password: f.password.value.trim() || undefined, role: f.role.value } });
    f.reset();
    await renderUsers();
  } catch (err) { showErr(addUserForm, err.message); }
});
usersModal.addEventListener('click', (e) => { if (e.target === usersModal || e.target.closest('[data-close]')) usersModal.hidden = true; });

// ---------- Avvio ----------
let started = false;
async function startApp() {
  renderUserBox();
  if (started) { connectEvents(); await loadConvs(); loadNotifs(); return route(); }
  started = true;
  updateSend();
  connectEvents();
  pollStatus();
  setInterval(pollStatus, 20000);
  state.config = await api('/api/config').catch(() => ({ models: [], workflows: [], options: {} }));
  if (prefs.model && !state.config.models.some((m) => m.name === prefs.model)) delete prefs.model;
  renderModel();
  await loadConvs();
  loadNotifs();
  route();
}

(async function boot() {
  try {
    const { user } = await api('/api/auth/me', { raw: true });
    state.user = user;
    if (user.mustChangePassword) return showPasswordForm(true);
    startApp();
  } catch {
    showLogin();
  }
})();

// Mobile: segui l'altezza reale visibile (tastiera inclusa), così il campo di testo resta sopra la tastiera
if (window.visualViewport) {
  const fit = () => {
    document.documentElement.style.setProperty('--app-h', window.visualViewport.height + 'px');
    if (window.visualViewport.offsetTop) window.scrollTo(0, 0);
  };
  window.visualViewport.addEventListener('resize', fit);
  window.visualViewport.addEventListener('scroll', fit);
  fit();
}
