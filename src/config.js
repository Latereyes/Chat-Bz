import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const dataDir = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(root, 'data');
// "1-7" → { from: 1, to: 7 } (ore locali); vuoto → nessuna pausa notturna
const parseHours = (v) => { const m = String(v || '').match(/^(\d{1,2})-(\d{1,2})$/); return m ? { from: Number(m[1]), to: Number(m[2]) } : null; };

export default {
  root,
  port: Number(env.PORT || 3100),
  host: env.HOST || '0.0.0.0',

  // Oggi Ollama e ComfyUI girano sullo stesso PC; quando torneranno su un altro PC basta
  // impostare OLLAMA_URL e COMFY_URL (es. http://192.168.1.12:11434), senza toccare il codice.
  ollama: {
    url: env.OLLAMA_URL || 'http://127.0.0.1:11434',
    model: env.OLLAMA_MODEL || 'gemma4-12b-uncensored:latest',
    numCtx: Number(env.OLLAMA_CTX || 24576),
    // Tempo per cui Ollama tiene il modello in VRAM tra un messaggio e l'altro
    keepAlive: env.OLLAMA_KEEP_ALIVE || '30m',
    // Nomi da mostrare nel menu dei modelli, per nome Ollama senza ":latest" (come in LocalAI)
    labels: {
      'gemma4-12b-uncensored': 'Gemma 4 12B',
      'Gemma4_26B': 'Gemma 4 26B',
      'gemma-heretic': 'Gemma Heretic',
      'mythomax-13b': 'MythoMax 13B',
      'qwen3.8-coder': 'Qwen Coder',
      'qwen3.8-aggressive': 'Qwen Aggressive',
    },
  },

  comfy: {
    url: env.COMFY_URL || 'http://127.0.0.1:8188',
  },

  // Arbitro della GPU condiviso con LocalAI: sta nell'agent del PC (remote-app-controller, porta 7070).
  // Se l'agent è spento si usa l'arbitro interno come prima. GPU_ARBITER=0 lo ignora del tutto.
  agent: {
    enabled: (env.GPU_ARBITER ?? '1') !== '0',
    url: env.AGENT_URL || 'http://127.0.0.1:7070',
    token: env.AGENT_TOKEN || '',   // serve solo se l'agent gira su un altro PC
    app: 'chatbz',
  },

  // Riflessione a riposo: quando una conversazione è ferma da REFLECT_IDLE_MIN minuti
  // (e la GPU è libera) il personaggio aggiorna rapporto, memorie e pensieri per la prossima volta.
  reflect: {
    idleMs: Number(env.REFLECT_IDLE_MIN || 3) * 60 * 1000,
    minMessages: Number(env.REFLECT_MIN_MESSAGES || 4),
  },

  // Iniziativa: alla riaccensione un personaggio può scriverti per primo (max un messaggio).
  initiative: {
    enabled: (env.INITIATIVE ?? '1') !== '0',
    minHours: Number(env.INITIATIVE_MIN_HOURS || 6),
  },

  // Coda a goccia del social: un pezzo alla volta, solo con la GPU libera e quando non stai chattando
  drip: {
    idleMs: Number(env.DRIP_IDLE_SEC || 90) * 1000,          // pausa dalla chat prima di lavorare
    postsPerDay: Number(env.DRIP_POSTS_DAY || 8),             // post automatici nelle ultime 24 ore (tutti i personaggi)
    storiesPerDay: Number(env.DRIP_STORIES_DAY || 12),        // storie automatiche nelle ultime 24 ore
    gapMinutes: Number(env.DRIP_GAP_MIN || 20),               // distanza minima tra due contenuti automatici
    postEveryHours: Number(env.SOCIAL_POST_HOURS || 12),      // ogni quanto, in media, posta lo stesso personaggio
    storyEveryHours: Number(env.SOCIAL_STORY_HOURS || 5),
    night: parseHours(env.DRIP_NIGHT ?? '1-7'),               // ore in cui i personaggi dormono (niente contenuti nuovi)
    meetEveryDays: Number(env.DRIP_MEET_DAYS || 3),           // foto insieme tra due personaggi: al massimo una ogni N giorni
    catchupHours: Number(env.LIFE_CATCHUP_HOURS || 2),        // server spento più di così: alla riaccensione raccontano cosa hanno fatto
  },

  // Livello delle foto del feed: neutral (presentabile) o sensual (mai esplicito)
  social: {
    level: env.SOCIAL_LEVEL === 'sensual' ? 'sensual' : 'neutral',
    // Caroselli con lo stesso volto della foto profilo (Qwen "stessa persona, nuova scena"), solo stile Krea
    identity: (env.SOCIAL_IDENTITY ?? '1') !== '0',
  },

  paths: {
    workflows: path.join(root, 'workflows'),
    data: dataDir,
    db: path.join(dataDir, 'chatbz.sqlite'),
    media: path.join(dataDir, 'media'),
    users: path.join(dataDir, 'users.json'),
    sessions: path.join(dataDir, 'sessions.json'),
    public: path.join(root, 'public'),
  },
};
