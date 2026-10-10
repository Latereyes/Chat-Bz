# Video MiniMax H3: LoRA nuove, cosa provare

Per Claude sul PC di Andrea. **Prima** fai i controlli di `piano/verifica-video.md` (ComfyUI aggiornato, grafi accettati, prova tecnica). Stesso branch delle prove a due (`claude/admiring-goldberg-rgvept`). Rispondi ad Andrea in italiano semplice e chiedi prima di cambiare valori o fare commit (regole in `CLAUDE.md`).

## Cosa è cambiato
- **`src/minimax.js`** (nuovo) contiene catalogo, profilo per filtro e varianti delle LoRA dei video, come `src/krea2.js` per le foto. La applica `renderMedia` (`src/jobs.js`) a ogni video MiniMax H3 (`applyVideoStack`).
- Le LoRA del workflow restano: turbo 8 passi, VBVR Pro, Unlocked V2, MysticXXX V4. Il profilo può cambiarne la forza.
- LoRA nuove: si attivano **solo quando servono**, secondo `videoNeeds`, che legge richiesta, risposta, descrizione della foto di partenza e prompt finale.

| LoRA | File | Quando | Forza (ipotesi) |
|---|---|---|---|
| Seno (realism slider) | `PlagueKind-tiddies-realismslider.safetensors` | c'è una donna; Sensuale ed Esplicito | 1.0 / 1.3 (autore: 1.0-2.0 sul realistico, oltre 2.0 si rompe) |
| Vagina | `Vagina_minimax-h3_epoch20.safetensors` | Esplicito, donna, vulva in vista | 1.0 |
| hmpussy | `hmpussy_v6_epoch30.safetensors` | insieme a Vagina (addestrata su video: tiene la forma nel movimento) | 0.35 (variante «Vagina senza hmpussy» per confrontare) |
| Penis V2 | `PenisV2_minimax-h3_epoch60.safetensors` | Esplicito con un uomo / pene | 1.0; il server mette `HMPenis, front/back/side view.` in testa a `integrated_multimodal_description` |
| Bacio | `cxy_kiss_lora_h3_v01_step1500.safetensors` | c'è un bacio (sperimentale, V0.1) | 0.8 |
| HMNSFW AIO 2.5 | `HMNSFW-AIO-V2.5.safetensors` | Esplicito | 0.8, con **turbo 0.5 e 12 passi** (autore: euler, simple, 12 passi, shift 6, turbo 0.5) |

- **Filtro dei video**: in chat è quello del momento, o quello della foto di partenza se è più alto (entro il tetto del personaggio). Nello Studio viene dalla richiesta o dal menu «Filtro».
- **Regole per Gemma** in esplicito (`videoRules`): movimento e anatomia detti in modo diretto; il pene descritto per misura, circoncisione e colore del glande, come consiglia l'autore della LoRA.
- **Studio**: menu **«LoRA video»** con le varianti. Sotto il video compaiono filtro, motivo, LoRA usate e passi.
- I test sono in `test/video.test.js`.

## Prove (con lo stesso seed, dallo Studio)
1. [ ] `tools\prepara-pc.ps1`: controlla che ci siano le LoRA video.
2. [ ] **Normale**: anima una foto vestita (motore MiniMax image to video, oppure «Anima»). Il video deve uscire come prima: la riga sotto non deve elencare LoRA nuove.
3. [ ] **Sensuale**: una foto in intimo, poi «Anima» con un movimento. Confronta «LoRA video: profilo» con «Seno 1.8» e con «Solo le LoRA di prima».
4. [ ] **Esplicito**, una prova per posizione (cowgirl POV, missionario, pecorina da dietro, handjob). Confronta:
   - profilo (HMNSFW 0.8, turbo 0.5, 12 passi) e «Senza HMNSFW (turbo 1, 8 passi)»: qualità e tempo;
   - «HMNSFW con shift 6»: lo shift è un nodo `MiniMaxH3SigmaShift` aggiunto in fondo alla catena. Se ComfyUI lo rifiuta o il video si rovina, **non usarlo**;
   - «Solo le LoRA di prima»: il riferimento, cioè com'era fino a ieri.
5. [ ] **Pene**: controlla la direzione (`front` in POV, `back` da dietro, `side` di lato) nella riga del prompt. Se la LoRA rende peggio a pene piccolo, l'autore dice che va meglio con misure medio-grandi.
6. [ ] **Bacio**: due persone che si baciano, con e senza la LoRA (variante «Solo le LoRA di prima»). È sperimentale: se peggiora, toglila dal profilo.
7. [ ] Tempi: annota quanto dura un video di 5 s con 8 e con 12 passi.

## Video lunghi e «Continua» (`src/videochain.js`)
- Fino a 15 s: un pezzo solo (`manifest` dei workflow MiniMax: massimo 15). Oltre, fino a 30 s: pezzi da 10 s. Ogni pezzo (`mode: 'continue'`) carica il video precedente su ComfyUI (`LoadVideo` → `GetVideoComponents`), usa gli ultimi 22 fotogrammi e il loro audio come guida (`MiniMaxH3AddGuide`, frame 0), genera, toglie i fotogrammi ripetuti e incolla in coda immagini (`ImageBatch`) e audio (`AudioConcat`). Il risultato è il video intero fin lì.
- Senza `MiniMaxH3AddGuide` (ComfyUI più vecchio) parte solo dall'ultimo fotogramma (`first_frame`). Se mancano gli altri nodi, la foto non si rompe: il pezzo dà l'errore «serve un ComfyUI più recente» con i nomi dei nodi.
- In chat la durata viene da `send_video` (fino a 30) o dal messaggio («20 secondi», «mezzo minuto»). Nello Studio c'è il menu **Durata**. Il pulsante **Continua** sotto un video chiede cosa succede dopo e quanti secondi aggiungere (2-10).
- Le nuove LoRA di `minimax.js` valgono anche per i pezzi. Lo shift ora usa il nodo giusto, `MiniMaxH3SigmaShift` (ModelSamplingMiniMaxH3).

Prove:
8. [ ] Studio, MiniMax image to video da una foto, **Durata 20 s**: escono «parte 1/2 · 10 s» e «parte 2/2 · 20 s». Nel secondo non deve vedersi lo stacco (movimento, luce, vestiti, audio), e non devono esserci fotogrammi ripetuti o salti.
9. [ ] **Continua** su un video di 5 s con 5 s in più: il video completo dura 10 s. Ripeti una seconda volta per arrivare a 15 s.
10. [ ] In chat: «mandami un video di 20 secondi». Se lo stacco si vede, prova a cambiare `OVERLAP` in `src/videochain.js` (valori validi: 5, 22, 39).
11. [ ] Annota tempi e uso di RAM a 30 s: il video intero viene caricato in memoria su ComfyUI per incollare i pezzi.
12. [ ] Il prompt dei pezzi successivi segue la guida image to video, che parla di `<Picture 1>`: con la clip guida non c'è un'immagine vera e propria. Se Gemma scrive male l'inizio, correggi `partLine` in `src/videochain.js`.

## Dove si tara
Solo in `src/minimax.js`: `PROFILE` (forze per filtro, `turbo`, `steps`, `shift`) e `VARIANTS`. Dopo ogni scelta lancia `npm test`. Se un test fissava la scelta vecchia, aggiornalo e dillo ad Andrea.

| Prova | Esito | Scelta |
|---|---|---|
| Normale | | |
| Sensuale | | |
| Esplicito | | |
| Pene / direzione | | |
| Bacio | | |
