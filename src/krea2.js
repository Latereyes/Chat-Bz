/**
 * LoRA di supporto di Krea 2 (foto in chat, social e Studio), in un posto solo così la taratura cambia un file.
 *
 * Le LoRA nei grafi ComfyUI si sommano: l'ordine nella catena non conta, conta solo la forza.
 * Ogni LoRA ha un ruolo:
 *  - realism: pelle, anatomia e vestiti realistici (una sola alla volta: sostituisce quella del workflow)
 *  - unlock:  toglie i rifiuti del text encoder e sblocca la nudità
 *  - nsfw:    atti sessuali e anatomia esplicita
 *  - pose:    HMNSFW, posizioni con token (vedi hmTokens in photo.js): solo se si riconosce la posizione
 *  - detail:  dettaglio e texture
 * Una LoRA che non è installata su ComfyUI viene saltata (si vede nella foto, sotto «LoRA»).
 */
export const LORAS = {
  realism31: { file: 'realism_engine_krea2_v3.1.safetensors', label: 'Realism Engine 3.1', role: 'realism' },
  // Nuova (2026-10-09): 1.0 uso generale, 1.5-2.0 NSFW (indicazioni dell'autore)
  realismV2: { file: 'Krea2-realism-V2.safetensors', label: 'Krea2 Realism V2', role: 'realism' },
  refusal: { file: 'Krea2_TextFusion_Refusal_Reduction.safetensors', label: 'Anti-rifiuto', role: 'unlock' },
  // Autore: 0.5-0.9, euler, 20+ passi, CFG 3.5 (pensati per Krea 2 base: sul Turbo da provare)
  unlocked: { file: 'kera2_Unlocked_V1.safetensors', label: 'Unlocked V1', role: 'unlock' },
  // Autore: euler/beta 12 passi sul Turbo, pelle e texture migliori (sul PC c'è la v2, 2026-10-09)
  mystic: { file: 'MysticXXX_KREA2_v2.safetensors', label: 'MysticXXX v2', role: 'nsfw' },
  // Prompt: «HMNSFW <posizione>, ANGLE_<angolo>, <descrizione 60-120 parole>»
  hmnsfw: { file: 'Krea2_HMNSFW_AIO.safetensors', label: 'HMNSFW AIO', role: 'pose' },
  detailer: { file: 'Detailer-KREA2.safetensors', label: 'Detailer', role: 'detail' },
};

/**
 * Profilo predefinito per filtro: { loras: { chiave: forza }, sampler?, bodyScale? }.
 * È un'IPOTESI da tarare sul PC con il banco di prova (tools/prova-foto.js --foto): le varianti in VARIANTS
 * servono a confrontarla. Quando la matrice è a posto, si copia qui la variante vincente.
 * sampler: passi/scheduler/cfg del KSampler di Krea 2 testo → immagine (il workflow ha euler/simple 8 passi, cfg 1).
 * bodyScale: le LoRA del corpo in esplicito si scalano (con le LoRA NSFW sopra tendevano a deformare).
 */
export const PROFILE = {
  neutral: { loras: { realism31: 0.7 } },
  sensual: { loras: { realism31: 0.7 } },
  explicit: { loras: { realism31: 0.7, refusal: 1, unlocked: 0.6, mystic: 0.5, hmnsfw: 0.8 }, sampler: { steps: 12, scheduler: 'beta' }, bodyScale: 0.8 },
};

/**
 * Varianti da confrontare nel banco di prova: ognuna cambia il profilo predefinito solo dove lo dice
 * (stessa foto, stesso seed, stesso prompt). null toglie una LoRA del profilo.
 */
export const VARIANTS = {
  base: { label: 'Profilo attuale' },
  'realism-v2': { label: 'Realism V2 al posto della 3.1', neutral: { realism31: null, realismV2: 1 }, sensual: { realism31: null, realismV2: 1.2 }, explicit: { realism31: null, realismV2: 1.5 } },
  'realism-v2-forte': { label: 'Realism V2 forte in esplicito', neutral: { realism31: null, realismV2: 1 }, sensual: { realism31: null, realismV2: 1.5 }, explicit: { realism31: null, realismV2: 2 } },
  'senza-realism': { label: 'Senza LoRA di realismo', neutral: { realism31: null }, sensual: { realism31: null }, explicit: { realism31: null } },
  'sensuale-sbloccata': { label: 'Sensuale con anti-rifiuto e Unlocked 0.5', sensual: { refusal: 1, unlocked: 0.5 } },
  'senza-refusal': { label: 'Senza anti-rifiuto', explicit: { refusal: null } },
  'senza-unlocked': { label: 'Senza Unlocked V1', explicit: { unlocked: null } },
  'unlocked-forte': { label: 'Unlocked V1 0.9', explicit: { unlocked: 0.9 } },
  'senza-mystic': { label: 'Senza MysticXXX', explicit: { mystic: null } },
  'mystic-forte': { label: 'MysticXXX 0.9', explicit: { mystic: 0.9 } },
  'solo-sblocco': { label: 'Solo anti-rifiuto e Unlocked (niente LoRA NSFW)', explicit: { mystic: null, hmnsfw: null } },
  'senza-hmnsfw': { label: 'Senza HMNSFW', explicit: { hmnsfw: null } },
  detailer: { label: '+ Detailer 0.6', neutral: { detailer: 0.6 }, sensual: { detailer: 0.6 }, explicit: { detailer: 0.6 } },
  'sampler-8': { label: 'Sampler del workflow (8 passi, simple)', explicitSampler: null },
  'sampler-20-cfg': { label: '20 passi, CFG 3.5 (come Unlocked V1)', explicitSampler: { steps: 20, scheduler: 'beta', cfg: 3.5 } },
};

/** Profilo di un filtro, con una variante del banco di prova applicata sopra. */
export function profileFor(level, variant) {
  const base = PROFILE[level] || PROFILE.neutral;
  const v = typeof variant === 'string' ? VARIANTS[variant] : variant;
  if (!v) return { ...base, loras: { ...base.loras } };
  const loras = { ...base.loras };
  for (const [k, s] of Object.entries(v[level] || {})) {
    if (s === null) delete loras[k];
    else loras[k] = s;
  }
  const sampler = level === 'explicit' && 'explicitSampler' in v ? v.explicitSampler : base.sampler;
  return { ...base, loras, sampler: sampler || undefined };
}

/**
 * Foto con due personaggi che hanno ognuno la sua LoRA: due LoRA di volti nello stesso grafo si mescolano (volti fusi,
 * vestiti scambiati). Si genera la scena senza le LoRA dei volti (persona 1 a sinistra, persona 2 a destra), poi si
 * ritocca ogni volto da solo con la sua LoRA (Impact Pack: volti trovati con face_yolov8m, ordinati da sinistra).
 * denoise: quanto il ritocco ridisegna il volto (più alto = più somigliante alla LoRA, ma meno legato alla scena).
 */
export const DUO_FACES = { denoise: 0.5, steps: 8, cfg: 1, sampler: 'euler', scheduler: 'simple', cropFactor: 2.5, guideSize: 1024, feather: 8 };
/**
 * Prima del volto, se sul PC c'è il rilevamento delle persone (segm/person_yolov8m-seg.pt), si ritocca tutta la persona
 * con la sua LoRA: così il fisico viene dalla LoRA e non solo dalle parole della scheda. denoise più basso del volto,
 * perché vestiti, posa e posto devono restare quelli della scena.
 */
/**
 * Foto con un solo personaggio con la sua LoRA: ritocco del volto con la stessa LoRA (la scena ce l'ha già).
 * La LoRA rende bene i volti grandi; nelle foto a figura intera o da lontano il volto è piccolo e la somiglianza cala.
 * Si ritocca il volto più grande della foto. on: false lo spegne per tutte le foto singole.
 */
// denoise basso (0.35): ridisegna i tratti con la LoRA ma lascia espressione, bocca e sguardo della foto
export const SINGLE_FACE = { on: true, denoise: 0.35 };
export const DUO_BODY = { model: 'segm/person_yolov8m-seg.pt', denoise: 0.42, cropFactor: 1.3, dropSize: 64 };
