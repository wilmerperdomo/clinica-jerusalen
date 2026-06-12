<?php
/**
 * Prueba si tu PC puede leer la base MySQL (BananaHosting o local).
 * Uso: php probar_conexion.php
 */
declare(strict_types=1);

$configFile = __DIR__ . '/migrar_config.php';
if (!file_exists($configFile)) {
    echo "Falta migrar_config.php — copie migrar_config.example.php\n";
    exit(1);
}
$c = require $configFile;

echo "═══ PRUEBA DE CONEXIÓN MySQL ═══\n";
echo "Host: {$c['mysql_host']}:{$c['mysql_port']}\n";
echo "Base: {$c['mysql_db']}\n";
echo "Usuario: {$c['mysql_user']}\n\n";

try {
    $pdo = new PDO(
        sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $c['mysql_host'], $c['mysql_port'], $c['mysql_db']),
        $c['mysql_user'],
        $c['mysql_pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 15]
    );

    echo "[OK] Conectado a MySQL.\n\n";
    echo "Tablas principales:\n";

    $tablas = ['cliente', 'producto', 'contenido', 'servicio', 'colonia', 'proveedor', 'laboratorio_info', 'laboratorio_valor'];
    foreach ($tablas as $t) {
        try {
            $n = (int)$pdo->query("SELECT COUNT(*) FROM `{$t}`")->fetchColumn();
            echo "  - {$t}: {$n} registros\n";
        } catch (Throwable $e) {
            echo "  - {$t}: (no existe o sin acceso)\n";
        }
    }

    echo "\nSi ve números arriba, puede ejecutar MIGRAR-PILOTO.bat\n";
} catch (PDOException $e) {
    echo "[ERROR] No se pudo conectar:\n";
    echo $e->getMessage() . "\n\n";
    echo "── Si usa BananaHosting ──\n";
    echo "1. Entre a cPanel de BananaHosting\n";
    echo "2. 'Bases de datos MySQL' → anote Host del servidor (no siempre es localhost desde su PC)\n";
    echo "3. 'Acceso remoto a MySQL' → agregue la IP de su casa/oficina\n";
    echo "   (busque 'cual es mi ip' en Google desde la misma PC)\n";
    echo "4. Ponga ese host en migrar_config.php → mysql_host\n\n";
    echo "── Alternativa más fácil ──\n";
    echo "Exporte la base desde phpMyAdmin en BananaHosting (archivo .sql)\n";
    echo "e impórtela en XAMPP local — ver PASOS-MIGRACION.txt sección BananaHosting\n";
    exit(1);
}

// Probar Supabase
$envPath = dirname(__DIR__) . '/.env.local';
$_ENV = [];
if (file_exists($envPath)) {
    foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $_ENV[trim($k)] = trim($v, " \t\"'");
    }
}

$url = $_ENV['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
$pass = $_ENV['DB_PASSWORD'] ?? '';
if (preg_match('#https://([^.]+)\.supabase\.co#', $url, $m) && $pass) {
    echo "\n── Supabase ──\n";
    try {
        $pg = new PDO(
            "pgsql:host=db.{$m[1]}.supabase.co;port=5432;dbname=postgres",
            'postgres', $pass,
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 15]
        );
        $n = (int)$pg->query('SELECT COUNT(*) FROM sucursales')->fetchColumn();
        echo "[OK] Supabase conectado. Sucursales: {$n}\n";
    } catch (PDOException $e) {
        echo "[ERROR] Supabase: active extension=pdo_pgsql en php.ini\n";
    }
}
