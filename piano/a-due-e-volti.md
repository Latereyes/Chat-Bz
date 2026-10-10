# Chat a due, foto a due e ritocco del volto: cosa è cambiato e cosa provare

Per Claude sul PC di Andrea. Branch `claude/admiring-goldberg-rgvept`, 8 commit sopra `main`, ancora **non unito**. Da `git log origin/main..HEAD` vedi i commit.

`main` (PR Latereyes/Chat-Bz#14) è la versione buona per i personaggi singoli. Questo branch aggiunge le funzioni «a due» e il ritocco dei volti. Lo scopo delle prove è verificare le funzioni nuove e **non peggiorare le foto singole**.

Rispondi ad Andrea in italiano semplice, mostra le foto e chiedi conferma prima di cambiare valori o fare commit. Le regole generali sono in `CLAUDE.md`.

## 1. Cosa è cambiato rispetto a `main`

### Chat a due (`src/group.js`, nuovo)
- La conversazione ha id `g-…` e coinvolge te e due personaggi. È salvata nelle tabelle `groups` e `group_messages` (`src/db.js`, `src/store.js`) e passa dalle stesse rotte `/api/characters/:id` della chat singola.
- Il turno è lo stesso di `chat.js`. Se `conv.group` è vero, `groupTurn(conv)` fornisce prompt di sistema, blocco `<now>`, strumenti, `mediaFromCall` ed `engineer`.
- **La situazione** (`conv.state.premise`) dice perché i tre sono insieme. La scrive Andrea quando crea la chat (campo «La situazione»), altrimenti al primo messaggio la inventa Gemma con `ensurePremise`.
- **Il piano di turno** (`turnPlan`) decide chi parla e in che ordine:
  - chi viene nominato parla per primo;
  - l'altro reagisce a lui (non risponde all'utente in parallelo), oppure circa una volta su quattro tace;
  - circa una volta su cinque c'è un botta e risposta.
- `send_photo` ha il campo `who`, che vale uno dei due nomi oppure `both`. Nelle chat a due per ora non ci sono video, foto profilo e memorie.
- Interfaccia: «Nuova chat a due» nella barra laterale e tra i Personaggi. Il nome in alto apre rinomina, situazione, ricomincia ed elimina. L'avatar mostra le due foto.

### Foto con due personaggi (`src/photo.js`)
- `duoLevel` usa come filtro il più basso dei due tetti; `duoPhotoRequest` chiede la persona 1 a SINISTRA e la 2 a DESTRA. I nomi servono a Gemma per assegnare vestiti e azioni alla persona giusta, ma non vanno scritti nel prompt.
- Se almeno uno ha una LoRA (Krea 2, testo → immagine), `duoLoras` costruisce `media.duoFaces`. La scena si genera **senza** le LoRA dei volti, poi `applyDuoFaces` aggiunge un ritocco per persona con la sua LoRA, in ordine da sinistra:
  1. **tutta la persona**, se c'è `ultralytics/segm/person_yolov8m-seg.pt`, così il fisico viene dalla LoRA (`DUO_BODY`);
  2. **il volto** (`face_yolov8m`), per la somiglianza (`DUO_FACES`).
- I nodi usati sono dell'Impact Pack: `UltralyticsDetectorProvider`, `BboxDetectorSEGS`, `SegmDetectorSEGS`, `ImpactSEGSOrderedFilter`, `DetailerForEach`.
- Se ComfyUI rifiuta il grafo con il ritocco, `renderMedia` in `src/jobs.js` rifà la foto senza ritocco, con le LoRA insieme a 0.8, e scrive nel log «ritocco dei volti non riuscito».
- Se nessuno dei due ha una LoRA ma tutti e due hanno la foto profilo e la foto non è esplicita, si usa `qwen-duo-real` come prima.
- Vale in tre posti: chat a due, **Studio** (menu «Con» dopo «Chi») e **social** (post «foto insieme»; le foto dell'amico da solo usano la sua LoRA).

### Ritocco del volto anche nelle foto SINGOLE (attenzione: cambia `main`)
- `applySingleFace` interviene su ogni foto Krea 2 di un personaggio con LoRA, in chat, social e Studio. Ritocca il volto più grande con la stessa LoRA già presente nella catena, senza aggiungerla una seconda volta.
- Al ritocco vengono passate di nuovo le frasi del prompt che descrivono l'espressione (`expressionOf`), più l'istruzione «stessa espressione».
- Denoise per filtro (`SINGLE_FACE` in `src/krea2.js`): 0.35 in Normale e Sensuale, **0.2 in Esplicito**, scelto da Andrea.
- **È l'unico cambiamento alle foto singole.** Se peggiora le foto rispetto a `main`, si spegne con `SINGLE_FACE.on = false`.

### Social: post osé
- Nella scheda c'è «Post osé sul social»: Mai, Ogni tanto (default) o Spesso. `hotLevel` in `src/social.js` decide il filtro del post: sensuale, oppure esplicito solo se l'intimità è «Aperta». Le foto con un amico restano al massimo sensuali.
- `SOCIAL_LEVEL` ora è il tetto per tutti e di default vale `explicit`.

### Strumenti
- `tools/prova-volti.js` rifà foto già fatte (stesso prompt e seed) con varianti del ritocco: `--personaggio "Nome" --ultime 3` o `--media id`, `--elenco` per le varianti.
- `tools/prepara-pc.ps1` allinea il branch, installa le dipendenze, lancia i test e controlla LoRA, Impact Pack/Subpack, `face_yolov8m` e `person_yolov8m-seg`. Se manca, scarica quest'ultimo.
- I test sono in `npm test`: `test/photo.test.js` e `test/social.test.js`, 37 test.

## 2. Valori da tarare (tutti in `src/krea2.js`)

| Valore | Ora | Effetto |
|---|---|---|
| `SINGLE_FACE.denoise` | 0.35 / 0.35 / 0.2 (N/S/E) | più alto = più somigliante alla LoRA, meno espressione |
| `SINGLE_FACE.on` | true | false = foto singole identiche a `main` |
| `DUO_FACES.denoise` / `explicitDenoise` | 0.5 / 0.42 | volto nelle foto a due (qui il volto viene **solo** dal ritocco: non scendere troppo) |
| `DUO_BODY.denoise` / `explicitDenoise` | 0.42 / 0.35 | fisico nelle foto a due; troppo alto = cambiano vestiti e posa |
| `DUO_FACES.cropFactor` | 2.5 | quanto contesto vede il ritocco del volto |
| strength delle LoRA dei personaggi | dalla scheda | nelle foto a due il ritocco usa la forza della scheda |

## 3. Prove da fare (in ordine)

Prima: `powershell -ExecutionPolicy Bypass -File tools\prepara-pc.ps1`, poi niente righe gialle importanti, ComfyUI riavviato se ha scaricato il modello delle persone, e ChatBz avviato.

Per ogni prova guarda la riga grigia sotto la foto (filtro, LoRA, «volto ritoccato» o «persona e volto 1/2») e il log del server.

### A. Foto singole: non devono peggiorare
- [ ] In chat con Hitomi: un selfie normale, una foto a figura intera da lontano, una sensuale e una esplicita.
- [ ] Rifai le stesse foto dallo Studio con lo stesso seed e `SINGLE_FACE.on = false` (riavvia ChatBz dopo la modifica), e mettile accanto a quelle con il ritocco.
- [ ] Controlla tre cose: la somiglianza migliora (soprattutto da lontano); l'espressione resta (sorrisi, bocca, occhi); il viso non sembra «incollato», cioè luce e pelle uguali al resto.
- [ ] Decidi con Andrea: tenere il ritocco, cambiare il denoise o spegnerlo.

### B. Foto a due
- [ ] Studio: «Chi» Hitomi, «Con» un secondo personaggio con LoRA, richiesta «Hitomi in vestito blu e [nome] in abito bianco, in un bar». Verifica che i vestiti non siano scambiati, che i volti siano distinti e che ognuno somigli alla sua LoRA.
- [ ] Ripeti in modo che la foto si fermi a metà, così da vedere la scena prima del ritocco. Se i vestiti sono già sbagliati lì, il problema è nel prompt (`duoPhotoRequest`); se sono giusti e il ritocco li cambia, abbassa `DUO_BODY.denoise`.
- [ ] Foto sensuale ed esplicita a due: il tetto deve essere quello più basso dei due. In esplicito controlla che le pose reggano dopo il ritocco della persona.
- [ ] Controlla il fisico: Hitomi deve avere il fisico della sua LoRA. Se `person_yolov8m-seg` manca, il log lo dice e il fisico viene solo dalle parole della scheda.
- [ ] Caso noto: in un POV può comparire una terza figura (il corpo di chi guarda) e far sbagliare l'ordine da sinistra. Annota se succede.
- [ ] Se nel log compare «ritocco dei volti non riuscito», copia l'errore: probabilmente l'Impact Pack sul PC ha nomi o input diversi per `DetailerForEach`, `SegmDetectorSEGS` o `ImpactSEGSOrderedFilter`. Confronta con un workflow che funziona sul PC (`workflows/qwen-duo-real/workflow.json`) e correggi `applyDuoFaces` in `src/photo.js`.

### C. Chat a due
- [ ] Crea una chat a due con una situazione scritta da Andrea, e un'altra lasciando la situazione vuota. Nella seconda, la situazione inventata deve comparire nel pannello della chat.
- [ ] Una decina di messaggi: le due devono rispondersi a vicenda, una deve a volte tacere, e chi viene nominato deve parlare per primo. Non devono dare due risposte parallele alla stessa domanda.
- [ ] Le voci devono restare diverse e ognuna deve rispettare il proprio tetto di intimità.
- [ ] Chiedi una foto di una sola delle due e una di tutte e due. «Foto» e video: il video non deve esserci.
- [ ] Prova da telefono: creazione, chat, pannello, foto.

### D. Social
- [ ] Profilo di un personaggio, «Foto con…» un altro con LoRA: le foto insieme devono avere i volti separati.
- [ ] Post osé: con «Spesso» in scheda e un'idea «un post sexy», il post deve essere sensuale o esplicito secondo l'intimità del personaggio.

## 4. Quando è tutto a posto
- Annota qui sotto i valori scelti e i problemi trovati, fai un commit per ogni correzione e lascia `npm test` verde.
- Quando Andrea è d'accordo, si unisce in `main` (PR da aprire solo su sua richiesta).

| Prova | Esito | Valori / note |
|---|---|---|
| A. foto singole | corretto (2026-10-10) | Volti rotti di Elena Valli e Chiara: il ritocco su un volto già grande lavora sulla foto intera senza ingrandire e Krea 2 Turbo lascia la pelle a tasselli (peggio con denoise più basso; non dipende da LoRA, sampler o maschera). Ora i volti alti più di `SINGLE_FACE.maxFace` = 350 px non si ritoccano. Il ritocco usa una catena pulita (`FACE_CHAIN`: niente LoRA del corpo, MysticXXX, HMNSFW, Unlocked). Denoise invariati. |
| B. foto a due | corretto (2026-10-10) | Niente tasselli, volti distinti, vestiti non scambiati. Il ritocco spegneva le risate e rompeva i baci: ora riceve le frasi dell'espressione e, se si toccano (`contactOf`), salta il ritocco della persona e usa `DUO_FACES.contactDenoise` = 0.38. Denoise più alti peggiorano le espressioni: restano 0.5/0.42. Da migliorare: somiglianza di Hitomi nel bacio. |
| C. chat a due | | |
| D. social | | |
