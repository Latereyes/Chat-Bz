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
| `DRIP_IDLE_SEC` | `90` | secondi senza chattare prima che la coda del social lavori |
| `DRIP_MAX_POSTS` / `DRIP_MAX_STORIES` | `3` / `4` | post e storie automatiche per accensione |
| `SOCIAL_POST_HOURS` / `SOCIAL_STORY_HOURS` | `20` / `8` | distanza minima tra due post / storie dello stesso personaggio |
| `SOCIAL_LEVEL` | `neutral` | foto del feed: `neutral` o `sensual` (mai esplicite) |
| `SOCIAL_IDENTITY` | `1` | `0` = i caroselli non partono dalla foto profilo |

## Come funziona

### Un ambiente unico
Ogni personaggio ha una sola conversazione. Lo **stato della scena** (a distanza o insieme, dove, cosa sta facendo, cosa indossa, il momento) è in alto nella chat: il personaggio lo aggiorna con il tool `update_scene` quando la situazione cambia davvero ("passo da te?" → se accetta, il messaggio dopo è già di persona). Puoi correggerlo a mano toccando il chip.

- **A distanza**: messaggi brevi, a bolle, niente narrazione.
- **Insieme**: prosa con le *azioni* tra asterischi.
- Il personaggio sa che ora è e quanto tempo è passato dall'ultimo messaggio.

### Prompt veloce
Il prompt è diviso in un **blocco stabile** (regole + scheda, nel messaggio di sistema: Ollama lo tiene in cache) e un **blocco variabile** corto (`<now>`: ora, scena, rapporto, intimità, ricordi, pensieri) messo in testa all'ultimo messaggio. Durante la chat non gira nessun'altra chiamata a Gemma, salvo un controllo breve della scena quando il messaggio fa pensare a un cambio di situazione (arrivi, esci, suoni il campanello) e Gemma non ha aggiornato la scena da sola.

### Rapporto, intimità, memoria
- Il rapporto ha cinque dimensioni: fiducia, affetto, attrazione, familiarità, tensione.
- L'intimità dipende da tre cose insieme: il **limite** che scegli tu per il personaggio (mai / con la confidenza / aperta), il suo **temperamento** (quanto in fretta si apre) e il **momento** (rapporto attuale e scena). Nessuno dei due registri è forzato: dopo una scena intima la storia torna alla vita normale.
- **Riflessione a riposo** (`src/memory.js`, `src/life.js`): quando la conversazione è ferma da qualche minuto e la GPU è libera, il personaggio ripensa agli ultimi messaggi e aggiorna rapporto, umore, ricordi, riassunto della storia e le cose che vuole riprendere la prossima volta. Tutto è visibile (e cancellabile) nella scheda, scheda **Rapporto**.
- **Iniziativa**: alla riaccensione del server, un personaggio che ha qualcosa in sospeso e non ti sente da qualche ora può scriverti per primo (al massimo un messaggio).

### Foto e video
- Il personaggio manda foto con il tool `send_photo` (o con il pulsante **Foto**). Se Gemma invece scrive la foto nel testo ("*Ti mando una foto:* [descrizione]"), la descrizione viene tolta dal messaggio e la foto parte lo stesso. Motore in base allo stile scelto nella scheda: `krea2-real` per il realismo spontaneo, `zimage-turbo` per un look curato.
- Il prompt finale lo scrive il prompt engineer con la guida del modello (`workflows/<id>/guide.md`), l'aspetto fisso del personaggio e la scena attuale.
- Il **livello di contenuto** della foto (neutro / sensuale / esplicito) segue la scena e non supera mai il limite del personaggio: una foto in cucina resta una foto in cucina.
- Video (`send_video`, pulsante **Video**) solo su richiesta: anima l'ultima foto del personaggio con MiniMax H3 (image to video, come in ChatBz 1). Se negli ultimi messaggi non c'è una sua foto, prima ne genera una della scena e poi anima quella, così il video le somiglia sempre.
- Il testo arriva subito, la foto dopo, con l'anteprima live. La prima foto diventa l'immagine del profilo; puoi cambiarla dal pulsante **Profilo** sotto ogni foto.
- Le foto che mandi tu vengono descritte da Qwen3-VL (workflow `qwen3vl-vision`), così Gemma sa cosa c'è.

### Studio immagini
L'"Image Assistant" di ChatBz 1, non più come personaggio ma come sezione a parte (**Studio immagini** nella barra laterale), con una sua cronologia per utente.
- Descrivi cosa vuoi vedere, anche in due parole: Gemma scrive il prompt con la guida del motore scelto, poi ComfyUI genera. Contenuto esplicito permesso quando la richiesta lo chiede.
- Opzioni sopra il campo di testo: **motore** (i workflow testo → immagine e 🎬 testo → video disponibili, oppure automatico), **formato**, **chi** (uno dei tuoi personaggi: il suo aspetto va nel prompt e le sue LoRA del corpo nella foto), **prompt diretto** (il testo va al modello così com'è, senza Gemma), **anche video** (dopo la foto, MiniMax H3 la anima), **seed** fisso.
- Allegando una foto la si modifica con Qwen-Image-Edit, oppure la si anima se il motore scelto è un video. Sotto ogni immagine: **Anima** (video che parte da quella foto), **Rigenera**, **Prompt** (modifica e rigenera).
- Le immagini dello studio finiscono anche in Galleria; il cestino in alto svuota lo studio.

### Importare un personaggio
`node tools/importa-personaggio.js tools/personaggi/giorgia.json` aggiunge un personaggio da un file JSON (scheda, avatar, scena iniziale), anche con il server acceso. `giorgia.json` è Giorgia di ChatBz 1 riscritta per la scheda nuova (non copiata: carattere, vita, modo di parlare, aspetto e inizio sono rifatti).

### Social
Ogni personaggio ha un profilo (nome utente, bio e il suo "mondo" ricorrente: casa, persone, posti, oggetti, scritti da Gemma al primo post) e pubblica **caroselli** e **storie** (24 ore). Tutto viene dai tuoi personaggi e da te, niente follower o commenti inventati:
- **Caroselli curati**: Gemma pensa il post come farebbe il personaggio (un momento della sua giornata, la sua voce, cosa ha in mente) e scrive da 1 a 4 foto dello stesso momento. Nelle foto in cui compare, con lo stile Krea, si parte dalla **foto profilo** con "stessa persona, nuova scena" (`qwen-scene-real`), così nei caroselli è sempre lei. Le foto di dettagli e posti, e le storie, usano il motore del suo stile.
- **Mi piace e commenti tra personaggi**: dopo la pubblicazione gli altri personaggi lo vedono nel corso del tempo; qualcuno mette mi piace, qualcuno commenta, l'autore risponde e a volte l'altro ribatte. La prima volta che due personaggi interagiscono Gemma decide come si conoscono (vicine di casa, palestra…), e da lì resta quello: lo vedi nel profilo.
- **I tuoi commenti**: risponde l'autore del post (o il personaggio a cui hai risposto), spesso con un mi piace al tuo commento, con il tono del vostro rapporto. Rispondere a una **storia** è un messaggio in chat, come nella realtà.
- **In chat lo sa**: il personaggio sa cosa ha pubblicato, chi ha messo mi piace e cosa gli hai scritto sotto, e può parlarne se viene naturale.
- Dal profilo puoi chiedere un **nuovo post** o una **nuova storia** (con un'idea facoltativa) e spegnere la pubblicazione automatica per quel personaggio.
- Il feed resta presentabile (`SOCIAL_LEVEL=neutral`; con `sensual` al massimo sensuale, mai esplicito).

### Coda a goccia
I contenuti del social non partono tutti insieme: ogni lavoro (pensare il post, ogni foto, ogni commento) è una riga nel database (`src/queue.js`) e si fa **un pezzo alla volta**, solo quando la GPU è libera e non stai chattando da `DRIP_IDLE_SEC` secondi. Se spegni il server, alla riaccensione si riprende da dove si era rimasti. Tra i lavori pronti si preferisce quello che usa il modello già in VRAM (prima i testi, poi le foto). Per ogni accensione al massimo `DRIP_MAX_POSTS` post e `DRIP_MAX_STORIES` storie automatiche, e ogni personaggio pubblica al massimo un post ogni `SOCIAL_POST_HOURS` ore e una storia ogni `SOCIAL_STORY_HOURS`; quelli che chiedi tu non contano. Il pulsante **Coda** nel Social mostra cosa c'è in lista e mette in pausa.

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
  queue.js           coda persistente a goccia (social)
  social.js          profili, caroselli, storie, mi piace, commenti, legami tra personaggi
  social-prompts.js  prompt del social
  studio.js          Studio immagini (l'assistente immagini di ChatBz 1)
  gpu.js comfy.js ollama.js jobs.js workflows.js auth.js   (da LocalAI)
public/              interfaccia (HTML/CSS/JS, senza build)
workflows/           workflow ComfyUI (API) + manifest + guide
tools/               script di supporto per ComfyUI
```

## Prossime fasi

Il piano completo è in `piano/piano-chatbz2.md` nella cartella del progetto. Resta la creazione guidata con scelta del volto (ritratto di riferimento), rimandata per ora.
