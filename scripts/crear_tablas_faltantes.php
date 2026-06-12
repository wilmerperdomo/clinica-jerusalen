<?php
/**
 * Crea tablas productos/inventario en Supabase si faltan (migración 008).
 * Uso: php crear_tablas_faltantes.php
 */
declare(strict_types=1);

$sqlFile = dirname(__DIR__) . '/supabase/migrations/008_inventario.sql';
if (!file_exists($sqlFile)) {
    echo "No se encuentra 008_inventario.sql\n";
    exit(1);
}

$envPath = dirname(__DIR__) . '/.env.local';
$_ENV = [];
foreach (file($envPath, FILE_IGNORE_NEW_LINES) as $line) {
    $line = trim($line);
    if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
    [$k, $v] = explode('=', $line, 2);
    $_ENV[trim($k)] = trim($v, " \t\"'");
}

preg_match('#https://([^.]+)\.supabase\.co#', $_ENV['NEXT_PUBLIC_SUPABASE_URL'] ?? '', $m);
if (!$m) { echo "Falta NEXT_PUBLIC_SUPABASE_URL en .env.local\n"; exit(1); }

$pg = new PDO(
    "pgsql:host=db.{$m[1]}.supabase.co;port=5432;dbname=postgres",
    'postgres',
    $_ENV['DB_PASSWORD'] ?? '',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

$exists = $pg->query("SELECT to_regclass('public.productos')")->fetchColumn();
if ($exists) {
    echo "[OK] Tabla productos ya existe. Nada que hacer.\n";
    exit(0);
}

echo "Creando tablas productos, inventario, kardex...\n";
$sql = file_get_contents($sqlFile);
$pg->exec($sql);
echo "[OK] Migración 008 aplicada en Supabase.\n";
echo "Ahora ejecute MIGRAR-PILOTO.bat\n";
