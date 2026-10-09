# Prepara ChatBz 2 sul PC per le foto nuove (Krea 2, filtri, banco di prova, Hitomi).
# Da eseguire nella cartella di ChatBz 2, in PowerShell:
#   powershell -ExecutionPolicy Bypass -File tools\prepara-pc.ps1
# Se ComfyUI è installato altrove:  -ComfyDir "D:\percorso\ComfyUI"
# Si può rilanciare quante volte vuoi: i passi già fatti vengono saltati.

param(
  [string]$ComfyDir = "C:\IA\Packages\ComfyUI",
  [string]$Branch = "claude/admiring-goldberg-rgvept"
)

# Gli errori dei comandi esterni (git, npm, node) si controllano con $LASTEXITCODE:
# con "Stop" PowerShell 5 si fermerebbe anche sui semplici avvisi che scrivono su stderr
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$ok = $true
function Passo($n, $t) { Write-Host "`n[$n] $t" -ForegroundColor Cyan }
function Bene($t) { Write-Host "    OK  $t" -ForegroundColor Green }
function Attento($t) { Write-Host "    !!  $t" -ForegroundColor Yellow; $script:ok = $false }
function Ferma($t) { Write-Host "`n    STOP: $t" -ForegroundColor Red; exit 1 }

Passo 1 "ChatBz è spento?"
$porta = Get-NetTCPConnection -LocalPort 3100 -State Listen -ErrorAction SilentlyContinue
if ($porta) { Ferma "ChatBz è acceso (porta 3100). Chiudi la finestra di start.bat e rilancia questo script." }
Bene "porta 3100 libera"

Passo 2 "Codice nuovo dal branch $Branch"
$cambi = git status --porcelain --untracked-files=no
if ($cambi) {
  Write-Host $cambi
  Ferma "ci sono modifiche non salvate nei file qui sopra. Salvale (git stash) o chiedi a Claude, poi rilancia."
}
git fetch origin $Branch
if ($LASTEXITCODE -ne 0) { Ferma "git fetch non riuscito (connessione?)" }
git checkout $Branch
if ($LASTEXITCODE -ne 0) { Ferma "git checkout non riuscito" }
git pull --ff-only origin $Branch
if ($LASTEXITCODE -ne 0) { Ferma "git pull non riuscito" }
Bene "branch $Branch aggiornato ($(git log -1 --format='%h %s'))"

Passo 3 "Dipendenze (npm install)"
npm install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Ferma "npm install non riuscito" }
Bene "dipendenze a posto"

Passo 4 "Test automatici (npm test)"
# conta il codice di uscita: su Windows il riepilogo di node --test non ha lo stesso formato che altrove
$out = npm test 2>&1 | Out-String
if ($LASTEXITCODE -eq 0) { Bene "tutti i test passano" }
else { Write-Host $out; Ferma "qualche test non passa: manda l'output qui sopra a Claude" }

Passo 5 "LoRA in $ComfyDir\models\loras"
$dir = Join-Path $ComfyDir "models\loras"
if (-not (Test-Path $dir)) { Ferma "cartella non trovata: $dir (usa -ComfyDir)" }
$lora = @(
  @("realism_engine_krea2_v3.1.safetensors", "realismo (quella di sempre)"),
  @("Krea2-realism-V2.safetensors", "realismo nuova, da confrontare"),
  @("Krea2_TextFusion_Refusal_Reduction.safetensors", "anti-rifiuto"),
  @("kera2_Unlocked_V1.safetensors", "sblocco"),
  @("MysticXXX_KREA2_v2.safetensors", "NSFW"),
  @("Krea2_HMNSFW_AIO.safetensors", "posizioni (HMNSFW)"),
  @("Detailer-KREA2.safetensors", "dettaglio"),
  @("lenovo_krea2.safetensors", "Lenovo, look foto amatoriale"),
  @("Krea220Hitomi.safetensors", "volto di Hitomi")
)
$tutti = Get-ChildItem -Path $dir -Recurse -File -Filter *.safetensors* | Select-Object -ExpandProperty Name
foreach ($l in $lora) {
  if ($tutti -contains $l[0]) { Bene "$($l[0])  ($($l[1]))" }
  else { Attento "MANCA $($l[0])  ($($l[1])): le foto escono senza questa LoRA" }
}

Passo "5b" "Rilevamento di persone e volti (foto con due personaggi)"
$ultra = Join-Path $ComfyDir "models\ultralytics"
if (Test-Path (Join-Path $ultra "bbox\face_yolov8m.pt")) { Bene "volti: bbox\face_yolov8m.pt" }
else { Attento "MANCA ultralytics\bbox\face_yolov8m.pt: nelle foto a due i volti non vengono ritoccati uno per uno" }
$person = Join-Path $ultra "segm\person_yolov8m-seg.pt"
if (Test-Path $person) { Bene "persone: segm\person_yolov8m-seg.pt" }
else {
  Write-Host "    Manca segm\person_yolov8m-seg.pt (circa 55 MB): serve perché nelle foto a due il fisico venga dalla LoRA di ciascuno."
  $si = Read-Host "    Lo scarico adesso? (s/n)"
  if ($si -match "^[sS]") {
    New-Item -ItemType Directory -Force -Path (Split-Path $person) | Out-Null
    curl.exe -L --fail --retry 3 -o "$person" "https://huggingface.co/Bingsu/adetailer/resolve/main/person_yolov8m-seg.pt"
    if ($LASTEXITCODE -eq 0) { Bene "scaricato: riavvia ComfyUI perché lo veda" } else { Attento "download non riuscito" }
  } else { Attento "senza: nelle foto a due si ritoccano solo i volti, il fisico viene dalle parole della scheda" }
}

Passo 6 "Personaggio Hitomi"
if (-not (Test-Path "data\users.json")) {
  Attento "ChatBz non è mai stato avviato qui: avvialo una volta (start.bat), chiudilo e rilancia lo script per importare Hitomi"
} else {
  $imp = node --disable-warning=ExperimentalWarning tools/importa-personaggio.js tools/personaggi/hitomi.json 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) { Bene ($imp.Trim()) }
  elseif ($imp -match "già un personaggio") { Bene "Hitomi c'era già. Nella sua scheda il campo «LoRA del personaggio» deve essere Krea220Hitomi.safetensors, parola chiave H1t0m1" }
  else { Write-Host $imp; Attento "import di Hitomi non riuscito (output qui sopra)" }
}

Passo 7 "Controllo veloce delle foto (senza modelli)"
$prova = node --disable-warning=ExperimentalWarning tools/prova-foto.js --solo-richieste 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) { Write-Host $prova; Attento "il banco di prova non parte (output qui sopra)" }
elseif ($prova -match "atteso") { Attento "qualche scenario ha un filtro diverso dall'atteso: lancia node tools/prova-foto.js --solo-richieste e guarda le righe con ⚠" }
else { Bene "14 scenari: filtri e token come previsto" }

Write-Host ""
if ($ok) { Write-Host "Tutto pronto." -ForegroundColor Green }
else { Write-Host "Pronto, ma guarda le righe gialle (!!) qui sopra." -ForegroundColor Yellow }
Write-Host @"

Cosa fare adesso:
  1. Avvia ChatBz (start.bat) e nel log controlla che non ci sia «LoRA di supporto di Krea 2 non trovate».
  2. In chat: scrivi a Hitomi. Sotto ogni foto vedi filtro, motivo e LoRA usate.
  3. Nello Studio: menu «Filtro» e «LoRA Krea» per provare una variante su una foto (stesso seed).
  4. Taratura completa: apri Claude in questa cartella e chiedi «fai il giro A della taratura»
     (la lista è in piano\prossimi-passi.md). Il banco di prova con --foto va lanciato con ChatBz spento
     o fermo, perché la GPU è una sola.
"@
$avvia = Read-Host "Avvio ChatBz adesso? (s/n)"
if ($avvia -match "^[sS]") { Start-Process -FilePath (Join-Path $root "start.bat") -WorkingDirectory $root }
