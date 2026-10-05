import * as ollama from './ollama.js';
import * as comfy from './comfy.js';
import config from './config.js';

/**
 * LoRA del corpo (seno, glutei, magra↔morbida), come in ChatBz 1 ma scelte in automatico:
 * dalla descrizione dell'aspetto si ricava una taglia per ogni parte, e la taglia diventa la forza della LoRA.
 * Funzionano solo con Krea 2: vengono agganciate dopo la LoRA Lenovo (fine della catena Krea Real).
 */
export const BODY = {
  breast: {
    label: 'Seno', file: 'breast_size_v2_krea2_loraholic.safetensors',
    sizes: { small: ['piccolo', -2], medium: ['medio', 0], large: ['grande', 2.5], huge: ['molto grande', 4.5] },
  },
  butt: {
    label: 'Glutei', file: 'ass_krea2_loraholic.safetensors',
    sizes: { small: ['piccoli', -1.5], medium: ['medi', 0], large: ['grandi', 2], huge: ['molto grandi', 3.5] },
  },
  build: {
    label: 'Corporatura', file: 'skinny_fat_v2_loraholic.safetensors',
    sizes: { very_slim: ['molto magra', -4], slim: ['magra', -2], athletic: ['atletica', -1], average: ['media', 0], curvy: ['morbida', 2], plump: ['in carne', 4.5] },
  },
};
const ANCHOR = 'lenovo_krea2';

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
    ['huge', /\b(huge|massive|enormous|very large|very big|gigantic)\s+(breasts?|bust|chest|boobs)|\b(seno|tette)\s+(enorm\w*|molto grand\w*)/i],
    ['large', /\b(large|big|full|ample|generous|heavy|voluptuous)\s+(breasts?|bust|chest|boobs)|\b(busty|buxom)\b|\b(seno|tette)\s+(grand\w*|abbondant\w*|prosperos\w*)|\bprosperosa\b/i],
    ['small', /\b(small|petite|tiny|modest|flat|little)\s+(breasts?|bust|chest|boobs)|\bflat[- ]chested\b|\b(seno|tette)\s+(piccol\w*|minut\w*)/i],
    ['medium', /\b(medium|average|moderate|natural)[- ]?(sized)?\s+(breasts?|bust|chest|boobs)|\bseno\s+medi\w*/i],
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
        { role: 'system', content: `You read a character's appearance and classify their body for an image generator. Reply ONLY with JSON: {"breast": "${opts('breast')}", "butt": "${opts('butt')}", "build": "${opts('build')}"}. Use what the text says or clearly implies (e.g. "busty" → large breast, "petite" → slim build, small breast); use "medium"/"average" when it says nothing about that part.` },
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
  return Object.entries(b).map(([k, s]) => `${BODY[k].label} ${BODY[k].sizes[s][0]}`).join(' · ');
}

/** LoRA da applicare per questo personaggio: [{ part, file, strength }] (solo quelle diverse da 0). */
export function bodyLoras(card) {
  if (!card || card.gender === 'uomo') return [];   // LoRA addestrate su corpi femminili
  const body = normalizeBody(card.body) || bodyFromKeywords(card.look) || {};
  return Object.entries(body)
    .map(([part, size]) => ({ part, file: BODY[part].file, strength: BODY[part].sizes[size][1] }))
    .filter((l) => l.strength !== 0);
}

// File LoRA presenti su ComfyUI (ricontrollati al massimo ogni 5 minuti)
let loraCache = { at: 0, files: null };
async function comfyLoras() {
  if (Date.now() - loraCache.at < 5 * 60 * 1000 && loraCache.files) return loraCache.files;
  const files = await comfy.listModels('loras').catch(() => null);
  loraCache = { at: Date.now(), files };
  return files;
}

/** Tiene solo le LoRA installate su ComfyUI, col nome esatto (anche se sono in una sottocartella). */
export async function installedLoras(loras) {
  if (!loras?.length) return [];
  const files = await comfyLoras();
  if (!files) return [];
  const out = [];
  for (const l of loras) {
    const name = files.find((f) => f.replace(/\\/g, '/').split('/').pop() === l.file);
    if (name) out.push({ ...l, name });
  }
  return out;
}

/** Aggancia le LoRA del corpo dopo ogni LoRA Lenovo del grafo (Krea Real): chi usava Lenovo usa l'ultima aggiunta. */
export function applyBodyLoras(graph, loras) {
  if (!loras?.length) return 0;
  const anchors = Object.keys(graph).filter((id) => graph[id].class_type === 'LoraLoaderModelOnly' && String(graph[id].inputs?.lora_name || '').includes(ANCHOR));
  let next = Math.max(0, ...Object.keys(graph).map(Number).filter(Number.isFinite)) + 1;
  const added = new Set();
  for (const anchor of anchors) {
    const users = Object.entries(graph).filter(([id]) => !added.has(id));
    let prev = anchor;
    for (const l of loras) {
      const id = String(next++);
      graph[id] = { class_type: 'LoraLoaderModelOnly', _meta: { title: `Corpo: ${BODY[l.part].label}` }, inputs: { model: [prev, 0], lora_name: l.name || l.file, strength_model: l.strength } };
      added.add(id);
      prev = id;
    }
    for (const [, n] of users) {
      for (const [k, v] of Object.entries(n.inputs || {})) if (Array.isArray(v) && String(v[0]) === anchor && v[1] === 0) n.inputs[k] = [prev, 0];
    }
  }
  return anchors.length;
}
