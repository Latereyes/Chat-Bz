import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = process.env;
const dataDir = env.DATA_DIR ? path.resolve(env.DATA_DIR) : path.join(root, 'data');

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
  },

  comfy: {
    url: env.COMFY_URL || 'http://127.0.0.1:8188',
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
    maxPostsPerRun: Number(env.DRIP_MAX_POSTS || 3),          // post automatici per accensione del server
    maxStoriesPerRun: Number(env.DRIP_MAX_STORIES || 4),      // storie automatiche per accensione
    postEveryHours: Number(env.SOCIAL_POST_HOURS || 20),      // distanza minima tra due post dello stesso personaggio
    storyEveryHours: Number(env.SOCIAL_STORY_HOURS || 8),
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
