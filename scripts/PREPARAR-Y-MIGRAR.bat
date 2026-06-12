@echo off
chcp 65001 >nul
title Preparar y migrar datos
cd /d "%~dp0"

echo.
echo  === PASO 1: Probar MySQL y Supabase ===
php probar_conexion.php
if errorlevel 1 goto fin

echo.
echo  === PASO 2: Verificar tablas Supabase ===
php verificar_supabase.php > verificar_tmp.txt 2>&1
type verificar_tmp.txt
findstr /C:"[NO] productos" verificar_tmp.txt >nul
if not errorlevel 1 (
    echo.
    echo  Creando tablas productos/inventario en Supabase...
    php crear_tablas_faltantes.php
    if errorlevel 1 goto fin
    php verificar_supabase.php
)
del verificar_tmp.txt 2>nul

echo.
echo  === PASO 3: Migrar datos (piloto) ===
echo  Presione una tecla para continuar...
pause >nul
php migrar_desde_mysql.php --paso=all --piloto

:fin
echo.
pause
