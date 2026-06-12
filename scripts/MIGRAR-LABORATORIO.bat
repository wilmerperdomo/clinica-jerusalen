@echo off
chcp 65001 >nul
title Migrar catalogo de laboratorio
cd /d "%~dp0"
echo.
echo  Migra pruebas de laboratorio + precios del sistema viejo
echo.
php migrar_desde_mysql.php --paso=laboratorio --completo
echo.
pause
