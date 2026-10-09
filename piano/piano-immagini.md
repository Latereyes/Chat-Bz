# Piano: ricostruzione della logica delle immagini (tre filtri)

7 ottobre 2026 · ChatBz 2, repo Latereyes/Chat-Bz da `main` (dopo la PR #13)

## 1. Cosa fa oggi il codice

Una foto in chat passa da cinque file, ognuno con regole aggiunte una sopra l'altra nelle ultime 48 ore:

| Passo | Dove | Cosa decide |
|---|---|---|
| Richiesta della foto | `src/chat.js` (tool `send_photo` o una delle 5 riserve testuali) | se c'è una foto e la sua descrizione |
| Filtro | `src/relationship.js` `contentLevel` | neutral / sensual / explicit |
| Richiesta al prompt engineer | `src/prompts.js` `characterMediaRequest` | cosa Gemma deve scrivere |
| Prompt | Gemma con `workflows/<id>/guide.md` | il prompt finale + `[look: …]` |
| Grafo | `src/jobs.js` + `src/body.js` | Lenovo, LoRA del corpo |

Il social (`src/social.js`, `src/social-prompts.js`) e lo Studio (`src/studio.js`) hanno ciascuno una copia diversa delle stesse regole.

### Problemi trovati

1. **Il filtro sensuale quasi non scatta.** Arriva solo se la scena è "flirt", ma Gemma chiama di rado `update_scene`. In pratica si salta da normale a esplicito: basta una parola come "tette" nel messaggio.
2. **Nelle scene esplicite il prompt engineer vede un solo messaggio dell'utente.** Se la posizione o il POV erano stati detti due messaggi prima, si perdono. ChatBz 1 passava gli ultimi messaggi della conversazione, e lì funzionava.
3. **Le istruzioni si contraddicono.** Per una foto esplicita su Z-Image Gemma riceve insieme: la guida (120-250 parole, ordine fisso), la regola esplicita (80-170 parole, altro ordine), "Look: clean, flattering", `REAL_PHOTO` e la scelta Lenovo. Sono 7 blocchi di regole su una richiesta, e un 12B ne segue solo una parte.
4. **Lenovo è incoerente tra i motori.** Se Gemma non scrive l'etichetta `[look: …]`, Krea 2 Real tiene Lenovo (è nel grafo) mentre Z-Image resta senza, perché il suo grafo non lo ha.
5. **La descrizione viene ripetuta due volte.** Quando la foto nasce da una riserva testuale, la "descrizione del personaggio" è il messaggio dell'utente più la risposta, e il messaggio dell'utente compare anche come indicazione: Gemma lo legge due volte.
6. **Krea 2 Real non ha la LoRA anti-rifiuto** (`Krea2_TextFusion_Refusal_Reduction`), che invece c'è in Krea 2 Turbo. È un'ipotesi da verificare: può spiegare perché le scene esplicite su Krea escono più morbide.
7. **Il fisico a parole segue regole diverse.** In chat va solo su Z-Image, nel social sempre, nello Studio solo col fisico a mano.
8. **Non esiste un modo di provare le foto senza chattare.** Ogni aggiustamento è stato verificato a mano su una o due foto, quindi una correzione ne rompeva un'altra.

## 2. Nuova struttura

Un solo modulo, `src/photo.js`, che chat e social usano (lo Studio resta libero, ma prende da lì Lenovo e LoRA). La foto passa per quattro passi espliciti, e ognuno restituisce dati che si possono stampare e provare:

1. **Decido il filtro**: `photoLevel()` restituisce `neutral | sensual | explicit` e il perché (`reason`), salvati nella foto.
2. **Scrivo la richiesta**: `photoRequest()` usa un solo blocco di regole per filtro, scritto per intero, senza più regole impilate.
3. **Prompt**: Gemma, con temperatura e lunghezza del filtro. L'etichetta Lenovo resta, con un default chiaro se manca.
4. **Grafo**: `renderMedia` applica Lenovo, le LoRA del corpo (scalate per filtro) e, solo per Krea in esplicito, la LoRA anti-rifiuto.

## 3. I tre filtri

| | Normale | Sensuale | Esplicito |
|---|---|---|---|
| Cosa mostra | vestita come richiede la situazione, nessuna posa sexy | intimo, costume, asciugamano, pelle nuda coperta, pose provocanti; niente genitali, niente atti sessuali | nudità e atti sessuali, anatomia precisa |
| Quando scatta | sempre, come base | scena "flirt", oppure parole sensuali nella richiesta (intimo, lingerie, bikini, sexy, scollatura…) | scena "intimate", oppure parole esplicite nella richiesta |
| Tetto | quello del personaggio: con l'intimità chiusa resta sempre Normale | | |
| Contesto a Gemma | messaggio dell'utente + descrizione | + ultimo scambio | **gli ultimi 3 scambi** (le indicazioni dette prima non si perdono) |
| Chi comanda | la descrizione del personaggio | la descrizione, con le indicazioni dell'utente | **le indicazioni dell'utente** (posizione, POV, inquadratura), tradotte alla lettera |
| Stile del prompt | quello della guida del motore | quello della guida | asciutto, prima azione e POV, nomi delle posizioni ammessi (cowgirl, doggystyle…) come in ChatBz 1; 60-160 parole |
| Temperatura | 0.7 | 0.6 | 0.4 |
| Lenovo | scelto da Gemma, di default sì | di default sì | di default sì |
| LoRA del corpo (solo Krea) | forza piena | forza piena | da tarare nei test (ipotesi 0.8×) |
| Fisico a parole | per le donne su tutti i motori, "attraverso i vestiti" | sì | sì, senza filtro sui vestiti |

Il filtro viene salvato nella foto (`media.level` e `media.levelReason`) e mostrato sotto l'immagine, così si capisce subito perché è uscita in un certo modo.

Il social resta tra Normale e Sensuale (`SOCIAL_LEVEL`), ma usa gli stessi blocchi del filtro.

## 4. Banco di prova

Lo script `tools/prova-foto.js` ha tre modalità:

- `--solo-richieste` (senza modelli): stampa filtro, motivo, richiesta e LoRA per ogni scenario. Gira anche in cloud.
- `--prompt` (Ollama): aggiunge il prompt scritto da Gemma.
- `--foto` (Ollama e ComfyUI): genera davvero e scrive `data/prove-foto/<data>/index.html` con foto, filtro, prompt, LoRA e Lenovo, uno accanto all'altro.

Ci sono 8 scenari per due personaggi di prova (uno Z-Image, uno Krea):

1. Normale a distanza: selfie al bar
2. Normale insieme: foto scattata da te al parco
3. Sensuale a distanza: "fammi vedere l'intimo nuovo"
4. Sensuale in scena flirt: lei sul letto in vestaglia
5. Esplicito insieme con POV e posizione detti **due messaggi prima**
6. Esplicito insieme in terza persona, chiesta esplicitamente
7. Esplicito a distanza: selfie nuda allo specchio
8. Tetto chiuso: richiesta esplicita a un personaggio non ancora in confidenza, deve uscire Normale

Ci sono anche test automatici (`node --test`) per filtro e grafo: Lenovo sì/no, nessuna LoRA del corpo su Z-Image, anti-rifiuto solo su Krea in esplicito.

## 5. Fasi

1. **Ricostruzione** (cloud, PR in bozza): `src/photo.js`, chat e social collegati, banco di prova, test automatici.
2. **Taratura sul PC** (Remote Control nella cartella ChatBz2): `--prompt` e poi `--foto` su tutti gli scenari, con la stessa matrice ripetuta dopo ogni modifica. Si tarano le forze LoRA in esplicito, l'anti-rifiuto su Krea e le lunghezze.
3. **Prova in chat vera** con te: una conversazione che sale da normale a esplicito, con indicazioni di posa.
4. Unione in `main` quando la matrice è tutta a posto.

## 6. Scelte fatte senza chiederti (si cambiano in un attimo)

- Sensuale = intimo, costume, nudo coperto; niente seno scoperto. Se lo vuoi più spinto, basta dirlo.
- Niente selettore manuale del filtro in chat per ora. Se dopo i test l'automatico sbaglia ancora, aggiungo accanto a «Foto» la scelta Auto / Normale / Sensuale / Esplicito, sempre entro il tetto del personaggio.
- Lo Studio resta com'è (tutto permesso su richiesta) e prende solo Lenovo e LoRA dal modulo comune.

## 7. Aggiornamenti del 9 ottobre

Fatti insieme alla fase 1 (ricostruzione), nel branch `claude/admiring-goldberg-rgvept`.

1. **Si lavora su Krea 2.** Z-Image resta, ma grezzo: niente Lenovo (né in chat, né nel social, né nello Studio), niente LoRA, niente etichetta `[look: …]`. Solo il prompt, con il fisico a parole.
2. **Taratura su Krea 2 con il banco di prova.** Oltre agli 8 scenari del piano ce ne sono 6 per le situazioni principali: missionario dall'alto, pecorina da dietro, handjob in POV, finale sul viso, Hitomi normale e Hitomi esplicita. Con `--varianti` ogni scenario esce in una colonna per variante delle LoRA, con lo stesso prompt e lo stesso seed.
3. **LoRA di supporto in un solo file**, `src/krea2.js`: catalogo, profilo per filtro (l'ipotesi di partenza) e varianti da confrontare. Quelle non installate su ComfyUI si saltano e lo si vede nel log.

| | Normale | Sensuale | Esplicito |
|---|---|---|---|
| Realismo | Realism Engine 3.1 0.7 | 3.1 0.7 | 3.1 0.7 |
| Sblocco | | | anti-rifiuto 1, Unlocked V1 0.6 |
| NSFW | | | MysticXXX 0.5, HMNSFW 0.8 (solo con una posizione) |
| Sampler | del workflow (8 passi, simple) | idem | 12 passi, beta (come consiglia MysticXXX) |
| Corpo | forza piena | forza piena | 0.8× |

4. **Realism V2** (`Krea2-realism-V2.safetensors`) si confronta con la 3.1 nelle varianti `realism-v2` (1.0 / 1.2 / 1.5) e `realism-v2-forte` (1.0 / 1.5 / 2.0). Se vince, si copia nel profilo.
5. **HMNSFW**: posizione e angolo non li sceglie Gemma. Il server li ricava dalla conversazione (prima i messaggi più recenti): cowgirl, missionary, doggy, handjob, `_anal`; angolo detto a parole (di lato, dall'alto, dal basso, da dietro, primo piano) oppure, insieme e senza terza persona, il POV della posizione (cowgirl → POV_ABOVE, missionario → POV_FRONT, pecorina → BEHIND, handjob → POV_FRONT). Il prompt diventa `HMNSFW <posizione>, ANGLE_<angolo>, <descrizione di Gemma>` e la LoRA si aggancia solo se il prompt comincia così (anche con il prompt modificato a mano). Per il finale Gemma scrive "cum, thick white liquid"; senza posizione il token è `HMNSFW cum` (da verificare nelle prove: non è chiaro dalla scheda della LoRA se `cum` sia un token).
6. **Detailer** (`Detailer-KREA2.safetensors`): nella variante `detailer` (0.6 su tutti i filtri). Fuori dal profilo finché le prove non dicono che aiuta.
7. **Unlocked V1** consiglia 20+ passi e CFG 3.5, pensati per Krea 2 base: la variante `sampler-20-cfg` lo prova sul Turbo (circa il doppio del tempo per foto).
8. **Personaggio coerente**: la scheda ha la **LoRA del personaggio** (file, parola chiave, forza), solo per Krea 2. La parola chiave va in testa al prompt (dopo i token di HMNSFW) in chat, nel social (foto in cui c'è solo lui o lei) e nello Studio quando lo si sceglie come soggetto. Con la LoRA il social non usa più "stessa persona" dalla foto profilo: il volto lo dà la LoRA. Primo personaggio: **Hitomi** (`Krea2 - Hitomi.safetensors`, `H1t0m1`), da importare con `node tools/importa-personaggio.js tools/personaggi/hitomi.json`. L'aspetto della scheda è una bozza: va corretto se non combacia con la LoRA.

### Taratura sul PC (fase 2)

```
node tools/prova-foto.js --solo-richieste                       # controllo veloce, senza modelli
node tools/prova-foto.js --foto --varianti base,realism-v2,realism-v2-forte --scenari 1,3,4,7,13
node tools/prova-foto.js --foto --varianti base,senza-mystic,senza-unlocked,solo-sblocco --scenari 5,9,10,11,12,14
node tools/prova-foto.js --foto --varianti base,detailer,sampler-8,sampler-20-cfg --scenari 5,10,13
```

Dopo ogni giro si guarda `data/prove-foto/<data>/index.html`, si copia in `PROFILE` la variante migliore e si rifà la stessa matrice.
