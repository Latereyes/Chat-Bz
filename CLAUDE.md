# ChatBz 2: istruzioni per Claude

Personaggi AI locali: chat con Gemma (Ollama) e foto e video con ComfyUI, sulla stessa GPU (RTX 4070 Ti Super, 16 GB). Gira sul PC di Andrea (Windows), che vede i risultati dal browser e dal telefono. Il README spiega cosa fa l'app; qui ci sono le regole per lavorarci.

## Lingua e stile
- Rispondi ad Andrea in italiano semplice, senza gergo: spiega cosa cambia nell'app, non nel codice.
- Codice: commenti, messaggi di log, testi dell'interfaccia e messaggi di commit in **italiano**. I prompt per i modelli (Gemma, Krea, Z-Image) vanno in **inglese**.
- Imita il codice intorno: ESM, niente build, niente TypeScript, niente dipendenze nuove senza chiedere. Commenti brevi che spiegano il *perché*, spesso con la data della prova sul PC («prova sul PC 2026-10-07: …»).
- Le espressioni regolari che leggono i messaggi coprono italiano e inglese.

## Comandi
- `npm start` (o `start.bat`): server su http://localhost:3100. Richiede Ollama su :11434 e ComfyUI su :8188.
- `npm test`: test automatici (`node --test`). Prima di ogni commit devono finire con `fail 0`.
- `node tools/prova-foto.js --solo-richieste | --prompt | --foto [--varianti …] [--scenari …] [--seed …]`: banco di prova delle foto (vedi sotto).
- `node tools/importa-personaggio.js tools/personaggi/<nome>.json`: importa un personaggio.
- Node 22.13+, SQLite con `node:sqlite`. Il database e le foto stanno in `data/` (ignorato da git: non cancellarlo mai).

## Architettura in breve
- `src/chat.js`: un turno di chat (contesto → Gemma → scena, foto, video → coda).
- `src/photo.js`: **unico punto per le foto dei personaggi**:
  - filtro (`photoLevel`) e richiesta al prompt engineer (`photoRequest`);
  - prompt (`engineerPhoto`), con i token di HMNSFW e la parola chiave della LoRA del personaggio;
  - grafo (`applyPhotoStack`): Lenovo, corpo, LoRA di supporto, LoRA del personaggio.

  Chat e social lo usano; lo Studio (`src/studio.js`) ne prende solo LoRA e Lenovo. Non rimettere regole delle foto sparse in `prompts.js` o `social-prompts.js`.
- `src/group.js`: chat a due (tu e due personaggi). La conversazione ha id `g-…` e passa dalle stesse rotte `/api/characters/:id` e dallo stesso turno di `chat.js`, che prende da qui prompt, strumenti e foto.
- `src/krea2.js`: catalogo delle LoRA di supporto di Krea 2, `PROFILE` per filtro (Normale/Sensuale/Esplicito) e `VARIANTS` per il banco di prova. La taratura cambia **solo questo file**.
- `src/body.js`: LoRA del corpo (solo Krea 2) e Lenovo (solo Krea 2: **Z-Image per ora resta grezzo**, niente Lenovo né LoRA).
- `src/gpu.js`: arbitro della VRAM. Ogni chiamata a Ollama o ComfyUI passa da `gpu.run('ollama'|'comfy', …)`: i due non stanno in memoria insieme. Con l'agent del PC acceso l'arbitro è condiviso con LocalAI.
- `src/queue.js`: coda a goccia del social, persistente nel database.
- `workflows/<id>/`: grafo ComfyUI (formato API) + `manifest.json` + `guide.md` per il prompt engineer. I file in `requires` disattivano il workflow se mancano: non metterci le LoRA facoltative.

## Foto: regole che contano
- Tre filtri, mai oltre il tetto del personaggio. Il filtro e il perché vengono salvati in `media.level` / `media.levelReason` e mostrati sotto la foto.
- In esplicito comandano le indicazioni dell'utente (posizione, POV, inquadratura) e Gemma vede gli ultimi 3 scambi.
- HMNSFW: posizione e angolo li ricava il server (`hmTokens`), non Gemma. La LoRA si aggancia solo se il prompt comincia con `HMNSFW`.
- Le LoRA non installate su ComfyUI si saltano senza errori. Se il nome di un file cambia sul disco, si corregge in `src/krea2.js`.
- Ogni cambio alle foto si prova con il banco di prova, non su una foto sola: una correzione a mano su un caso ne rompeva un altro.

## Prove in corso: chat a due, foto a due, ritocco del volto
Sul branch `claude/admiring-goldberg-rgvept` (non ancora in `main`): leggi **`piano/a-due-e-volti.md`** per cosa è cambiato, le prove da fare e i valori da tarare.

## Video MiniMax: LoRA nuove, video lunghi e «Continua»
`src/minimax.js` (catalogo, profilo per filtro, varianti), `src/videochain.js` (video oltre 15 s in pezzi che si continuano, pulsante «Continua») e **`piano/video.md`** (cosa provare e cosa tarare). Scritto nel cloud senza ComfyUI: **prima di tutto** segui `piano/verifica-video.md` (`node tools/verifica-video.js` controlla i grafi sul ComfyUI del PC).

## Taratura in corso
Il lavoro di adesso è in `piano/prossimi-passi.md`: segui quella lista, spunta le caselle e compila la tabella delle scelte. Il contesto è in `piano/piano-immagini.md`. Per i giri di prova c'è la skill `taratura-foto`. Nello Studio i menu «Filtro» e «LoRA Krea» permettono di provare una variante su una singola foto.

## Git
- Lavora su un branch, non su `main`. Il lavoro sulle foto (PR Latereyes/Chat-Bz#14) è già in `main`: la taratura continua con piccoli branch nuovi partendo da `main`.
- Commit piccoli, con un titolo in italiano che dice cosa cambia per chi usa l'app.
- Non fare push né aprire o unire PR senza che Andrea lo chieda.
