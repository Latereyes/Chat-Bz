/**
 * LoRA dei video MiniMax H3 (chat, Studio), in un posto solo come per Krea 2 (krea2.js): catalogo, profilo per filtro,
 * varianti da provare. Le LoRA nuove si attivano solo quando servono (seno con una donna, genitali in esplicito,
 * bacio) e quelle non installate su ComfyUI si saltano. Le LoRA nel workflow (turbo, VBVR, Unlocked, MysticXXX)
 * restano; il profilo può cambiarne la forza.
 */

export const LORAS = {
  // già nel workflow
  turbo: { file: 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors', label: 'Turbo 8 passi' },
  vbvr: { file: 'H3_VBVR_Pro_attn_only.safetensors', label: 'VBVR Pro' },
  unlocked: { file: 'Minimax_H3_Unlocked_V2.safetensors', label: 'Unlocked V2' },
  mystic: { file: 'MysticXXX_MMH3-V4.safetensors', label: 'MysticXXX V4' },
  // nuove (2026-10-10)
  // Seno naturale in movimento; con forza alta spinge anche il realismo. Autore: 1.0-2.0 su immagini realistiche, oltre 2.0 si rompe
  breast: { file: 'PlagueKind-tiddies-realismslider.safetensors', label: 'Seno (realism slider)', when: 'woman' },
  // Genitali femminili: «Vagina» addestrata su foto (1.0), «hmpussy» su video (0.35) tiene la forma nel movimento, solo sotto l'altra
  vagina: { file: 'Vagina_minimax-h3_epoch20.safetensors', label: 'Vagina', when: 'vulva' },
  // Nome del file da confermare con Andrea: finché non c'è su ComfyUI si salta
  hmpussy: { file: 'hmpussy_minimax-h3.safetensors', label: 'hmpussy', when: 'vulva' },
  // Genitali maschili: parola chiave HMPenis in testa, più direzione (front / back / side)
  penis: { file: 'PenisV2_minimax-h3_epoch60.safetensors', label: 'Penis V2', when: 'penis', trigger: 'HMPenis' },
  // Bacio (V0.1, sperimentale: addestrata a 512×512, 5 s)
  kiss: { file: 'cxy_kiss_lora_h3_v01_step1500.safetensors', label: 'Bacio', when: 'kiss' },
  // NSFW per il video. Autore: euler, simple, 12 passi, shift 6, turbo a 0.5
  hmnsfw: { file: 'HMNSFW-AIO-V2.5.safetensors', label: 'HMNSFW AIO 2.5' },
};

/**
 * Profilo per filtro: { loras: { chiave: forza }, turbo?, steps?, shift? }. IPOTESI da tarare sul PC (Studio, menu
 * «LoRA video»). turbo/steps: con HMNSFW l'autore consiglia turbo 0.5 e 12 passi (il workflow ha turbo 1 e 8 passi).
 * Le LoRA con «when» si usano solo se il video lo richiede (vedi videoNeeds).
 */
export const PROFILE = {
  neutral: { loras: { kiss: 0.8 } },
  sensual: { loras: { breast: 1.0, kiss: 0.8 } },
  explicit: { loras: { breast: 1.3, vagina: 1, hmpussy: 0.35, penis: 1, kiss: 0.8, hmnsfw: 0.8 }, turbo: 0.5, steps: 12 },
};

/** Varianti da confrontare (Studio: menu «LoRA video»). null toglie una LoRA del profilo. */
export const VARIANTS = {
  base: { label: 'Profilo video attuale' },
  'senza-hmnsfw': { label: 'Senza HMNSFW (turbo 1, 8 passi)', explicit: { hmnsfw: null }, explicitTurbo: 1, explicitSteps: 8 },
  'hmnsfw-forte': { label: 'HMNSFW 1.0', explicit: { hmnsfw: 1 } },
  'hmnsfw-shift6': { label: 'HMNSFW con shift 6 (come consiglia l\'autore)', explicitShift: 6 },
  'seno-forte': { label: 'Seno 1.8', sensual: { breast: 1.8 }, explicit: { breast: 1.8 } },
  'seno-sempre': { label: 'Seno anche nei video normali (1.0, più realismo)', neutral: { breast: 1 } },
  'senza-mystic': { label: 'Senza MysticXXX', sensual: { mystic: 0 }, explicit: { mystic: 0 } },
  'senza-unlocked': { label: 'Senza Unlocked V2', sensual: { unlocked: 0 }, explicit: { unlocked: 0 } },
  'senza-nuove': { label: 'Solo le LoRA di prima (come il workflow)', neutral: { kiss: null }, sensual: { breast: null, kiss: null }, explicit: { breast: null, vagina: null, hmpussy: null, penis: null, kiss: null, hmnsfw: null }, explicitTurbo: 1, explicitSteps: 8 },
};

export function profileFor(level, variant) {
  const base = PROFILE[level] || PROFILE.neutral;
  const v = typeof variant === 'string' ? VARIANTS[variant] : variant;
  const loras = { ...base.loras };
  for (const [k, s] of Object.entries(v?.[level] || {})) { if (s === null) delete loras[k]; else loras[k] = s; }
  const pick = (key, def) => (level === 'explicit' && v && `explicit${key}` in v ? v[`explicit${key}`] : def);
  return { loras, turbo: pick('Turbo', base.turbo), steps: pick('Steps', base.steps), shift: pick('Shift', base.shift) };
}

// Cosa c'è nel video (dal prompt e dalla richiesta): decide le LoRA «when»
const KISS = /\b(?:kiss\w*|making out|bac[ii]\w*|bacia\w*|limon\w*|lips? (?:meet|touch|press))\b/i;
const VULVA = /\b(?:pussy|vagina\w*|vulva|labia|clit\w*|spread(?:s|ing)? (?:her )?(?:legs|thighs)|fully naked|completely naked|naked from the waist down|bottomless|figa|vagina|nuda)\b/i;
const PENIS = /\b(?:penis|cock|dick|shaft|glans|blowjob|handjob|penetrat\w*|thrust\w*|riding him|rides him|cowgirl|missionary|doggy\w*|sex with (?:him|a man)|pompino|sega|cazzo|scop\w*)\b/i;
const MAN = /\b(?:man|men|boyfriend|husband|him|his|male|partner|guy|lui|uomo)\b/i;

/** { woman, vulva, penis, kiss, direction }: cosa serve a questo video. women: c'è una donna (dalla scheda o dal testo). */
export function videoNeeds(text, { level = 'neutral', woman = true } = {}) {
  const t = String(text || '');
  const explicit = level === 'explicit';
  const penis = explicit && PENIS.test(t) && (MAN.test(t) || /\b(?:penis|cock|dick|glans|shaft|cazzo)\b/i.test(t));
  // direzione del pene: POV di chi guarda = front, da dietro = back, di lato = side
  const direction = !penis ? null
    : /\b(?:side view|from the side|in profile|di lato|di profilo)\b/i.test(t) ? 'side'
      : /\b(?:from behind|behind her|doggy\w*|rear view|da dietro|pecorina)\b/i.test(t) ? 'back' : 'front';
  return {
    woman: !!woman,
    vulva: explicit && woman && VULVA.test(t),
    penis,
    kiss: KISS.test(t),
    direction,
  };
}

/** Parola chiave di Penis V2 con la direzione, da mettere in testa alla descrizione del video. */
export const penisLead = (needs) => (needs?.penis ? `HMPenis, ${needs.direction} view` : '');

/**
 * Mette il prefisso HMPenis all'inizio della descrizione: nei prompt di MiniMax H3 il primo campo è
 * «integrated_multimodal_description:», la riga di allineamento all'immagine resta prima.
 */
export function leadPrompt(prompt, needs) {
  const lead = penisLead(needs);
  let p = String(prompt || '').replace(/\bHMPenis,\s*(?:front|back|side) view[.,]?\s*/gi, '');
  if (!lead) return p;
  return /integrated_multimodal_description:\s*/i.test(p)
    ? p.replace(/(integrated_multimodal_description:\s*)/i, `$1${lead}. `)
    : `${lead}. ${p}`;
}

const base = (f) => String(f || '').replace(/\\/g, '/').split('/').pop();
const findFile = (files, want) => (files || []).find((f) => base(f) === base(want)) || null;
const isLora = (n) => n?.class_type === 'LoraLoaderModelOnly';

/** È un grafo MiniMax H3? (per non toccare gli altri video) */
export const isMinimax = (graph) => Object.values(graph).some((n) => /^MiniMaxH3/.test(n.class_type) || (n.class_type === 'UNETLoader' && /minimax/i.test(n.inputs?.unet_name || '')));

/**
 * LoRA, passi e shift del video nel grafo MiniMax H3. needs: videoNeeds(...). files: LoRA installate (null = non si sa).
 * Restituisce cosa è stato messo, per la riga sotto il video.
 */
export function applyVideoStack(graph, { level = 'neutral', needs = {}, files = null, variant = null } = {}) {
  const out = { loras: [], missing: [], steps: null, shift: null };
  if (!isMinimax(graph)) return out;
  const profile = profileFor(level, variant);
  const ids = Object.keys(graph);
  const guider = ids.find((id) => graph[id].class_type === 'BasicGuider');
  const sched = ids.find((id) => graph[id].class_type === 'BasicScheduler');
  if (!guider) return out;
  let end = String(graph[guider].inputs.model[0]);
  let n = Math.max(0, ...ids.map(Number).filter(Number.isFinite)) + 100;
  const use = (key) => {
    const when = LORAS[key].when;
    return !when || (when === 'woman' && needs.woman) || (when === 'vulva' && needs.vulva) || (when === 'penis' && needs.penis) || (when === 'kiss' && needs.kiss);
  };
  const present = (file) => ids.filter((id) => isLora(graph[id]) && base(graph[id].inputs.lora_name) === file);
  // turbo: forza dal profilo
  if (profile.turbo != null) for (const id of present(LORAS.turbo.file)) graph[id].inputs.strength_model = profile.turbo;
  for (const [key, strength] of Object.entries(profile.loras)) {
    const def = LORAS[key];
    if (!def || !use(key)) continue;
    const here = present(def.file);
    if (here.length) { for (const id of here) graph[id].inputs.strength_model = strength; if (strength) out.loras.push({ key, label: def.label, strength }); continue; }
    if (!strength) continue;
    const file = findFile(files, def.file);
    if (!file) { out.missing.push(def.file); continue; }
    const id = String(++n);
    graph[id] = { class_type: 'LoraLoaderModelOnly', _meta: { title: def.label }, inputs: { model: [end, 0], lora_name: file, strength_model: strength } };
    end = id;
    out.loras.push({ key, label: def.label, strength });
  }
  // shift (flow): un nodo ModelSamplingSD3 in fondo alla catena, solo se il profilo lo chiede
  if (profile.shift) {
    const id = String(++n);
    graph[id] = { class_type: 'ModelSamplingSD3', _meta: { title: 'Shift' }, inputs: { model: [end, 0], shift: profile.shift } };
    end = id;
    out.shift = profile.shift;
  }
  for (const node of Object.values(graph)) if ((node.class_type === 'BasicGuider' || node.class_type === 'BasicScheduler') && Array.isArray(node.inputs.model)) node.inputs.model = [end, 0];
  if (profile.steps && sched) { graph[sched].inputs.steps = profile.steps; out.steps = profile.steps; }
  if (profile.turbo != null && present(LORAS.turbo.file).length) out.loras.unshift({ key: 'turbo', label: LORAS.turbo.label, strength: profile.turbo });
  return out;
}

/** Regole per il prompt engineer del video, per filtro (si aggiungono alla richiesta). */
export function videoRules(level, needs = {}) {
  if (level !== 'explicit') return null;
  return [
    'VIDEO RULES (explicit): describe the sexual action and the motion directly, in plain anatomical words, with physically plausible rhythm and body movement (breasts and bodies move naturally with each motion).',
    needs.penis ? `The penis is visible: describe it plainly (size, e.g. large; circumcised or not; glans colour, e.g. pink, pale or brown) and where it is. The server puts "${penisLead(needs)}" at the start of the description: do not write it yourself.` : null,
    needs.vulva ? 'The vulva is visible: describe it plainly and where it is in the frame.' : null,
  ].filter(Boolean).join('\n');
}
