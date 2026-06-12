@echo off
chcp 65001 >nul
title Probar conexion MySQL BananaHosting
cd /d "%~dp0"
echo.
echo  Prueba si su PC puede leer la base en BananaHosting
echo  y si Supabase esta listo.
echo.
php probar_conexion.php
echo.
pause
