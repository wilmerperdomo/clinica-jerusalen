<?php
$envPath = dirname(__DIR__) . '/.env.local';
$_ENV = [];
foreach (file($envPath, FILE_IGNORE_NEW_LINES) as $line) {
    $line = trim($line);
    if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
    [$k, $v] = explode('=', $line, 2);
    $_ENV[trim($k)] = trim($v, " \t\"'");
}
preg_match('#https://([^.]+)\.supabase\.co#', $_ENV['NEXT_PUBLIC_SUPABASE_URL'] ?? '', $m);
$pg = new PDO(
    "pgsql:host=db.{$m[1]}.supabase.co;port=5432;dbname=postgres",
    'postgres',
    $_ENV['DB_PASSWORD'] ?? '',
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);

$tablas = [
    'sucursales', 'listas_precio', 'colonias', 'pacientes', 'productos',
    'inventario', 'proveedores', 'servicios', 'laboratorio_info', 'laboratorio_valor',
    'consultas', 'perfiles',
];
echo "Tablas en Supabase:\n";
$faltan = [];
foreach ($tablas as $t) {
    $ok = (bool)$pg->query("SELECT to_regclass('public.{$t}')")->fetchColumn();
    echo ($ok ? '[SI] ' : '[NO] ') . $t . "\n";
    if (!$ok) $faltan[] = $t;
}
if ($faltan) {
    echo "\nFALTAN: " . implode(', ', $faltan) . "\n";
    echo "Ejecute las migraciones en Supabase SQL Editor.\n";
} else {
    echo "\nSupabase listo para migrar.\n";
}
