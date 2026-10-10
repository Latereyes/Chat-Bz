# Verifica dei video sul PC: LoRA nuove, video lunghi e «Continua»

Per Claude sul PC di Andrea. Il lavoro sui video è stato scritto nel cloud, **dove non c'è ComfyUI**: i test automatici passano, ma nessun video è mai stato generato con il codice nuovo. Questo file dice come verificarlo, in ordine, dal controllo più veloce alla prova vera.

Branch: `claude/admiring-goldberg-rgvept` (lo stesso delle prove a due: `piano/a-due-e-volti.md`). Regole generali in `CLAUDE.md`: rispondi ad Andrea in italiano semplice, mostragli i video, chiedi prima di cambiare valori, aggiornare ComfyUI o fare commit.

## Cosa c'è da verificare
- **LoRA nuove dei video** (`src/minimax.js`): seno, Vagina + hmpussy, Penis V2, bacio, HMNSFW 2.5 con turbo 0.5 e 12 passi, lo shift con `MiniMaxH3SigmaShift`. Dettagli e prove in `piano/video.md` (punti 1-7).
- **Video lunghi** (`src/videochain.js`): fino a 15 s un pezzo solo; da 16 a 30 s pezzi da 10 s che si continuano. Ogni pezzo carica il video precedente, usa gli ultimi 22 fotogrammi e il loro audio come guida (`MiniMaxH3AddGuide`), genera e si incolla in coda: ogni pezzo salva il video intero fin lì.
- **«Continua»**: pulsante sotto ogni video finito, in chat e nello Studio. Fa la stessa cosa a partire da quel video.
- Senza `MiniMaxH3AddGuide` il pezzo parte solo dall'ultimo fotogramma. Senza gli altri nodi nuovi (`LoadVideo`, `GetVideoComponents`, `ImageFromBatch`, `ImageBatch`, `AudioConcat`, `TrimAudioDuration`) il pezzo finisce con l'errore «serve un ComfyUI più recente».

Il codice tocca: `src/videochain.js` (nuovo), `src/jobs.js` (`continueGraphFor`), `src/chat.js` e `src/studio.js` (durata, pezzi, `continueVideo`), `src/comfy.js` (`hasNodes`, upload dei video), `server.js` (rotte `…/media/:mediaId/continue`), `public/app.js` e `public/index.html` (pulsante «Continua», menu «Durata»), i due `manifest.json` di MiniMax (massimo 15 s).

## 1. Allinea e lancia i test
```powershell
git fetch origin
git checkout claude/admiring-goldberg-rgvept
git pull
npm install
npm test
```
`npm test` deve finire con `fail 0`. In alternativa, `powershell -ExecutionPolicy Bypass -File tools\prepara-pc.ps1` fa tutto questo e, al passo 8, anche il controllo del punto 2 (con ComfyUI acceso).

## 2. Controllo dei grafi su ComfyUI (senza generare niente)
Con ComfyUI acceso e ChatBz anche spento:
```powershell
node tools/verifica-video.js
```
Chiede a ComfyUI l'elenco dei nodi installati e delle LoRA, poi controlla tutti i grafi che ChatBz manderebbe per i video: image to video e text to video per ogni filtro, la variante con lo shift, i grafi «continua». Fa gli stessi controlli che ComfyUI fa prima di partire: nodi presenti, input obbligatori, nomi degli input, tipi dei collegamenti, valori ammessi.

- **Tutto OK**: passa al punto 3.
- **`!!` su una LoRA**: il file manca o ha un altro nome. Se ha un altro nome, correggi `LORAS` in `src/minimax.js`.
- **`!!` su `MiniMaxH3AddGuide`** oppure **XX «nodo non installato»** su uno dei nodi nuovi: ComfyUI è troppo vecchio. Proponi ad Andrea di aggiornarlo (ComfyUI portable: `update\update_comfyui.bat`; installazione con git: `git pull` nella cartella di ComfyUI, poi `pip install -r requirements.txt`). Poi riavvia ComfyUI e rilancia la verifica. **Chiedi prima**: aggiornare può toccare i custom node che servono alle foto.
- **XX con un altro messaggio**: vedi «Se la verifica trova problemi» qui sotto.

### Se la verifica trova problemi
Ogni riga XX dice nodo, input e cosa non va; tra parentesi ci sono i nomi e i valori che ComfyUI accetta sul PC.

| Messaggio | Cosa vuol dire | Dove si corregge |
|---|---|---|
| input «x» sconosciuto (il nodo ha: …) | il nodo sul PC chiama l'input in un altro modo | `continueGraph` in `src/videochain.js` (nodi del «continua») o `applyVideoStack` in `src/minimax.js` (LoRA, passi, shift) |
| manca l'input obbligatorio «x» | il nodo sul PC vuole un input in più | stessi posti: aggiungilo con il valore di default che vedi nell'interfaccia di ComfyUI |
| «x» vuole IMAGE ma riceve … / usa l'uscita N | uscite del nodo in un ordine diverso | i numeri `[nodo, uscita]` in `continueGraph` (es. `GetVideoComponents`: 0 immagini, 1 audio, 2 fps) |
| valore non tra quelli ammessi | combo diversa (es. `direction` di `AudioConcat`) | il valore in `continueGraph` |
| sotto il minimo / sopra il massimo | es. `start_index` negativo non ammesso in `TrimAudioDuration` | in `continueGraph`: calcola l'inizio della coda dalla durata (fotogrammi del video / 24) invece di usare un numero negativo |

Dopo ogni correzione: `node tools/verifica-video.js` e `npm test` (`test/videochain.test.js` e `test/video.test.js` fissano la struttura dei grafi: se cambi un nome, aggiorna anche il test). Per confronto puoi creare il grafo a mano nell'interfaccia di ComfyUI e salvarlo con «Export (API)»: i nomi lì sono quelli giusti.

## 3. Prova tecnica: continuare un video (senza ChatBz né Gemma)
Chiudi ChatBz (o lascialo fermo, senza generare) e libera la VRAM di Ollama (`ollama stop <modello>`). Prendi un video MiniMax già fatto, per esempio l'ultimo in `data\media\<id personaggio>\`:
```powershell
node tools/verifica-video.js --genera data\media\<cartella>\<video>.mp4 --secondi 3
node tools/verifica-video.js --genera data\media\<cartella>\<video>.mp4 --secondi 3 --senza-guida
```
Il risultato va in `data\prova-video\`. Mostra i due video ad Andrea e controlla:
- [ ] **Durata**: video di partenza + 3 s. Se è più corto o più lungo, la parte da incollare è tagliata male (`ImageFromBatch` «Parte nuova» in `continueGraph`).
- [ ] **Giunzione**: niente salto, niente fotogrammi ripetuti (un attimo che «torna indietro»), stessi vestiti, luce e persona.
- [ ] **Audio**: continuo, senza buchi né raddoppi, e a tempo con le immagini fino alla fine. Se l'audio va fuori tempo, controlla `TrimAudioDuration` della parte nuova.
- [ ] **Guida contro ultimo fotogramma**: con la guida il movimento dovrebbe proseguire in modo più fluido. Se non c'è differenza o va peggio, dillo ad Andrea: si può usare l'ultimo fotogramma per tutti.
- [ ] **Tempo** di generazione e **RAM** (Gestione attività): l'intero video precedente viene caricato in memoria.

Se ComfyUI dà un errore durante l'esecuzione (non nella verifica), copia il messaggio. Errori probabili:
- `a N frame guide clip at frame_idx 0 does not fit`: il pezzo è più corto della clip guida. Succede solo con meno di 1 s; alza il minimo di `--secondi`.
- Errore di `LoadVideo` sul file: il video non è stato caricato nella cartella `input` di ComfyUI. Controlla `uploadImage` in `src/comfy.js`: deve caricare anche gli `.mp4`.
- Memoria esaurita (VRAM) alla decodifica: il grafo decodifica tutto il pezzo nuovo insieme. Prova con meno secondi e annotalo.

## 4. Prove nell'app
Avvia ChatBz. Prima le LoRA (`piano/video.md`, punti 1-7), poi le funzioni nuove:
- [ ] **Studio**, motore MiniMax image to video da una foto, **Durata 20 s**: escono due video, «parte 1/2 · 10 s» e «parte 2/2 · 20 s». Il secondo è il video intero: guarda la giunzione come al punto 3.
- [ ] **Studio, Durata 30 s**: tre pezzi, l'ultimo dura 30 s. Annota il tempo totale.
- [ ] **Continua** sotto un video di 5 s, con «adesso si gira e se ne va» e 5 s: esce un video di 10 s. Rifallo sul risultato per arrivare a 15 s.
- [ ] **Chat**: «mandami un video di 20 secondi». Nel messaggio compaiono due video: il primo «parte 1/2», il secondo «parte 2/2 · 20 s», che parte solo quando il primo è finito.
- [ ] **Prompt dei pezzi**: apri il prompt della parte 2 (pulsante «Prompt» sotto il video). Deve descrivere solo cosa succede *dopo*, senza ripartire dall'inizio della scena. Se Gemma ricomincia da capo o parla di una foto, correggi `partLine` in `src/videochain.js`.
- [ ] **Esplicito**: un video lungo esplicito. Le LoRA (riga grigia) devono essere le stesse in tutti i pezzi.
- [ ] **Errore a metà**: se un pezzo fallisce, i successivi devono dire «La parte precedente del video non è riuscita», senza bloccare la coda.
- [ ] **Telefono**: pulsante «Continua» e menu «Durata» si usano bene da smartphone.
- [ ] **Chat a due**: il pulsante «Continua» non deve esserci (lì i video non ci sono).

## 5. Valori da tarare (in `src/videochain.js`)

| Valore | Ora | Effetto |
|---|---|---|
| `OVERLAP` | 22 | fotogrammi della coda che guidano il pezzo nuovo. Valori validi 5, 22, 39. Più alto = giunzione più morbida ma meno libertà di movimento e più fotogrammi da generare |
| `PART` | 10 | secondi di ogni pezzo nei video lunghi |
| `SINGLE` | 15 | fino a quanti secondi il video resta un pezzo solo. Se a 15 s la qualità cala, abbassalo a 10 |
| `MAX` | 30 | durata massima di un video lungo |

## 6. Risultati
Annota qui esiti e valori scelti, un commit per ogni correzione, `npm test` verde. Niente push né PR senza che Andrea lo chieda.

| Prova | Esito | Note / valori |
|---|---|---|
| 2. verifica dei grafi | | |
| 3. prova tecnica con guida | | |
| 3. prova tecnica senza guida | | |
| 4. Studio 20 s / 30 s | | |
| 4. Continua | | |
| 4. chat 20 s | | |
| LoRA (`piano/video.md`) | | |
