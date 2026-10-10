# Video MiniMax H3: LoRA nuove, cosa provare

Per Claude sul PC di Andrea. Stesso branch delle prove a due (`claude/admiring-goldberg-rgvept`). Rispondi ad Andrea in italiano semplice e chiedi prima di cambiare valori o fare commit (regole in `CLAUDE.md`).

## Cosa è cambiato
- **`src/minimax.js`** (nuovo) contiene catalogo, profilo per filtro e varianti delle LoRA dei video, come `src/krea2.js` per le foto. La applica `renderMedia` (`src/jobs.js`) a ogni video MiniMax H3 (`applyVideoStack`).
- Le LoRA del workflow restano: turbo 8 passi, VBVR Pro, Unlocked V2, MysticXXX V4. Il profilo può cambiarne la forza.
- LoRA nuove: si attivano **solo quando servono**, secondo `videoNeeds`, che legge richiesta, risposta, descrizione della foto di partenza e prompt finale.

| LoRA | File | Quando | Forza (ipotesi) |
|---|---|---|---|
| Seno (realism slider) | `PlagueKind-tiddies-realismslider.safetensors` | c'è una donna; Sensuale ed Esplicito | 1.0 / 1.3 (autore: 1.0-2.0 sul realistico, oltre 2.0 si rompe) |
| Vagina | `Vagina_minimax-h3_epoch20.safetensors` | Esplicito, donna, vulva in vista | 1.0 (hmpussy, la sua compagna addestrata su video, sul PC non c'è) |
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
   - «HMNSFW con shift 6»: lo shift è un nodo `ModelSamplingSD3` aggiunto in fondo alla catena. Se ComfyUI lo rifiuta o il video si rovina, **non usarlo**;
   - «Solo le LoRA di prima»: il riferimento, cioè com'era fino a ieri.
5. [ ] **Pene**: controlla la direzione (`front` in POV, `back` da dietro, `side` di lato) nella riga del prompt. Se la LoRA rende peggio a pene piccolo, l'autore dice che va meglio con misure medio-grandi.
6. [ ] **Bacio**: due persone che si baciano, con e senza la LoRA (variante «Solo le LoRA di prima»). È sperimentale: se peggiora, toglila dal profilo.
7. [ ] Tempi: annota quanto dura un video di 5 s con 8 e con 12 passi.

## Dove si tara
Solo in `src/minimax.js`: `PROFILE` (forze per filtro, `turbo`, `steps`, `shift`) e `VARIANTS`. Dopo ogni scelta lancia `npm test`. Se un test fissava la scelta vecchia, aggiornalo e dillo ad Andrea.

| Prova | Esito | Scelta |
|---|---|---|
| Normale | | |
| Sensuale | | |
| Esplicito | | |
| Pene / direzione | | |
| Bacio | | |
