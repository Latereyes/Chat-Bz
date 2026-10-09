---
name: taratura-foto
description: Fa un giro di taratura delle foto di Krea 2 con il banco di prova (tools/prova-foto.js), guarda le foto generate e propone le forze delle LoRA da mettere in src/krea2.js. Usala quando Andrea chiede di provare, confrontare o tarare le foto, le LoRA, Realism V2, HMNSFW, Hitomi o un giro di piano/prossimi-passi.md.
---

# Taratura delle foto

Lo scopo è scegliere, con prove ripetibili, il profilo delle LoRA di Krea 2 (`PROFILE` in `src/krea2.js`) per i tre filtri.

## 1. Prima di generare
1. Leggi `piano/prossimi-passi.md` e capisci a che giro si è (A realismo, B sblocco/NSFW, C dettaglio/sampler, D Hitomi). Se Andrea chiede altro, usa i suoi scenari e le sue varianti.
2. `npm test` deve finire con `fail 0`.
3. Controlla che Ollama (http://127.0.0.1:11434) e ComfyUI (http://127.0.0.1:8188) rispondano. Se il server di ChatBz sta generando, aspetta o chiedi: la GPU è una sola.
4. `node tools/prova-foto.js --solo-richieste --scenari <…>`: nessun «⚠ atteso», nessuna «mancano: …» nelle LoRA. Se manca un file, dillo ad Andrea con il nome esatto e fermati.

## 2. Generare
Usa il comando del giro in `piano/prossimi-passi.md`, sempre con un `--seed` fisso, così i giri si confrontano tra loro. Ogni foto richiede tempo (circa 10-40 s; con `sampler-20-cfg` il doppio): prima di lanciare più di ~30 foto, di' ad Andrea quante sono.

Il risultato finisce in `data/prove-foto/<data>/`:
- `index.html` è la pagina da far aprire ad Andrea, con scenari in riga e varianti in colonna;
- `risultati.json` ha prompt, seed, filtro e LoRA di ogni foto;
- le immagini sono `<scenario>--<variante>.png`.

## 3. Guardare le foto
Apri le immagini con lo strumento di lettura (le vedi). Per ogni scenario confronta le varianti su:
- **Anatomia**: mani, dita, genitali, proporzioni. Il corpo deve seguire la scheda (LoRA del corpo).
- **Pelle e realismo**: pelle vera e non plastica, look da foto col telefono, niente aspetto «AI» o troppo nitido.
- **Richiesta**: posizione, POV e inquadratura chieste (in esplicito); niente nudità in Normale; niente seno scoperto in Sensuale.
- **Volto** (Hitomi): uguale tra le foto e uguale alla LoRA.
- **Difetti da troppe LoRA**: colori bruciati, corpi deformati, texture ripetute.

Scrivi una tabella breve: scenario × variante, con un giudizio di una riga e la variante migliore per riga. Non decidere da una foto sola: se due varianti si equivalgono, proponi un secondo seed.

## 4. Proporre e applicare
1. Proponi ad Andrea il cambio di `PROFILE` (quali forze, sampler, `bodyScale`) con il perché, guardando le foto. Applicalo solo quando dice sì.
2. Dopo il cambio: `npm test`. Se fallisce un test che fissava la scelta vecchia (es. «anti-rifiuto solo in esplicito»), aggiorna il test alla nuova scelta e dillo.
3. Rifai lo stesso giro con `--varianti base` e lo stesso seed, per far vedere il profilo nuovo.
4. Compila la riga del giro nella tabella di `piano/prossimi-passi.md` e spunta le caselle fatte.
5. Fai il commit con un messaggio in italiano (es. «Krea 2: Realism V2 al posto della 3.1, tarato sulle prove del …»). Fai push solo se Andrea lo chiede.

## Da sapere
- Se una variante nuova serve, aggiungila in `VARIANTS` (`src/krea2.js`): il test «varianti: tutte valide» controlla che usi solo LoRA del catalogo.
- I token di HMNSFW vengono da `hmTokens` in `src/photo.js`. Se una posizione non viene riconosciuta, aggiungi le parole lì (italiano e inglese) e uno scenario o un test.
- Le regole che Gemma riceve per filtro sono in `rules()` in `src/photo.js`. Se i prompt sbagliano sempre allo stesso modo, la correzione va lì. Poi si rifà `--prompt` su tutti gli scenari, non solo su quello sbagliato.
