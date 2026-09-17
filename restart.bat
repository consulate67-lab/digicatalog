@echo off
REM  DijiCatalog - Restart wrapper
REM  PowerShell restart.ps1'i calistirir (cmd parse sorunlarindan kacinir)
chcp 65001 >nul
title DijiCatalog - Restart
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart.ps1"
