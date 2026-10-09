import * as ollama from './ollama.js';
import * as comfy from './comfy.js';
import config from './config.js';

/**
 * LoRA del corpo (seno, glutei, magra↔morbida, seno naturale↔rifatto), come in ChatBz 1 ma scelte in automatico:
 * dalla descrizione dell'aspetto si ricava una taglia per ogni parte, e la taglia diventa la forza della LoRA.
 * Forze tarate su foto reali (Krea 2 Real, 2026-10-05).
 * Solo per Krea 2 (tutti i grafi: Real, Turbo, i2i, Reflex/Qwen → Krea Real): vengono agganciate dopo
 * la LoRA Lenovo se c'è, altrimenti in fondo alla catena di LoRA del modello.
 * Su Z-Image niente LoRA del corpo: rompevano la foto a qualsiasi forza (prova sul PC 2026-10-07), regge solo Lenovo.
 * Lì le proporzioni vanno nel prompt a parole (figureText).
 */
export const BODY = {
  breast: {
    label: 'Seno', files: { krea2: 'breast_size_v2_krea2_loraholic.safetensors' },
    sizes: { small: ['piccolo', -2], medium: ['medio', 0], large: ['grande', 1.5], huge: ['molto grande', 3] },
  },
  butt: {
    label: 'Glutei', files: { krea2: 'ass_krea2_loraholic.safetensors' },
    sizes: { small: ['piccoli', -1.5], medium: ['medi', 0], large: ['grandi', 2], huge: ['molto grandi', 3.5] },
  },
  build: {
    label: 'Corporatura', files: { krea2: 'skinny_fat_v2_loraholic.safetensors' },
    sizes: { very_slim: ['molto magra', -3], slim: ['magra', -2], athletic: ['atletica', -1], average: ['media', 0], curvy: ['morbida', 2], plump: ['in carne', 4.5] },
  },
  // seno naturale (−) ↔ rifatto (+): l'autore indica -5..+5; senza indicazioni nell'aspetto resta spenta
  implants: {
    label: 'Seno naturale/rifatto', short: 'Seno', range: [-5, 5], hint: 'negativo = naturale, 0 = spento, positivo = rifatto', files: { krea2: 'breast_fake_real_krea2_loraholic.safetensors' },
    sizes: { natural: ['naturale', 0], fake: ['rifatto', 3] },
  },
};
/**
 * LoRA che non si regolano a mano: seguono un'altra parte. Capezzoli in rilievo: in proporzione al seno,
 * dal suo intervallo (-8..+8) al loro (-5..+5) — scelta dell'utente, 2026-10-07.
 */
export const DERIVED = {
  // Tolta per ora: sul PC rompe l'immagine (2026-10-07). Per riattivarla basta togliere il commento (vale solo per Krea 2).
  // nipples: {
  //   label: 'Capezzoli', from: 'breast', range: [-5, 5],
  //   files: { krea2: 'nipples_protruding_krea2_loraholic.safetensors' },
  // },
};
const loraDef = (part) => BODY[part] || DERIVED[part];

/** Aggiunge alle LoRA del corpo quelle che ne seguono un'altra (capezzoli ← seno), con la forza in proporzione. */
export function withDerived(loras) {
  if (!loras?.length) return loras || [];
  const out = [...loras];
  for (const [part, d] of Object.entries(DERIVED)) {
    const src = loras.find((l) => l.part === d.from);
    if (!src || out.some((l) => l.part === part)) continue;
    const [lo, hi] = bodyRange(d.from);
    const strength = Math.round((src.strength >= 0 ? src.strength / hi * d.range[1] : src.strength / lo * d.range[0]) * 10) / 10;
    if (strength) out.push({ part, strength });
  }
  return out;
}

// Modelli con LoRA nel grafo (Lenovo, e per Krea 2 anche quelle del corpo di loraholic):
// unet = nome del modello nel grafo, lenovoFile / lenovo = file e forza della LoRA Lenovo quando la si aggiunge,
// body = regge le LoRA del corpo.
// Z-Image per ora resta grezzo (scelta dell'utente, 2026-10-09: ci si concentra su Krea 2): niente Lenovo, niente LoRA.
export const FAMILIES = {
  krea2: { label: 'Krea 2', unet: /krea2/i, lenovoFile: 'lenovo_krea2.safetensors', lenovo: 1.2, body: true },
  zimage: { label: 'Z-Image', unet: /^zit|z[-_ ]?image/i, lenovoFile: null, lenovo: 1, body: false },
};
/** La famiglia usa Lenovo (look foto amatoriale)? Solo Krea 2 per ora. */
export const hasLenovo = (family) => !!FAMILIES[family]?.lenovoFile;
/** La famiglia regge le LoRA del corpo? (Z-Image no: solo Lenovo) */
export const hasBodyLoras = (family) => !!FAMILIES[family]?.body;

/** Tiene solo valori validi: { breast: 'large', ... }. */
export function normalizeBody(b) {
  if (!b || typeof b !== 'object') return null;
  const out = {};
  for (const [k, def] of Object.entries(BODY)) if (Object.hasOwn(def.sizes, b[k])) out[k] = b[k];
  return Object.keys(out).length ? out : null;
}

// Parole chiave (inglese e italiano) per quando Gemma non risponde: si prende la prima che compare
const WORDS = {
  breast: [
    ['huge', /\b(huge|massive|enormous|very large|very big|gigantic)\s+(?:(?:fake|natural|real|perky|round|firm|augmented|soft)\s+)?(breasts?|bust|chest|boobs)|\b(seno|tette)\s+(enorm\w*|molto grand\w*)/i],
    ['large', /\b(large|big|full|ample|generous|heavy|voluptuous)\s+(?:(?:fake|natural|real|perky|round|firm|augmented|soft)\s+)?(breasts?|bust|chest|boobs)|\b(busty|buxom)\b|\b(seno|tette)\s+(grand\w*|abbondant\w*|prosperos\w*)|\bprosperosa\b/i],
    ['small', /\b(small|petite|tiny|modest|flat|little)\s+(?:(?:fake|natural|real|perky|round|firm|augmented|soft)\s+)?(breasts?|bust|chest|boobs)|\bflat[- ]chested\b|\b(seno|tette)\s+(piccol\w*|minut\w*)/i],
    ['medium', /\b(medium|average|moderate|natural)[- ]?(sized)?\s+(?:(?:fake|natural|real|perky|round|firm|augmented|soft)\s+)?(breasts?|bust|chest|boobs)|\bseno\s+medi\w*/i],
  ],
  butt: [
    ['huge', /\b(huge|massive|enormous|very large|very big)\s+(butt|ass|bottom|glutes|behind|rear)|\b(sedere|culo|glutei)\s+(enorm\w*|molto grand\w*)/i],
    ['large', /\b(large|big|round|full|bubble|thick|plump|curvy|generous|wide)\s+(butt|ass|bottom|glutes|behind|rear)|\b(bubble butt|wide hips|thick thighs)\b|\b(sedere|culo|glutei)\s+(grand\w*|tond\w*|abbondant\w*|pien\w*)|\bfianchi larghi\b/i],
    ['small', /\b(small|petite|tiny|flat|narrow|little)\s+(butt|ass|bottom|glutes|behind|rear)|\bnarrow hips\b|\b(sedere|culo|glutei)\s+(piccol\w*|piatt\w*)|\bfianchi stretti\b/i],
    ['medium', /\b(medium|average|toned|firm)\s+(butt|ass|bottom|glutes|behind|rear)/i],
  ],
  build: [
    ['plump', /\b(plump|chubby|fat|plus[- ]size|heavyset|bbw|overweight|fleshy|soft belly)\b|\b(grassoccia|cicciottell\w*|in carne|robust\w*|sovrappeso)\b/i],
    ['curvy', /\b(curvy|voluptuous|hourglass|thick|full[- ]figured|soft curves|shapely)\b|\b(formos\w*|morbid\w*|a clessidra)\b/i],
    ['very_slim', /\b(very (thin|slim|skinny)|skinny|waif|bony|underweight)\b|\b(magrissim\w*|scheletric\w*|pelle e ossa)\b/i],
    ['athletic', /\b(athletic|toned|fit|muscular|sporty|lean)\b|\b(atletic\w*|tonic\w*|sportiv\w*|muscolos\w*)\b/i],
    ['slim', /\b(slim|slender|thin|petite|lithe|willowy|small[- ]framed)\b|\b(magr\w*|snell\w*|esil\w*|minut\w*)\b/i],
    ['average', /\b(average|medium|normal)\s+(build|frame|body)\b|\bcorporatura media\b/i],
  ],
  implants: [
    ['fake', /\b(fake|augmented|enhanced|silicone|surgically enhanced)\s+(breasts?|bust|boobs|tits)|\b(breast|boob)\s+(implants?|job)|\bimplants\b|\b(seno|tette)\s+(rifatt\w*|siliconat\w*)|\bprotesi al seno\b/i],
    ['natural', /\bnatural\s+(breasts?|bust|boobs|tits)|\b(seno|tette)\s+natural\w*/i],
  ],
};

/** Taglie lette dal testo dell'aspetto con parole chiave (senza modello). */
export function bodyFromKeywords(look) {
  const text = String(look || '');
  const out = {};
  for (const [k, list] of Object.entries(WORDS)) {
    const hit = list.find(([, re]) => re.test(text));   // in ordine di priorità
    if (hit) out[k] = hit[0];
  }
  return normalizeBody(out);
}

/** Taglie decise da Gemma leggendo l'aspetto (JSON, niente tool); se non risponde, parole chiave. */
export async function analyzeBody(card, { model } = {}) {
  if (!card?.look) return null;
  const opts = (k) => Object.keys(BODY[k].sizes).join('|');
  try {
    const out = await ollama.complete({
      model: model || config.ollama.model,
      format: 'json',
      timeout: 45000,
      options: { temperature: 0, num_predict: 80 },
      messages: [
        { role: 'system', content: `You read a character's appearance and classify their body for an image generator. Reply ONLY with JSON: {"breast": "${opts('breast')}", "butt": "${opts('butt')}", "build": "${opts('build')}", "implants": "${opts('implants')}"}. Use what the text says or clearly implies (e.g. "busty" → large breast, "petite" → slim build, small breast); use "medium"/"average" when it says nothing about that part; "implants" is "fake" only if the text says augmented, implants, fake or silicone breasts, otherwise "natural".` },
        { role: 'user', content: `Gender: ${card.gender}\nAppearance: ${card.look}` },
      ],
    });
    const body = normalizeBody(JSON.parse(out));
    if (body) return body;
  } catch (e) {
    console.warn(`[body] Gemma non ha classificato il corpo (${e.message}), uso le parole chiave`);
  }
  return bodyFromKeywords(card.look);
}

/** Descrizione leggibile per la scheda: «Seno grande · Glutei medi · Corporatura morbida». */
export function bodySummary(body) {
  const b = normalizeBody(body);
  if (!b) return '';
  return Object.entries(b).map(([k, s]) => `${BODY[k].short || BODY[k].label} ${BODY[k].sizes[s][0]}`).join(' · ');
}

// Proporzioni dette a parole (inglese, senza nudità): le foto "presentabili" del social le perdevano
const FIGURE = {
  breast: { small: 'small bust', large: 'large full bust', huge: 'very large heavy bust' },
  butt: { small: 'narrow hips', large: 'wide hips and a round full bottom', huge: 'very wide hips and a big round bottom' },
  build: { very_slim: 'very slim frame', slim: 'slim figure', athletic: 'athletic toned figure', curvy: 'curvy hourglass figure', plump: 'soft, full plump figure' },
  implants: { fake: 'breasts with a visibly augmented, round and perky implant shape' },
};

/** «large full bust, curvy hourglass figure»: corporatura per le foto vestite (solo personaggi femminili). */
export function figureText(card) {
  if (!card || card.gender === 'uomo') return '';
  const manual = normalizeManual(card.bodyManual);
  const body = manual ? Object.fromEntries(Object.entries(manual).map(([k, s]) => [k, nearestSize(k, s)]))
    : normalizeBody(card.body) || bodyFromKeywords(card.look) || {};
  return Object.entries(body).map(([k, size]) => FIGURE[k]?.[size]).filter(Boolean).join(', ');
}

/**
 * Limiti dei cursori a mano: l'intervallo indicato dall'autore delle LoRA (Civitai), -8..+8 (naturale/rifatto -5..+5)
 * (le taglie automatiche restano quelle tarate in BODY).
 */
export const bodyRange = (part) => BODY[part]?.range || [-8, 8];

/** Forze scelte a mano { breast: 1.5, ... }: tutte le parti, limitate (0 se mancano); null se non è un oggetto. */
export function normalizeManual(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return null;
  const out = {};
  for (const part of Object.keys(BODY)) {
    const n = Number(values[part]);
    const [lo, hi] = bodyRange(part);
    out[part] = Number.isFinite(n) ? Math.round(Math.min(hi, Math.max(lo, n)) * 10) / 10 : 0;
  }
  return out;
}

/** LoRA scelte a mano (studio o scheda): { breast: 1.5, ... } → [{ part, file, strength }] diverse da 0. */
export function manualBodyLoras(values) {
  const v = normalizeManual(values);
  if (!v) return null;
  return Object.entries(v).filter(([, s]) => s !== 0).map(([part, strength]) => ({ part, strength }));
}

/** Taglia più vicina a una forza a mano (per le proporzioni dette a parole). */
function nearestSize(part, strength) {
  return Object.entries(BODY[part].sizes).reduce((best, [size, [, s]]) => (Math.abs(s - strength) < Math.abs(BODY[part].sizes[best][1] - strength) ? size : best), Object.keys(BODY[part].sizes)[0]);
}

/** LoRA da applicare per questo personaggio: [{ part, strength }] (solo quelle diverse da 0), per la famiglia del modello. */
export function bodyLoras(card, family = 'krea2') {
  if (!card || card.gender === 'uomo' || !hasBodyLoras(family)) return [];   // LoRA addestrate su corpi femminili
  if (card.bodyManual) return manualBodyLoras(card.bodyManual) || [];   // regolato a mano: vince sull'aspetto
  const body = normalizeBody(card.body) || bodyFromKeywords(card.look) || {};
  return Object.entries(body)
    .map(([part, size]) => ({ part, strength: BODY[part].sizes[size][1] }))
    .filter((l) => l.strength !== 0);
}

// File LoRA presenti su ComfyUI (ricontrollati al massimo ogni 5 minuti)
let loraCache = { at: 0, files: null };
export async function comfyLoras() {
  if (Date.now() - loraCache.at < 5 * 60 * 1000 && loraCache.files) return loraCache.files;
  const files = await comfy.listModels('loras').catch(() => null);
  loraCache = { at: Date.now(), files };
  return files;
}

/** File di una LoRA del corpo per questa famiglia di modelli, col percorso che ha su ComfyUI (anche in una sottocartella). */
function findBodyFile(files, part, family) {
  const want = loraDef(part)?.files[family];
  return (want && files.find((f) => f.replace(/\\/g, '/').split('/').pop() === want)) || null;
}

/** Tiene solo le LoRA installate su ComfyUI per la famiglia del modello (file in BODY[part].files). */
export async function installedLoras(loras, family = 'krea2') {
  if (!loras?.length || !hasBodyLoras(family)) return [];
  const files = await comfyLoras();
  if (!files) return [];
  const out = [];
  for (const l of loras) {
    const name = findBodyFile(files, l.part, family);
    if (name) out.push({ ...l, name });
  }
  return out;
}

/** Famiglia del modello del grafo ('krea2' | 'zimage'), dal nome del modello caricato (per Lenovo); null se non è nessuna delle due. */
export function bodyFamily(graph) {
  for (const n of Object.values(graph)) {
    if (n.class_type !== 'UNETLoader') continue;
    const name = String(n.inputs?.unet_name || '').replace(/\\/g, '/').split('/').pop();
    for (const [family, f] of Object.entries(FAMILIES)) if (f.unet.test(name)) return family;
  }
  return null;
}

/** Ultimo nodo della catena «modello → LoRA» partendo da ogni modello della famiglia. */
export function chainEnds(graph, family) {
  const unets = Object.keys(graph).filter((id) => graph[id].class_type === 'UNETLoader' && FAMILIES[family]?.unet.test(String(graph[id].inputs?.unet_name || '').replace(/\\/g, '/').split('/').pop()));
  return unets.map((id) => {
    let cur = id;
    for (;;) {
      const nextLora = Object.keys(graph).find((n) => graph[n].class_type === 'LoraLoaderModelOnly' && String(graph[n].inputs?.model?.[0]) === cur);
      if (!nextLora) return cur;
      cur = nextLora;
    }
  });
}

const isLenovo = (n) => n.class_type === 'LoraLoaderModelOnly' && /lenovo/i.test(String(n.inputs?.lora_name || ''));
const nextId = (graph) => Math.max(0, ...Object.keys(graph).map(Number).filter(Number.isFinite)) + 1;

/** Inserisce un nodo dopo «anchor»: chi usava l'uscita di anchor usa quella del nuovo nodo. */
export function insertAfter(graph, anchor, node) {
  const id = String(nextId(graph));
  for (const n of Object.values(graph)) {
    for (const [k, v] of Object.entries(n.inputs || {})) if (Array.isArray(v) && String(v[0]) === anchor && v[1] === 0) n.inputs[k] = [id, 0];
  }
  graph[id] = { ...node, inputs: { ...node.inputs, model: [anchor, 0] } };
  return id;
}

/** File della LoRA Lenovo (look foto amatoriale) per la famiglia, se installato. */
export async function lenovoLora(family) {
  const files = await comfyLoras();
  if (!files || !FAMILIES[family]?.lenovoFile) return null;
  return files.find((f) => f.replace(/\\/g, '/').split('/').pop() === FAMILIES[family].lenovoFile) || null;
}

/**
 * Lenovo sì/no scelto per il personaggio o nello studio. false: toglie le LoRA Lenovo dal grafo;
 * true: se il grafo non ce l'ha, la aggiunge in fondo alla catena del modello (serve il file della famiglia).
 * Restituisce true/false = Lenovo presente nel grafo alla fine.
 */
/** Toglie un nodo LoRA dalla catena: chi lo usava torna a usare il nodo prima. */
export function removeLora(graph, id) {
  const src = graph[id].inputs.model;
  delete graph[id];
  for (const n of Object.values(graph)) {
    for (const [k, v] of Object.entries(n.inputs || {})) if (Array.isArray(v) && String(v[0]) === id && v[1] === 0) n.inputs[k] = src;
  }
}

export function applyLenovo(graph, family, on, file) {
  const nodes = Object.keys(graph).filter((id) => isLenovo(graph[id]));
  if (on === false) {
    for (const id of nodes) removeLora(graph, id);
    return false;
  }
  if (on === true && !nodes.length && file) {
    for (const end of chainEnds(graph, family)) {
      insertAfter(graph, end, { class_type: 'LoraLoaderModelOnly', _meta: { title: 'Lenovo (look foto amatoriale)' }, inputs: { lora_name: file, strength_model: FAMILIES[family].lenovo } });
    }
  }
  return Object.values(graph).some(isLenovo);
}

/**
 * Aggancia le LoRA del corpo dopo ogni LoRA Lenovo del grafo, altrimenti in fondo alla catena del modello
 * (Krea 2 Turbo / i2i): chi usava quel nodo usa l'ultima aggiunta. Mai su Z-Image.
 */
export function applyBodyLoras(graph, loras, family = bodyFamily(graph)) {
  if (!loras?.length || !hasBodyLoras(family)) return 0;
  let anchors = Object.keys(graph).filter((id) => isLenovo(graph[id]));
  if (!anchors.length) anchors = chainEnds(graph, family);
  for (const anchor of anchors) {
    let prev = anchor;
    for (const l of loras) prev = insertAfter(graph, prev, { class_type: 'LoraLoaderModelOnly', _meta: { title: `Corpo: ${loraDef(l.part).label}` }, inputs: { lora_name: l.name || l.file, strength_model: l.strength } });
  }
  return anchors.length;
}
