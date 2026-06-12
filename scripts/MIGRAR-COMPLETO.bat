@echo off
chcp 65001 >nul
title Migracion Clinica - Completa
cd /d "%~dp0"

echo.
echo  ============================================
echo   MIGRACION COMPLETA (todos los datos)
echo   Solo ejecute esto si el PILOTO salio bien.
echo  ============================================
echo.
pause

php -m | findstr /i "pdo_pgsql" >nul
if errorlevel 1 (
    echo Active pdo_pgsql en C:\xampp\php\php.ini primero. Ver MIGRAR-PILOTO.bat
    pause
    exit /b 1
)

php migrar_desde_mysql.php --paso=all --completo

echo.
pause
