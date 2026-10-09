# Prossimi passi: taratura delle foto sul PC

Da fare in locale, nella cartella di ChatBz 2, sul branch `claude/admiring-goldberg-rgvept`.
Contesto: `piano/piano-immagini.md` (sezioni 2-7). La fase 1, la ricostruzione, è fatta. Qui ci sono le fasi 2-4.

## 0. Preparazione (una volta)

```bat
git fetch origin
git checkout claude/admiring-goldberg-rgvept
git pull
npm install
npm test
```

`npm test` deve finire con `fail 0`.

**LoRA in `ComfyUI/models/loras`.** I nomi devono essere esattamente questi: sono quelli scritti in `src/krea2.js` e in `tools/personaggi/hitomi.json`.

| File | Ruolo |
|---|---|
| `realism_engine_krea2_v3.1.safetensors` | realismo (già usata) |
| `Krea2-realism-V2.safetensors` | realismo nuova, da confrontare |
| `Krea2_TextFusion_Refusal_Reduction.safetensors` | anti-rifiuto |
| `kera2_Unlocked_V1.safetensors` | sblocco |
| `MysticXXX_KREA2_v2.safetensors` | NSFW |
| `Krea2_HMNSFW_AIO.safetensors` | posizioni (token HMNSFW) |
| `Detailer-KREA2.safetensors` | dettaglio |
| `Krea220Hitomi.safetensors` | volto di Hitomi |

- [x] Nomi verificati da Andrea (9 ottobre): Hitomi è `Krea220Hitomi.safetensors`, MysticXXX è la **v2**. Codice e scheda di Hitomi sono già aggiornati.
- [ ] Nell'elenco del PC mancavano `Krea2_HMNSFW_AIO.safetensors` e `Krea2_TextFusion_Refusal_Reduction.safetensors` (quest'ultima la usa già Krea 2 Turbo). Controlla che ci siano: senza, le foto escono senza quelle LoRA e il log le elenca.
- [ ] Avvia il server (`npm start`). Nel log non deve comparire la riga «LoRA di supporto di Krea 2 non trovate su ComfyUI». Se compare, elenca i file che mancano.
- [ ] Importa Hitomi: `node tools/importa-personaggio.js tools/personaggi/hitomi.json`

## 1. Controllo veloce, senza modelli

```bat
node tools/prova-foto.js --elenco
node tools/prova-foto.js --solo-richieste
```

- [ ] Ogni scenario ha il filtro atteso: non deve comparire nessun «⚠ atteso».
- [ ] I token HMNSFW sono giusti: 5 cowgirl POV_ABOVE, 6 doggy senza angolo, 9 missionary OVERHEAD, 10 doggy BEHIND, 11 handjob POV_FRONT, 12 cum CLOSEUP, 14 cowgirl POV_ABOVE.

## 2. Prompt di Gemma (serve solo Ollama)

```bat
node tools/prova-foto.js --prompt
```

Cosa guardare, scenario per scenario:
- [ ] **5** (posizione detta due messaggi prima): il prompt parla di cowgirl dal POV di chi sta sotto, non di una posa generica.
- [ ] **6**: c'è la terza persona, con tutti e due nella foto.
- [ ] **Esplicito**: 60-160 parole (60-120 con HMNSFW), apre con inquadratura e POV, niente parole d'atmosfera o metafore.
- [ ] **Normale e sensuale**: niente nudità in normale, niente seno scoperto in sensuale.
- [ ] **13-14**: il prompt comincia con `H1t0m1,` (14: `HMNSFW cowgirl, ANGLE_POV_ABOVE, H1t0m1, …`).

Se Gemma sbaglia sempre allo stesso modo, si corregge il blocco di regole del filtro in `src/photo.js` (funzione `rules`). Poi si rifà questo passo.

## 3. Taratura delle LoRA (Ollama e ComfyUI)

Ogni giro scrive `data/prove-foto/<data>/index.html`: una riga per scenario, una colonna per variante, con stesso prompt e stesso seed.
Per confrontare due giri sulle stesse foto, aggiungi `--seed 12345`.

### Giro A: realismo (Realism 3.1 o V2)
```bat
node tools/prova-foto.js --foto --seed 12345 --scenari 1,2,3,4,7,13 --varianti base,realism-v2,realism-v2-forte,senza-realism
```
- [ ] Guarda pelle, anatomia e vestiti, e se il look «foto vera» regge. Scegli la colonna migliore per ogni filtro.

### Giro B: sblocco e NSFW in esplicito
```bat
node tools/prova-foto.js --foto --seed 12345 --scenari 5,7,9,10,11,12,14 --varianti base,senza-refusal,senza-unlocked,unlocked-forte,senza-mystic,mystic-forte,solo-sblocco,senza-hmnsfw
```
- [ ] La posizione chiesta esce davvero? Se esce anche con `senza-hmnsfw`, HMNSFW serve a poco.
- [ ] Ci sono deformazioni (mani, genitali, corpo «cotto»)? Di solito vuol dire troppe LoRA o forze troppo alte.
- [ ] Scenario 12: `HMNSFW cum` funziona come token? Se no, in `src/photo.js` (`hmTokens`) il finale senza posizione deve restituire null.

### Giro C: dettaglio e sampler
```bat
node tools/prova-foto.js --foto --seed 12345 --scenari 1,5,10,13 --varianti base,detailer,sampler-8,sampler-20-cfg
```
- [ ] Il Detailer migliora o rende la foto troppo nitida o «AI»?
- [ ] 12 passi beta valgono il tempo in più rispetto a 8 passi simple? E 20 passi con CFG 3.5? Il tempo per foto è nella didascalia.

### Giro D: Hitomi
```bat
node tools/prova-foto.js --foto --seed 12345 --scenari 13,14 --varianti base,realism-v2
```
- [ ] Il volto è quello della LoRA? Se no, prova la forza 0.8-1.2 nella scheda.
- [ ] Le LoRA del corpo contrastano la LoRA? Ora seno e corporatura sono a −2, ricavati dall'aspetto. Se sì, correggi l'aspetto nella scheda o regola il fisico a mano.
- [ ] Correggi l'aspetto di Hitomi nella scheda perché combaci con la LoRA: l'aspetto attuale è una bozza.

### In più: dallo Studio, una foto alla volta
Nello Studio immagini ci sono i menu **Filtro** e **LoRA Krea** (le stesse varianti del banco di prova). Per confrontare due varianti su una tua richiesta: motore Krea 2 Real, stesso **Seed**, cambi solo «LoRA Krea». La riga sotto la foto dice filtro, variante e LoRA usate.

### Dopo ogni giro
1. Copia la variante vincente in `PROFILE` in `src/krea2.js` (forze, `sampler`, `bodyScale`).
2. `npm test`. Il test «anti-rifiuto solo in esplicito» fallisce apposta se lo metti anche in sensuale: in quel caso aggiorna il test (`test/photo.test.js`).
3. Rifai lo stesso giro con `--varianti base` e lo stesso `--seed`, per vedere il profilo nuovo.
4. Annota la scelta qui sotto.

| Giro | Data | Variante scelta | Note |
|---|---|---|---|
| A realismo | | | |
| B sblocco/NSFW | | | |
| C dettaglio/sampler | | | |
| D Hitomi | | | |

## 4. Prova in chat vera

Una conversazione con Hitomi (o con un personaggio Krea in confidenza) che sale da normale a esplicito:
- [ ] Selfie normale a distanza, poi «fammi vedere l'intimo»: sotto la foto deve comparire «Sensuale · parola sensuale: «intimo»».
- [ ] Vi vedete e la scena diventa flirt, poi intima. A un certo punto dai un'indicazione di posa e POV, e chiedi la foto due messaggi dopo.
- [ ] Sotto ogni foto controlla filtro, motivo, HMNSFW e LoRA. Se il filtro automatico sbaglia spesso, si aggiunge accanto a «Foto» la scelta Auto / Normale / Sensuale / Esplicito (sezione 6 del piano).
- [ ] Social: un post e una storia di Hitomi. Il volto deve venire dalla LoRA, non dalla foto profilo.

## 5. Unione in `main`

Quando la matrice è tutta a posto e la chat vera convince:
- [ ] `npm test` verde, profilo definitivo in `src/krea2.js`, tabella sopra compilata.
- [ ] Togli la bozza dalla PR (Ready for review) e unisci.
