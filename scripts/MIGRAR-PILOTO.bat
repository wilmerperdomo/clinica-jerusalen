@echo off
chcp 65001 >nul
title Migracion Clinica - Piloto
cd /d "%~dp0"

echo.
echo  ============================================
echo   MIGRACION PILOTO (50 pacientes, 100 productos)
echo   Sistema viejo MySQL  --^>  Supabase nuevo
echo  ============================================
echo.

REM Verificar PHP
where php >nul 2>&1
if errorlevel 1 (
    echo [ERROR] No encuentra PHP. Use XAMPP: C:\xampp\php\php.exe
    pause
    exit /b 1
)

REM Verificar extension PostgreSQL
php -m | findstr /i "pdo_pgsql" >nul
if errorlevel 1 (
    echo [AVISO] Falta activar PostgreSQL en PHP.
    echo.
    echo  1. Abra: C:\xampp\php\php.ini
    echo  2. Busque estas lineas y quite el punto y coma al inicio:
    echo       ;extension=pdo_pgsql   --^>   extension=pdo_pgsql
    echo       ;extension=pgsql       --^>   extension=pgsql
    echo  3. Guarde y vuelva a ejecutar este archivo.
    echo.
    pause
    exit /b 1
)

REM Verificar MySQL
php -m | findstr /i "pdo_mysql" >nul
if errorlevel 1 (
    echo [ERROR] Falta pdo_mysql en PHP.
    pause
    exit /b 1
)

echo [OK] PHP listo.
echo.
echo Antes de continuar:
echo   OPCION A (recomendada): exporto SQL desde BananaHosting
echo     e importo en XAMPP local - ver PASOS-MIGRACION.txt
echo   OPCION B: mysql_host en migrar_config.php = host BananaHosting
echo.
echo   Ejecute primero PROBAR-CONEXION.bat si no lo hizo.
echo   Migraciones 001-045 deben estar en Supabase.
echo.
pause

echo.
echo Ejecutando migracion piloto...
echo.
php migrar_desde_mysql.php --paso=all --piloto

echo.
echo ============================================
echo  Termino. Revise los mensajes arriba.
echo  Luego abra la app y pruebe Pacientes / Inventario.
echo ============================================
pause
