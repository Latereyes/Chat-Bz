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
| `AGENT_URL` | `http://127.0.0.1:7070` | agent del PC (remote-app-controller) che fa da arbitro della GPU tra ChatBz e LocalAI |
| `GPU_ARBITER` | `1` | `0` = ignora l'agent e usa solo l'arbitro interno |
| `OLLAMA_MODEL` | `gemma4-12b-uncensored:latest` | modello di chat (deve supportare i tool) |
| `OLLAMA_CTX` | `24576` | contesto |
| `PORT` | `3100` | così può girare accanto a LocalAI (3000) |
| `REFLECT_IDLE_MIN` | `3` | minuti di pausa prima che il personaggio "ripensi" alla conversazione |
| `INITIATIVE` | `1` | `0` = i personaggi non scrivono mai per primi |
| `DATA_DIR` | `./data` | database (`chatbz.sqlite`), media, utenti |
| `DRIP_IDLE_SEC` | `90` | secondi senza chattare prima che la coda del social lavori |
| `DRIP_POSTS_DAY` / `DRIP_STORIES_DAY` | `8` / `12` | post e storie automatiche nelle ultime 24 ore (tutti i personaggi) |
| `DRIP_GAP_MIN` | `20` | minuti minimi tra due contenuti automatici |
| `SOCIAL_POST_HOURS` / `SOCIAL_STORY_HOURS` | `12` / `5` | ogni quanto, in media, lo stesso personaggio pubblica un post / una storia |
| `DRIP_NIGHT` | `1-7` | ore in cui i personaggi dormono (niente contenuti nuovi); vuoto = sempre svegli |
| `DRIP_MEET_DAYS` | `3` | foto insieme tra due amici: al massimo una ogni N giorni |
| `LIFE_CATCHUP_HOURS` | `2` | server spento più di così: alla riaccensione raccontano cosa hanno fatto |
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
- Le foto passano da un solo modulo, `src/photo.js` (chat e social; lo Studio prende LoRA e Lenovo), in quattro passi:
  1. **Filtro**: Normale (vestita come richiede la situazione), Sensuale (intimo, costume, nudo coperto, pose provocanti; niente genitali né atti sessuali) o Esplicito. Sensuale con la scena "flirt" o parole come intimo, lingerie, bikini, sexy; Esplicito con la scena "intimate" o parole esplicite. Mai oltre il tetto del personaggio: con l'intimità chiusa resta Normale. Il filtro e il perché si vedono sotto la foto, con le LoRA usate.
  2. **Richiesta al prompt engineer**: un solo blocco di regole per filtro. In Normale guida la descrizione del personaggio; in Esplicito guidano le tue indicazioni (posizione, POV, inquadratura) e Gemma vede gli **ultimi 3 scambi**, così una posizione detta due messaggi prima non si perde. Temperatura 0.7 / 0.6 / 0.4.
  3. **Prompt**: in Esplicito su Krea 2, se nella conversazione c'è una posizione (cowgirl, missionario, pecorina, handjob, anche anal) o un finale, il server mette in testa i token di HMNSFW (`HMNSFW cowgirl, ANGLE_POV_ABOVE, ...`). Con la LoRA del personaggio, la sua parola chiave.
  4. **Grafo**: Lenovo (lo sceglie Gemma, di default sì), LoRA del corpo (in Esplicito scalate), LoRA di supporto di Krea 2 e LoRA del personaggio.
- **Krea 2 è il motore su cui si lavora**: le LoRA di supporto (realismo, anti-rifiuto, Unlocked, MysticXXX, HMNSFW, Detailer) e le forze per filtro sono in `src/krea2.js`, un'ipotesi da tarare con il banco di prova. Quelle non installate si saltano. **Z-Image per ora resta grezzo**: niente Lenovo, niente LoRA, solo il prompt.
- **LoRA del personaggio** (scheda, sotto l'aspetto): file, parola chiave e forza. Con Krea 2 il volto resta lo stesso in ogni foto (chat, social, Studio). Il primo è Hitomi: `node tools/importa-personaggio.js tools/personaggi/hitomi.json`.
- **Fisico nelle foto**: le LoRA del corpo (loraholic) si usano solo con Krea 2; su ogni motore le proporzioni vanno anche nel prompt a parole.
- Video (`send_video`, pulsante **Video**) solo su richiesta: anima l'ultima foto del personaggio con MiniMax H3 (image to video, come in ChatBz 1). Se negli ultimi messaggi non c'è una sua foto, prima ne genera una della scena e poi anima quella, così il video le somiglia sempre.
- Il testo arriva subito, la foto dopo, con l'anteprima live. La prima foto diventa l'immagine del profilo; puoi cambiarla dal pulsante **Profilo** sotto ogni foto.
- Le foto che mandi tu vengono descritte da Qwen3-VL (workflow `qwen3vl-vision`), così Gemma sa cosa c'è.

### Modello di chat
Il pulsante con il chip in alto sceglie il modello di Ollama per i messaggi successivi (chat, studio, risposte alle storie). La riflessione a riposo e il social restano su `OLLAMA_MODEL`. Ci sono anche i modelli senza tool, per provarli, ad esempio il Qwen installato per LocalAI: con loro la chat non passa i tool, e foto e scena le ricava il server dal testo (`[PHOTO: ...]` e controllo della scena). Come in LocalAI, il `num_ctx` del Modelfile vale al posto di `OLLAMA_CTX` (Qwen Coder: 16k), e i nomi del menu sono in `config.ollama.labels`. Ogni cambio tra Gemma e Qwen scarica un modello per caricare l'altro.

### Studio immagini
L'"Image Assistant" di ChatBz 1, non più come personaggio ma come sezione a parte (**Studio immagini** nella barra laterale), con una sua cronologia per utente.
- Descrivi cosa vuoi vedere, anche in due parole: Gemma scrive il prompt con la guida del motore scelto, poi ComfyUI genera. Contenuto esplicito permesso quando la richiesta lo chiede.
- Opzioni sopra il campo di testo: **motore** (i workflow testo → immagine e 🎬 testo → video disponibili, oppure automatico), **formato**, **chi** (uno dei tuoi personaggi: il suo aspetto va nel prompt e le sue LoRA del corpo nella foto), **prompt diretto** (il testo va al modello così com'è, senza Gemma), **anche video** (dopo la foto, MiniMax H3 la anima), **seed** fisso, **filtro** (automatico dalla richiesta, oppure Normale / Sensuale / Esplicito: decide le LoRA di Krea 2 e il contenuto del prompt) e **LoRA Krea** (il profilo o una variante del banco di prova, per confrontarle una foto alla volta con lo stesso seed).
- Allegando una foto la si modifica con Qwen-Image-Edit, oppure la si anima se il motore scelto è un video. Sotto ogni immagine: **Anima** (video che parte da quella foto), **Rigenera**, **Prompt** (modifica e rigenera).
- Le immagini dello studio finiscono anche in Galleria; il cestino in alto svuota lo studio.

### Banco di prova delle foto
`node tools/prova-foto.js` prova le foto senza chattare, con 14 scenari (gli 8 del piano, le posizioni principali di Krea 2 in esplicito, il finale e Hitomi): `--elenco` li mostra.
- `--solo-richieste` (senza modelli): filtro, motivo, richiesta a Gemma e LoRA per ogni scenario.
- `--prompt` (Ollama): anche il prompt scritto da Gemma.
- `--foto` (Ollama e ComfyUI): genera davvero e scrive `data/prove-foto/<data>/index.html`, una riga per scenario.
- `--varianti base,realism-v2,senza-mystic` (o `tutte`): una colonna per variante delle LoRA di Krea 2 (`src/krea2.js`), stesso prompt e stesso seed. `--scenari 5,9` per provarne solo alcuni, `--seed` per fissarlo, `--zimage` per tre scenari anche su Z-Image.

I test automatici (`npm test`) controllano filtri, token di HMNSFW e grafi (Lenovo, nessuna LoRA su Z-Image, anti-rifiuto solo in esplicito, LoRA mancanti saltate).

### Importare un personaggio
`node tools/importa-personaggio.js tools/personaggi/giorgia.json` aggiunge un personaggio da un file JSON (scheda, avatar, scena iniziale), anche con il server acceso. `giorgia.json` è Giorgia di ChatBz 1 riscritta per la scheda nuova (non copiata: carattere, vita, modo di parlare, aspetto e inizio sono rifatti).

### Social
Il social è la **Home** dell'app: feed, storie e, sugli schermi larghi, i tuoi personaggi di lato con cosa stanno facendo. Sul telefono le sezioni principali sono nella barra in basso.

Ogni personaggio ha un profilo (nome utente, bio e il suo "mondo" ricorrente: casa, persone, posti, oggetti, scritti da Gemma al primo post) e pubblica **caroselli** e **storie** (24 ore). Tutto viene dai tuoi personaggi e da te, niente follower o commenti inventati:
- **Caroselli curati**: Gemma pensa il post come farebbe il personaggio (un momento della sua giornata, la sua voce, cosa ha in mente) e scrive da 1 a 4 foto dello stesso momento. Nelle foto in cui compare, con lo stile Krea, si parte dalla **foto profilo** con "stessa persona, nuova scena" (`qwen-scene-real`), così nei caroselli è sempre lei. Le foto di dettagli e posti, e le storie, usano il motore del suo stile.
- **Mi piace e commenti tra personaggi**: dopo la pubblicazione gli altri personaggi lo vedono nel corso del tempo; qualcuno mette mi piace, qualcuno commenta, l'autore risponde e a volte l'altro ribatte. La prima volta che due personaggi interagiscono Gemma decide come si conoscono (vicine di casa, palestra…), e da lì resta quello: lo vedi nel profilo.
- **Commenti come conversazioni di gruppo**: come su Instagram, ogni commento apre una conversazione e chiunque risponde a chiunque, con la @menzione. Rispondi tu a un commento di Marta sotto il post di Giorgia: risponde Marta, e a volte si aggiunge Giorgia o un amico. Ogni personaggio legge tutta la conversazione prima di scrivere. Nel feed si vedono gli ultimi commenti, il post aperto li mostra tutti (su schermo largo con la foto a sinistra). Rispondere a una **storia** è un messaggio in chat, come nella realtà.
- **Foto insieme**: ogni tanto (al massimo una ogni `DRIP_MEET_DAYS` giorni, di preferenza tra chi si conosce già) due amici si vedono e uno dei due pubblica un carosello di quell'incontro, taggando l'altro. Le foto in cui sono insieme partono dalle **due foto profilo** (`qwen-duo-real`), quelle dell'amico da sola dalla sua. Puoi chiederne una tu dal profilo con **Foto con…**. Le foto in cui un personaggio è taggato compaiono nel suo profilo.
- **Vivono anche a server spento**: il server segna ogni minuto che è acceso; se resta spento più di `LIFE_CATCHUP_HOURS` ore, alla riaccensione Gemma si chiede quanto tempo è passato e cosa ha fatto ognuno nel frattempo (lavoro, uscite, a volte con un amico dell'app). Il racconto arriva come notifica, il personaggio lo sa in chat e il suo prossimo post parte da lì.
- **Notifiche**: la campanella in alto raccoglie i nuovi post, le foto insieme, le risposte ai tuoi commenti, chi scrive in una conversazione dove hai scritto tu e cosa hanno fatto mentre non c'eri. Aprendo un post le sue notifiche diventano lette. Con **Attiva avvisi** arrivano anche come notifiche del browser quando la pagina è in background (solo su `localhost` o HTTPS: è una regola dei browser).
- **Sempre aggiornato**: commenti, mi piace e foto arrivano in diretta; se la connessione cade o torni sulla pagina dopo un po' (il telefono congela le pagine in background), la vista aperta si riallinea da sola, foto generate in chat comprese.
- **Corporatura nelle foto**: anche con il feed presentabile le proporzioni del corpo (seno, fianchi, corporatura) restano nel prompt, dette a parole e con vestiti normali, così nei post è la stessa persona della scheda.
- **In chat lo sa**: il personaggio sa cosa ha pubblicato, chi ha messo mi piace e cosa gli hai scritto sotto, e può parlarne se viene naturale.
- Dal profilo puoi chiedere un **nuovo post**, una **nuova storia** o una **foto con** un altro personaggio (con un'idea facoltativa) e spegnere la pubblicazione automatica per quel personaggio.
- Il feed resta presentabile (`SOCIAL_LEVEL=neutral`; con `sensual` al massimo sensuale, mai esplicito).

### Coda a goccia
I contenuti del social non partono tutti insieme: ogni lavoro (pensare il post, ogni foto, ogni commento) è una riga nel database (`src/queue.js`) e si fa **un pezzo alla volta**, solo quando la GPU è libera e non stai chattando da `DRIP_IDLE_SEC` secondi. Se spegni il server, alla riaccensione si riprende da dove si era rimasti. Tra i lavori pronti si preferisce quello che usa il modello già in VRAM (prima i testi, poi le foto). Il ritmo è continuo, non una raffica all'accensione: ogni personaggio pubblica in media un post ogni `SOCIAL_POST_HOURS` ore e una storia ogni `SOCIAL_STORY_HOURS` (ognuno con il suo ritmo, un po' variabile), tra due contenuti automatici passano almeno `DRIP_GAP_MIN` minuti, e nelle ultime 24 ore al massimo `DRIP_POSTS_DAY` post e `DRIP_STORIES_DAY` storie. Di notte (`DRIP_NIGHT`) dormono. Quelli che chiedi tu non contano. Il pulsante **Coda** nel Social mostra cosa c'è in lista e mette in pausa.

## Struttura

```
server.js            API REST + eventi SSE
src/
  config.js          configurazione (URL di Ollama e ComfyUI, porte, tempi)
  db.js              SQLite (node:sqlite): personaggi, stato, messaggi, memorie
  store.js           personaggio + conversazione in memoria, salvataggio incrementale
  characters.js      scheda del personaggio, bozza da un'idea
  relationship.js    stato: scena, rapporto, intimità
  photo.js           foto dei personaggi: filtro, richiesta al prompt engineer, token HMNSFW, LoRA nel grafo
  krea2.js           LoRA di supporto di Krea 2: catalogo, profilo per filtro, varianti da provare
  body.js            LoRA del corpo e Lenovo
  prompts.js         prompt stabile + blocco <now>, tool, prompt engineer, riflessione
  chat.js            turno di chat: contesto → Gemma → scena/foto/video → coda
  memory.js          ricordi e riflessione a riposo
  life.js            pianificatore: riflessione quando la GPU è libera, iniziativa
  queue.js           coda persistente a goccia (social)
  social.js          profili, caroselli, storie, mi piace, commenti, legami, foto insieme, vita a server spento
  notify.js          notifiche in-app (campanella)
  social-prompts.js  prompt del social
  studio.js          Studio immagini (l'assistente immagini di ChatBz 1)
  gpu.js comfy.js ollama.js jobs.js workflows.js auth.js   (da LocalAI)
public/              interfaccia (HTML/CSS/JS, senza build)
workflows/           workflow ComfyUI (API) + manifest + guide
tools/               banco di prova delle foto, import dei personaggi, script di supporto per ComfyUI
test/                test automatici (npm test)
```

## Prossime fasi

Il piano completo è in `piano/piano-chatbz2.md` nella cartella del progetto. Per le foto: `piano/piano-immagini.md` e la lista dei prossimi passi sul PC in `piano/prossimi-passi.md`. Resta la creazione guidata con scelta del volto (ritratto di riferimento), rimandata per ora.
