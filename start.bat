@echo off
title ChatBz
cd /d "%~dp0"
if not exist node_modules (
  echo Installo le dipendenze...
  call npm install
)
node --disable-warning=ExperimentalWarning server.js
rem Avviato dall'agent del PC: niente pausa, la finestra non c'è
if not defined CONTROL_TOKEN pause
