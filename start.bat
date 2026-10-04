@echo off
title ChatBz
cd /d "%~dp0"
if not exist node_modules (
  echo Installo le dipendenze...
  call npm install
)
node --disable-warning=ExperimentalWarning server.js
pause
