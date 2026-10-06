// Importa un personaggio da un file JSON (es. uno riadattato da ChatBz 1) nel database di ChatBz 2.
//   node tools/importa-personaggio.js tools/personaggi/giorgia.json [--doppio]
// Il file contiene: owner (nome utente), card (scheda), avatar (immagine, facoltativa, percorso relativo alla
// cartella di ChatBz 2) e scene (stato iniziale, facoltativo).
// Si può lanciare anche con il server acceso: il personaggio compare ricaricando la pagina.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import config from '../src/config.js';
import * as store from '../src/store.js';
import { updateScene } from '../src/relationship.js';

const file = process.argv[2];
if (!file) {
  console.error('Uso: node tools/importa-personaggio.js <file.json> [--doppio]');
  process.exit(1);
}
const src = JSON.parse(fs.readFileSync(file, 'utf8'));
const users = JSON.parse(fs.readFileSync(config.paths.users, 'utf8'));
const owner = (Array.isArray(users) ? users : users.users || Object.values(users)).find((u) => u.username === (src.owner || 'andrea'));
if (!owner) throw new Error(`Utente «${src.owner}» non trovato in ${config.paths.users}`);

if (!process.argv.includes('--doppio') && store.list(owner.id).some((c) => c.card.name === src.card.name)) {
  console.error(`${owner.username} ha già un personaggio di nome ${src.card.name}: non importo (aggiungi --doppio per crearne comunque un altro).`);
  process.exit(1);
}

const c = store.create(owner.id, src.card);
if (src.avatar) {
  const from = path.resolve(config.root, src.avatar);
  if (fs.existsSync(from)) {
    const name = `${owner.id}/avatar-${randomUUID()}${path.extname(from).toLowerCase() || '.png'}`;
    fs.mkdirSync(path.join(config.paths.media, owner.id), { recursive: true });
    fs.copyFileSync(from, path.join(config.paths.media, name));
    c.avatar = name;
  } else {
    console.warn(`Avatar non trovato (${from}): il profilo sarà la prima foto generata.`);
  }
}
if (src.scene) c.state.scene = updateScene(c.state.scene, src.scene);
if (c.card.greeting) {
  c.messages.push({ id: store.newId(), role: 'assistant', content: c.card.greeting, media: [], status: 'done', presence: c.state.scene.presence, createdAt: Date.now() });
}
await store.save(c);
console.log(`Importato ${c.card.name} per ${owner.username} (id ${c.id})${c.avatar ? `, avatar ${c.avatar}` : ''}.`);
