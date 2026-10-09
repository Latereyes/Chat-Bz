import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeCard } from '../../src/characters.js';
import { initialState, updateScene } from '../../src/relationship.js';

/**
 * Scenari del banco di prova delle foto (tools/prova-foto.js) e dei test automatici (test/photo.test.js).
 * Ogni scenario è un pezzo di conversazione già avvenuto: ultimo messaggio dell'utente, risposta del personaggio
 * e la descrizione che il personaggio ha passato a send_photo. expect: cosa deve uscire senza modelli.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

// Personaggi di prova: una donna Krea 2 (il motore su cui si tara), la stessa su Z-Image, una con l'intimità chiusa, Hitomi
const SARA = {
  name: 'Sara', age: 29, gender: 'donna', style: 'krea', relation: 'coppia', pace: 'media', intimacy: 'aperta',
  personality: 'Solare, diretta, ironica.', life: 'Fa la fisioterapista a Bologna.',
  look: 'A 29-year-old Italian woman with light olive skin. Wavy chestnut hair past the shoulders, hazel eyes, a few freckles on the nose. Curvy hourglass figure with large full breasts, a narrow waist and wide hips. Usually wears fitted jeans, simple tops and sneakers.',
  body: { breast: 'large', butt: 'large', build: 'curvy', implants: 'natural' },
};
const hitomi = JSON.parse(fs.readFileSync(path.join(here, '..', 'personaggi', 'hitomi.json'), 'utf8')).card;

export const CHARACTERS = {
  krea: normalizeCard(SARA),
  zimage: normalizeCard({ ...SARA, style: 'zimage' }),
  chiusa: normalizeCard({ ...SARA, name: 'Elena', relation: 'sconosciuti', intimacy: 'confidenza' }),
  // per le prove Hitomi è già in confidenza (la scheda vera parte da conoscenti)
  hitomi: normalizeCard({ ...hitomi, relation: 'coppia', intimacy: 'aperta' }),
};

export const USER = { name: 'Andrea', gender: 'uomo', look: 'tall, short brown hair, light stubble' };

const u = (content) => ({ role: 'user', content });
const a = (content) => ({ role: 'assistant', content });

export const SCENARIOS = [
  { id: 'normale-bar', title: 'Normale a distanza: selfie al bar', char: 'krea',
    scene: { presence: 'apart', place: 'un bar in centro', activity: 'aperitivo con Giulia', outfit: 'white linen shirt, blue jeans', intimacy: 'none' },
    messages: [u('dove sei? mandami un selfie'), a('al bar con Giulia ☕ eccomi')],
    description: 'A quick selfie at a small table of a busy café, smiling, a glass of spritz on the table, friend blurred in the background, late afternoon light from the window.',
    expect: { level: 'neutral' } },
  { id: 'normale-parco', title: 'Normale insieme: foto scattata da te al parco', char: 'krea',
    scene: { presence: 'together', place: 'parco dei Giardini Margherita', activity: 'passeggiata', outfit: 'light green summer dress, white sneakers', intimacy: 'none' },
    messages: [u('*tiro fuori il telefono* stai ferma così che ti faccio una foto'), a('*scoppia a ridere e si sistema i capelli* dai, non adesso… *ma resta lì, appoggiata all\'albero*')],
    description: 'Me laughing while leaning against a big tree in the park, fixing my hair, sunlight through the leaves.',
    expect: { level: 'neutral' } },
  { id: 'sensuale-intimo', title: 'Sensuale a distanza: «fammi vedere l\'intimo nuovo»', char: 'krea',
    scene: { presence: 'apart', place: 'a casa', activity: 'si prepara per uscire', outfit: '', intimacy: 'none' },
    messages: [u('allora? fammi vedere l\'intimo nuovo 😏'), a('sei impaziente eh… va bene, solo una')],
    description: 'Mirror selfie in my bedroom wearing the new black lace lingerie set, one hand on my hip, playful smile.',
    expect: { level: 'sensual' } },
  { id: 'sensuale-flirt', title: 'Sensuale in scena flirt: lei sul letto in vestaglia', char: 'krea',
    scene: { presence: 'together', place: 'camera da letto di Sara', activity: 'sul letto', outfit: 'short pink silk robe', intimacy: 'flirt' },
    messages: [u('*mi appoggio alla porta e ti guardo* resta così, ti faccio una foto'), a('*si gira sul fianco e lascia scivolare la vestaglia da una spalla* così ti piace?')],
    description: 'Me lying on my side on the bed in a short silk robe slipping off one shoulder, looking at the camera with a teasing smile, warm bedside lamp light.',
    expect: { level: 'sensual' } },
  { id: 'esplicito-pov-prima', title: 'Esplicito insieme: posizione e POV detti due messaggi prima', char: 'krea',
    scene: { presence: 'together', place: 'camera da letto di Sara', activity: 'fanno l\'amore', outfit: 'naked', intimacy: 'intimate' },
    messages: [
      u('*ti tiro su di me* stasera voglio vederti sopra, che mi cavalchi mentre ti guardo da sotto'), a('*sale sopra di te, le mani sul tuo petto* così?'),
      u('*ti stringo i fianchi* sì, non fermarti'), a('*si muove piano, gli occhi nei tuoi*'),
      u('*prendo il telefono dal comodino* aspetta, una foto così'), a('*si morde il labbro e rallenta* fai pure…'),
    ],
    description: 'A photo of me in the moment, on the bed.',
    expect: { level: 'explicit', hm: { position: 'cowgirl', angle: 'POV_ABOVE' } } },
  { id: 'esplicito-terza', title: 'Esplicito insieme in terza persona, chiesta', char: 'krea',
    scene: { presence: 'together', place: 'camera da letto di Sara', activity: 'fanno l\'amore', outfit: 'naked', intimacy: 'intimate' },
    messages: [u('metti il telefono sulla mensola col timer, voglio una foto in terza persona di noi due, tu a pecorina'), a('*ride e appoggia il telefono, poi si mette a quattro zampe sul letto* sbrigati!')],
    description: 'Third-person photo of both of us on the bed, me on all fours, him behind me.',
    expect: { level: 'explicit', hm: { position: 'doggy', angle: null } } },
  { id: 'esplicito-specchio', title: 'Esplicito a distanza: selfie nuda allo specchio', char: 'krea',
    scene: { presence: 'apart', place: 'a casa', activity: 'dopo la doccia', outfit: '', intimacy: 'none' },
    messages: [u('mandami una foto nuda allo specchio'), a('mmh… solo perché sei tu')],
    description: 'Mirror selfie in the bathroom after the shower, completely naked, phone in one hand, steam on the mirror.',
    expect: { level: 'explicit', hm: null } },
  { id: 'tetto-chiuso', title: 'Tetto chiuso: richiesta esplicita a chi non è in confidenza', char: 'chiusa',
    scene: { presence: 'apart', place: 'a casa', activity: '', outfit: '', intimacy: 'none' },
    messages: [u('dai mandami una foto nuda'), a('ahah calma, ci conosciamo da due giorni. ti mando una foto del mio gatto semmai')],
    description: 'A selfie on the sofa holding my cat, amused expression.',
    expect: { level: 'neutral' } },
  // Situazioni principali di Krea 2 in esplicito (taratura delle LoRA NSFW e di HMNSFW)
  { id: 'missionario-alto', title: 'Missionario, foto dall\'alto', char: 'krea',
    scene: { presence: 'together', place: 'camera da letto di Sara', activity: 'fanno l\'amore', outfit: 'naked', intimacy: 'intimate' },
    messages: [u('*ti stendo sul letto* missionario, e ti faccio una foto dall\'alto mentre ti prendo'), a('*allarga le gambe e ti tira a sé* vieni qui')],
    description: 'Me on my back on the bed, legs open around him, looking up at the camera.',
    expect: { level: 'explicit', hm: { position: 'missionary', angle: 'OVERHEAD' } } },
  { id: 'pecorina-dietro', title: 'Pecorina, foto da dietro', char: 'krea',
    scene: { presence: 'together', place: 'divano', activity: 'fanno l\'amore', outfit: 'naked', intimacy: 'intimate' },
    messages: [u('*ti giro* mettiti a pecorina sul divano, ti fotografo da dietro'), a('*si appoggia allo schienale e inarca la schiena* così?')],
    description: 'Me on all fours on the sofa, arching my back, looking back over my shoulder.',
    expect: { level: 'explicit', hm: { position: 'doggy', angle: 'BEHIND' } } },
  { id: 'handjob', title: 'Handjob in POV', char: 'krea',
    scene: { presence: 'together', place: 'letto', activity: 'preliminari', outfit: 'black lace panties', intimacy: 'intimate' },
    messages: [u('*mi sdraio* fammi una sega mentre ti guardo, voglio una foto'), a('*si inginocchia accanto a te e ti prende in mano* ti piace così?')],
    description: 'Me kneeling next to him on the bed, my hand around his erect penis, smiling at the camera.',
    expect: { level: 'explicit', hm: { position: 'handjob', angle: 'POV_FRONT' } } },
  { id: 'finale', title: 'Finale (cum) sul viso', char: 'krea',
    scene: { presence: 'together', place: 'letto', activity: 'fanno l\'amore', outfit: 'naked', intimacy: 'intimate' },
    messages: [u('ti vengo sulla faccia… e poi ti faccio una foto'), a('*chiude gli occhi e sorride* dai…')],
    description: 'Close-up of my face after he came on it, smiling, eyes half closed.',
    expect: { level: 'explicit', hm: { position: 'cum', angle: 'CLOSEUP' } } },
  { id: 'hitomi-selfie', title: 'Hitomi: selfie normale (LoRA del personaggio)', char: 'hitomi',
    scene: { presence: 'apart', place: 'a casa, alla scrivania', activity: 'disegna', outfit: 'oversized grey sweater', intimacy: 'none' },
    messages: [u('come va il portfolio? fammi vedere come sei messa'), a('un disastro 😅 eccomi')],
    description: 'Selfie at my desk full of sketches and a coffee mug, tired smile, desk lamp light at night.',
    expect: { level: 'neutral', trigger: true } },
  { id: 'hitomi-esplicito', title: 'Hitomi: cowgirl in POV', char: 'hitomi',
    scene: { presence: 'together', place: 'monolocale di Hitomi', activity: 'fanno l\'amore', outfit: 'naked', intimacy: 'intimate' },
    messages: [u('*ti tiro sopra di me* cavalcami, voglio una foto così'), a('*si mette a cavalcioni, le mani sul tuo petto* allora guardami')],
    description: 'Me on top of him on the bed, hands on his chest, looking down into the camera.',
    expect: { level: 'explicit', hm: { position: 'cowgirl', angle: 'POV_ABOVE' }, trigger: true } },
];

// Con --zimage: tre scenari anche su Z-Image (resta grezzo: niente Lenovo, niente LoRA)
export const ZIMAGE_SCENARIOS = ['normale-bar', 'sensuale-intimo', 'esplicito-specchio'];

/** Stato del personaggio per lo scenario (rapporto dalla scheda, scena dello scenario). */
export function scenarioState(sc) {
  const card = CHARACTERS[sc.char];
  const state = initialState(card);
  state.scene = updateScene(state.scene, sc.scene);
  state.scene.intimacy = sc.scene.intimacy;
  return { card, state };
}

/** Conversazione dello scenario nel formato dei messaggi della chat; idx = la risposta che manda la foto. */
export function scenarioMessages(sc) {
  const messages = sc.messages.map((m, i) => ({ id: String(i), role: m.role, content: m.content, status: 'done', createdAt: Date.now() - (sc.messages.length - i) * 60000 }));
  const idx = messages.findLastIndex((m) => m.role === 'assistant');
  return { messages, idx, userText: messages.slice(0, idx).findLast((m) => m.role === 'user')?.content || '', reply: messages[idx]?.content || '' };
}
