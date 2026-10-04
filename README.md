# ChatBz 2

Personaggi AI locali con cui hai **una sola relazione continua**: vi scrivete quando siete lontani, vi vedete di persona quando succede, e il personaggio passa da un registro all'altro da solo. Le risposte sono di **Gemma** (Ollama), le foto e i video di **ComfyUI**, sulla stessa GPU.

Nasce dall'interfaccia e dal motore di LocalAI (chat veloce, coda GPU, workflow con guide di prompting) e dalle idee di ChatBz 1 (rapporto, intimità, foto in chat).

## Avvio

```bash
npm install
npm start
```

Oppure doppio clic su `start.bat`. L'interfaccia è su `http://localhost:3100` e dal telefono all'indirizzo che il server stampa all'avvio (stessa rete Wi-Fi). Richiede Node.js 22.13 o più recente.

Al primo avvio vengono creati gli utenti `andrea` (amministratore) e `claudia` con password temporanea `1234`, da cambiare al primo accesso. Ogni utente vede solo i propri personaggi.

## Configurazione

Variabili d'ambiente (i default sono in `src/config.js`):

| Variabile | Default | Note |
|---|---|---|
| `OLLAMA_URL` | `http://127.0.0.1:11434` | quando Ollama tornerà sull'altro PC: `http://192.168.1.12:11434` |
| `COMFY_URL` | `http://127.0.0.1:8188` | idem per ComfyUI |
| `OLLAMA_MODEL` | `gemma4-12b-uncensored:latest` | modello di chat (deve supportare i tool) |
| `OLLAMA_CTX` | `24576` | contesto |
| `PORT` | `3100` | così può girare accanto a LocalAI (3000) |
| `REFLECT_IDLE_MIN` | `3` | minuti di pausa prima che il personaggio "ripensi" alla conversazione |
| `INITIATIVE` | `1` | `0` = i personaggi non scrivono mai per primi |
| `DATA_DIR` | `./data` | database (`chatbz.sqlite`), media, utenti |

## Come funziona

### Un ambiente unico
Ogni personaggio ha una sola conversazione. Lo **stato della scena** (a distanza o insieme, dove, cosa sta facendo, cosa indossa, il momento) è in alto nella chat: il personaggio lo aggiorna con il tool `update_scene` quando la situazione cambia davvero ("passo da te?" → se accetta, il messaggio dopo è già di persona). Puoi correggerlo a mano toccando il chip.

- **A distanza**: messaggi brevi, a bolle, niente narrazione.
- **Insieme**: prosa con le *azioni* tra asterischi.
- Il personaggio sa che ora è e quanto tempo è passato dall'ultimo messaggio.

### Prompt veloce
Il prompt è diviso in un **blocco stabile** (regole + scheda, nel messaggio di sistema: Ollama lo tiene in cache) e un **blocco variabile** corto (`<now>`: ora, scena, rapporto, intimità, ricordi, pensieri) messo in testa all'ultimo messaggio. Durante la chat non gira nessun'altra chiamata a Gemma.

### Rapporto, intimità, memoria
- Il rapporto ha cinque dimensioni: fiducia, affetto, attrazione, familiarità, tensione.
- L'intimità dipende da tre cose insieme: il **limite** che scegli tu per il personaggio (mai / con la confidenza / aperta), il suo **temperamento** (quanto in fretta si apre) e il **momento** (rapporto attuale e scena). Nessuno dei due registri è forzato: dopo una scena intima la storia torna alla vita normale.
- **Riflessione a riposo** (`src/memory.js`, `src/life.js`): quando la conversazione è ferma da qualche minuto e la GPU è libera, il personaggio ripensa agli ultimi messaggi e aggiorna rapporto, umore, ricordi, riassunto della storia e le cose che vuole riprendere la prossima volta. Tutto è visibile (e cancellabile) nella scheda, scheda **Rapporto**.
- **Iniziativa**: alla riaccensione del server, un personaggio che ha qualcosa in sospeso e non ti sente da qualche ora può scriverti per primo (al massimo un messaggio).

### Foto e video
- Il personaggio manda foto con il tool `send_photo` (o con il pulsante **Foto**). Motore in base allo stile scelto nella scheda: `krea2-real` per il realismo spontaneo, `zimage-turbo` per un look curato.
- Il prompt finale lo scrive il prompt engineer con la guida del modello (`workflows/<id>/guide.md`), l'aspetto fisso del personaggio e la scena attuale.
- Il **livello di contenuto** della foto (neutro / sensuale / esplicito) segue la scena e non supera mai il limite del personaggio: una foto in cucina resta una foto in cucina.
- Video (`send_video`, pulsante **Video**) solo su richiesta: anima l'ultima foto del personaggio con MiniMax H3.
- Il testo arriva subito, la foto dopo, con l'anteprima live. La prima foto diventa l'immagine del profilo; puoi cambiarla dal pulsante **Profilo** sotto ogni foto.
- Le foto che mandi tu vengono descritte da Qwen3-VL (workflow `qwen3vl-vision`), così Gemma sa cosa c'è.

## Struttura

```
server.js            API REST + eventi SSE
src/
  config.js          configurazione (URL di Ollama e ComfyUI, porte, tempi)
  db.js              SQLite (node:sqlite): personaggi, stato, messaggi, memorie
  store.js           personaggio + conversazione in memoria, salvataggio incrementale
  characters.js      scheda del personaggio, bozza da un'idea
  relationship.js    stato: scena, rapporto, intimità, livello di contenuto
  prompts.js         prompt stabile + blocco <now>, tool, prompt engineer, riflessione
  chat.js            turno di chat: contesto → Gemma → scena/foto/video → coda
  memory.js          ricordi e riflessione a riposo
  life.js            pianificatore: riflessione quando la GPU è libera, iniziativa
  gpu.js comfy.js ollama.js jobs.js workflows.js auth.js   (da LocalAI)
public/              interfaccia (HTML/CSS/JS, senza build)
workflows/           workflow ComfyUI (API) + manifest + guide
tools/               script di supporto per ComfyUI
```

## Prossime fasi

Il piano completo è in `piano/piano-chatbz2.md` nella cartella del progetto. Dopo questa base: creazione guidata con scelta del volto (ritratto di riferimento), contenuti curati per i caroselli, social snello (profilo, caroselli, storie) e coda persistente "a goccia".
