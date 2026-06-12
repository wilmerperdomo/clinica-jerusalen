<?php
/**
 * ═══════════════════════════════════════════════════════════════════
 *  MIGRACIÓN MySQL (sistema viejo) → Supabase (clinica-nueva)
 *
 *  Transforma tablas viejas a las nuevas:
 *    colonia          → colonias
 *    proveedor        → proveedores
 *    producto         → productos
 *    servicio         → servicios
 *    cliente          → pacientes
 *    cliente_antecedente → paciente_antecedentes
 *    cliente_antecedenteg → paciente_antecedentes_go
 *    contenido        → inventario
 *    laboratorio_info → laboratorio_info
 *    laboratorio_valor→ laboratorio_valor
 *    laboratorio_insumo→ laboratorio_insumo
 *
 *  USO:
 *    cd clinica-nueva/scripts
 *    cp migrar_config.example.php migrar_config.php   (editar credenciales)
 *    php migrar_desde_mysql.php --paso=all --piloto
 *    php migrar_desde_mysql.php --paso=pacientes --completo
 *    php migrar_desde_mysql.php --paso=all --completo --dry-run
 *
 *  REQUISITOS:
 *    - PHP 8.0+ con extensiones pdo_mysql y pdo_pgsql
 *    - Migraciones 001–045 ya ejecutadas en Supabase
 *    - .env.local en clinica-nueva con NEXT_PUBLIC_SUPABASE_URL y DB_PASSWORD
 *
 *  ORDEN RECOMENDADO:
 *    colonias → proveedores → productos → servicios → pacientes → inventario
 * ═══════════════════════════════════════════════════════════════════
 */

declare(strict_types=1);

set_time_limit(0);
ini_set('memory_limit', '512M');

// ── Argumentos CLI ────────────────────────────────────────────────
$opts = getopt('', ['paso:', 'piloto', 'completo', 'dry-run', 'help']);
if (isset($opts['help'])) {
    echo <<<HELP
Opciones:
  --paso=colonias|proveedores|productos|laboratorio|servicios|pacientes|inventario|all
  --piloto      Usa límites de migrar_config.php (50 pacientes, 100 productos)
  --completo    Sin límites
  --dry-run     Solo cuenta y reporta, no escribe en Supabase

Ejemplo piloto:
  php migrar_desde_mysql.php --paso=all --piloto

HELP;
    exit(0);
}

$paso    = $opts['paso'] ?? 'all';
$dryRun  = isset($opts['dry-run']);
$esPiloto = isset($opts['piloto']) || !isset($opts['completo']);

$pasosValidos = ['colonias', 'proveedores', 'productos', 'laboratorio', 'servicios', 'pacientes', 'inventario', 'all'];
if (!in_array($paso, $pasosValidos, true)) {
    fwrite(STDERR, "Paso inválido. Use: " . implode('|', $pasosValidos) . "\n");
    exit(1);
}

// ── Config ────────────────────────────────────────────────────────
$baseDir = dirname(__DIR__);
$configFile = __DIR__ . '/migrar_config.php';
if (!file_exists($configFile)) {
    fwrite(STDERR, "Cree scripts/migrar_config.php desde migrar_config.example.php\n");
    exit(1);
}
$config = require $configFile;

// Cargar .env.local
$envPath = $baseDir . '/.env.local';
if (file_exists($envPath)) {
    foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $_ENV[trim($k)] = trim($v, " \t\"'");
    }
}

$supaUrl   = $_ENV['NEXT_PUBLIC_SUPABASE_URL'] ?? '';
$pgPass    = $_ENV['DB_PASSWORD'] ?? '';
$projectId = '';
if (preg_match('#https://([^.]+)\.supabase\.co#', $supaUrl, $m)) {
    $projectId = $m[1];
}
if (!$projectId || !$pgPass) {
    fwrite(STDERR, "Faltan NEXT_PUBLIC_SUPABASE_URL o DB_PASSWORD en .env.local\n");
    exit(1);
}

$limitePacientes  = $esPiloto ? (int)($config['limite_pacientes'] ?? 50) : 0;
$limiteProductos  = $esPiloto ? (int)($config['limite_productos'] ?? 100) : 0;
$limiteProveedores = $esPiloto ? (int)($config['limite_proveedores'] ?? 0) : 0;
$listaDefault     = (string)($config['lista_precio_default'] ?? '1');
$mapaSucursales   = $config['mapa_sucursales'] ?? [];
$sinCodigoModo    = $config['pacientes_sin_codigo'] ?? 'generar';

// ── Conexiones ────────────────────────────────────────────────────
echo "═══ MIGRACIÓN MySQL → Supabase ═══\n";
echo "Modo: " . ($esPiloto ? 'PILOTO' : 'COMPLETO') . ($dryRun ? ' (DRY-RUN)' : '') . "\n";
echo "Paso: {$paso}\n\n";

echo "MySQL... ";
$mysql = new PDO(
    sprintf('mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $config['mysql_host'], $config['mysql_port'], $config['mysql_db']),
    $config['mysql_user'],
    $config['mysql_pass'],
    [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 30,
    ]
);
echo "OK\n";

echo "Supabase... ";
$pg = new PDO(
    sprintf('pgsql:host=db.%s.supabase.co;port=5432;dbname=postgres', $projectId),
    'postgres',
    $pgPass,
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
);
echo "OK\n\n";

// ── Estado global de la migración ─────────────────────────────────
$stats = [];
$mapColonia   = []; // id viejo → id nuevo
$mapProducto  = []; // id viejo → id nuevo (mismo si preservamos)
$codigosUsados = [];

// ── Utilidades ────────────────────────────────────────────────────
function logStat(string $key, string $msg): void {
    global $stats;
    $stats[$key] = ($stats[$key] ?? 0) + 1;
    echo "  {$msg}\n";
}

function normalizarTexto(?string $s): string {
    if ($s === null || $s === '') return '';
    $s = html_entity_decode($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    return trim(preg_replace('/\s+/u', ' ', $s));
}

function normalizarCodigo(?string $codigo): string {
    $c = strtoupper(preg_replace('/[\s\-.]/', '', normalizarTexto($codigo)));
    return $c;
}

function mapGenero(?string $g): ?string {
    $g = mb_strtolower(normalizarTexto($g));
    if ($g === '') return null;
    if (str_contains($g, 'masc') || $g === 'm') return 'M';
    if (str_contains($g, 'fem') || $g === 'f') return 'F';
    return 'O';
}

function mapTipoCliente(?string $t): string {
    return (normalizarTexto($t) === 'empresa') ? 'empresa' : 'persona';
}

function toNum(?string $v): float {
    if ($v === null || $v === '') return 0.0;
    return (float) str_replace(',', '.', $v);
}

function toInt(?string $v): int {
    if ($v === null || $v === '') return 0;
    return (int) round((float) str_replace(',', '.', $v));
}

/** PDO+pgsql convierte false a "" — usar strings true/false para columnas BOOLEAN */
function esAntibiotico(?string $valor): string {
    $s = strtoupper(normalizarTexto($valor ?? ''));
    return in_array($s, ['SI', 'S', '1', 'TRUE', 'YES'], true) ? 'true' : 'false';
}

function fechaValida(?string $f): ?string {
    if (!$f || $f === '0000-00-00' || $f === '0000-00-00 00:00:00') return null;
    return substr($f, 0, 10);
}

function debeEjecutar(string $nombre, string $pasoActual): bool {
    return $pasoActual === 'all' || $pasoActual === $nombre;
}

function resyncSequence(PDO $pg, string $tabla, string $col = 'id'): void {
    $pg->exec("SELECT setval(pg_get_serial_sequence('{$tabla}', '{$col}'), COALESCE((SELECT MAX({$col}) FROM {$tabla}), 1))");
}

// ── 1. COLONIAS ───────────────────────────────────────────────────
function migrarColonias(PDO $mysql, PDO $pg, bool $dryRun): void {
    global $mapColonia;
    echo "▶ Colonias\n";

    $filas = $mysql->query('SELECT id, nombre FROM colonia ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    $stmtBuscar = $pg->prepare('SELECT id FROM colonias WHERE nombre = ? LIMIT 1');
    $stmtInsert = $pg->prepare('INSERT INTO colonias (nombre, activo) VALUES (?, TRUE) RETURNING id');

    foreach ($filas as $f) {
        $nombre = normalizarTexto($f['nombre'] ?? '');
        if ($nombre === '' || $nombre === '1' || strlen($nombre) < 2) {
            logStat('colonias_omitidas', "Omitida colonia basura id={$f['id']}: «{$f['nombre']}»");
            continue;
        }

        $stmtBuscar->execute([$nombre]);
        $existente = $stmtBuscar->fetchColumn();

        if ($existente) {
            $mapColonia[(string)$f['id']] = (int)$existente;
            logStat('colonias_existentes', "Ya existe: {$nombre} → id {$existente}");
            continue;
        }

        if ($dryRun) {
            logStat('colonias_nuevas', "[DRY] Insertaría: {$nombre}");
            $mapColonia[(string)$f['id']] = (int)$f['id'];
            continue;
        }

        $stmtInsert->execute([$nombre]);
        $nuevoId = (int)$stmtInsert->fetchColumn();
        $mapColonia[(string)$f['id']] = $nuevoId;
        logStat('colonias_insertadas', "Insertada: {$nombre} → id {$nuevoId}");
    }

    if (!$dryRun) resyncSequence($pg, 'colonias');
    echo "  Mapa colonias: " . count($mapColonia) . " entradas\n\n";
}

// ── 2. PROVEEDORES ────────────────────────────────────────────────
function migrarProveedores(PDO $mysql, PDO $pg, bool $dryRun, int $limite): void {
    echo "▶ Proveedores\n";

    $sql = 'SELECT * FROM proveedor ORDER BY id';
    if ($limite > 0) $sql .= " LIMIT {$limite}";
    $filas = $mysql->query($sql)->fetchAll(PDO::FETCH_ASSOC);

    $stmt = $pg->prepare('
        INSERT INTO proveedores (id, codigo, nombre, direccion, telefono1, telefono2, correo, vendedor, nota, activo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
        ON CONFLICT (id) DO UPDATE SET
            nombre = EXCLUDED.nombre,
            direccion = EXCLUDED.direccion,
            telefono1 = EXCLUDED.telefono1,
            correo = EXCLUDED.correo
    ');

    foreach ($filas as $f) {
        $nombre = normalizarTexto($f['nombre'] ?? '');
        if ($nombre === '' || $nombre === '1') {
            logStat('proveedores_omitidos', "Omitido proveedor id={$f['id']} (nombre inválido)");
            continue;
        }

        if ($dryRun) {
            logStat('proveedores_ok', "[DRY] {$nombre}");
            continue;
        }

        $stmt->execute([
            (int)$f['id'],
            normalizarTexto($f['codigo'] ?? '') ?: null,
            $nombre,
            normalizarTexto($f['dir'] ?? '') ?: null,
            normalizarTexto($f['tel1'] ?? '') ?: null,
            normalizarTexto($f['tel2'] ?? '') ?: null,
            normalizarTexto($f['correo'] ?? '') ?: null,
            normalizarTexto($f['vendedor'] ?? '') ?: null,
            normalizarTexto($f['nota'] ?? '') ?: null,
        ]);
        logStat('proveedores_ok', "OK id={$f['id']} {$nombre}");
    }

    if (!$dryRun) resyncSequence($pg, 'proveedores');
    echo "\n";
}

// ── 3. PRODUCTOS ──────────────────────────────────────────────────
function migrarProductos(PDO $mysql, PDO $pg, bool $dryRun, int $limite, string $listaDefault): void {
    global $mapProducto, $codigosUsados;
    echo "▶ Productos (medicamentos / insumos)\n";

    // Catálogo unidades/categorías
    $confi = [];
    foreach ($mysql->query('SELECT id, nombre, tabla FROM pro_confi')->fetchAll(PDO::FETCH_ASSOC) as $c) {
        $confi[(string)$c['id']] = normalizarTexto($c['nombre']);
    }

    // Precios lista general
    $precios = [];
    foreach ($mysql->query("SELECT id_producto, valor FROM pro_precio WHERE id_lista = '{$listaDefault}'")->fetchAll(PDO::FETCH_ASSOC) as $p) {
        $precios[(string)$p['id_producto']] = toNum($p['valor']);
    }

    $sql = 'SELECT * FROM producto ORDER BY id';
    if ($limite > 0) $sql .= " LIMIT {$limite}";
    $filas = $mysql->query($sql)->fetchAll(PDO::FETCH_ASSOC);

    $stmt = $pg->prepare('
        INSERT INTO productos (id, codigo, nombre, nombre_generico, laboratorio, categoria, unidad, tipo,
                               es_antibiotico, costo, precio_venta, activo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::boolean, ?, ?, TRUE)
        ON CONFLICT (id) DO UPDATE SET
            codigo = EXCLUDED.codigo,
            nombre = EXCLUDED.nombre,
            nombre_generico = EXCLUDED.nombre_generico,
            costo = EXCLUDED.costo,
            precio_venta = EXCLUDED.precio_venta,
            es_antibiotico = EXCLUDED.es_antibiotico
        RETURNING id
    ');

    foreach ($filas as $f) {
        $idViejo = (string)$f['id'];
        $nombre  = normalizarTexto($f['nombre'] ?? '');
        if ($nombre === '') {
            logStat('productos_omitidos', "Omitido producto id={$idViejo} sin nombre");
            continue;
        }

        $codigo = normalizarCodigo($f['codigo'] ?? '');
        if ($codigo === '') $codigo = 'PROD-' . $idViejo;
        if (isset($codigosUsados[$codigo])) $codigo .= '-D' . $idViejo;
        $codigosUsados[$codigo] = true;

        $unidad    = $confi[(string)($f['unidad'] ?? '')] ?? 'Unidad';
        $categoria = $confi[(string)($f['categoria'] ?? '')] ?? 'Medicamentos';
        $tipoRaw   = normalizarTexto($f['tipo'] ?? 'Medicamento');
        $tipo      = in_array($tipoRaw, ['Medicamento', 'Producto', 'Insumo'], true) ? $tipoRaw : 'Medicamento';
        $esAb      = esAntibiotico($f['antibiotico'] ?? null);
        $costo     = toNum($f['costo'] ?? '0');
        $precio    = $precios[$idViejo] ?? $costo;

        if ($dryRun) {
            $mapProducto[$idViejo] = (int)$f['id'];
            logStat('productos_ok', "[DRY] {$codigo} — {$nombre}");
            continue;
        }

        try {
            $stmt->execute([
                (int)$f['id'], $codigo, $nombre,
                normalizarTexto($f['generico'] ?? '') ?: null,
                normalizarTexto($f['laboratorio'] ?? '') ?: null,
                $categoria, $unidad, $tipo, $esAb, $costo, $precio,
            ]);
            $nuevoId = (int)$stmt->fetchColumn();
            $mapProducto[$idViejo] = $nuevoId;
            logStat('productos_ok', "OK {$codigo} — " . mb_substr($nombre, 0, 50));
        } catch (PDOException $e) {
            logStat('productos_error', "ERROR id={$idViejo} {$codigo}: " . $e->getMessage());
        }
    }

    if (!$dryRun) resyncSequence($pg, 'productos');
    echo "  Mapa productos: " . count($mapProducto) . " entradas\n\n";
}

// ── 4. SERVICIOS ──────────────────────────────────────────────────
function migrarServicios(PDO $mysql, PDO $pg, bool $dryRun, string $listaDefault): void {
    echo "▶ Servicios\n";

    $precios = [];
    foreach ($mysql->query("SELECT id_servicio, valor FROM servicio_precio WHERE id_lista = '{$listaDefault}'")->fetchAll(PDO::FETCH_ASSOC) as $p) {
        $precios[(string)$p['id_servicio']] = toNum($p['valor']);
    }

    $filas = $mysql->query('SELECT * FROM servicio ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    $stmt = $pg->prepare('
        INSERT INTO servicios (id, nombre, tipo, descripcion, precio, activo)
        VALUES (?, ?, ?, ?, ?, TRUE)
        ON CONFLICT (id) DO UPDATE SET
            nombre = EXCLUDED.nombre,
            tipo = EXCLUDED.tipo,
            precio = EXCLUDED.precio
    ');

    foreach ($filas as $f) {
        $nombre = normalizarTexto($f['nombre'] ?? '');
        if ($nombre === '') continue;

        $precio = $precios[(string)$f['id']] ?? 0;
        $tipo   = normalizarTexto($f['tipo'] ?? '') ?: 'General';
        $nota   = normalizarTexto($f['nota'] ?? '') ?: null;

        if ($dryRun) {
            logStat('servicios_ok', "[DRY] {$nombre} — L {$precio}");
            continue;
        }

        try {
            $stmt->execute([(int)$f['id'], $nombre, $tipo, $nota, $precio]);
            logStat('servicios_ok', "OK {$nombre}");
        } catch (PDOException $e) {
            logStat('servicios_error', "ERROR {$nombre}: " . $e->getMessage());
        }
    }

    if (!$dryRun) resyncSequence($pg, 'servicios');
    echo "\n";
}

// ── 5. PACIENTES ──────────────────────────────────────────────────
function migrarPacientes(PDO $mysql, PDO $pg, bool $dryRun, int $limite, string $sinCodigoModo): void {
    global $mapColonia, $codigosUsados;
    echo "▶ Pacientes\n";

    $sql = 'SELECT * FROM cliente ORDER BY id';
    if ($limite > 0) $sql .= " LIMIT {$limite}";
    $filas = $mysql->query($sql)->fetchAll(PDO::FETCH_ASSOC);

    $stmtPac = $pg->prepare('
        INSERT INTO pacientes (id, codigo, tipo, nombre, apellido1, apellido2, genero, fecha_nac,
            nombre_empresa, rtn_empresa, telefono, celular, correo, direccion, colonia_id,
            lista_id, puntos, nota, responsable, parentesco, activo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
        ON CONFLICT (id) DO UPDATE SET
            codigo = EXCLUDED.codigo,
            nombre = EXCLUDED.nombre,
            apellido1 = EXCLUDED.apellido1,
            celular = EXCLUDED.celular,
            correo = EXCLUDED.correo,
            direccion = EXCLUDED.direccion,
            colonia_id = EXCLUDED.colonia_id
        RETURNING id
    ');

    $idsMigrados = [];

    foreach ($filas as $f) {
        $idViejo = (int)$f['id'];
        $codigo  = normalizarCodigo($f['codigo'] ?? '');

        if ($codigo === '') {
            if ($sinCodigoModo === 'omitir') {
                logStat('pacientes_omitidos', "Sin código id={$idViejo} — omitido");
                continue;
            }
            $codigo = 'LEGACY-' . $idViejo;
        }

        if (isset($codigosUsados[$codigo])) {
            logStat('pacientes_duplicados', "Código duplicado {$codigo} id={$idViejo} — omitido");
            continue;
        }
        $codigosUsados[$codigo] = true;

        // Colonia: campo colonia o dir numérico
        $coloniaId = null;
        $refColonia = normalizarTexto($f['colonia'] ?? '');
        if ($refColonia !== '' && isset($mapColonia[$refColonia])) {
            $coloniaId = $mapColonia[$refColonia];
        } elseif (ctype_digit(normalizarTexto($f['dir'] ?? '')) && isset($mapColonia[normalizarTexto($f['dir'])])) {
            $coloniaId = $mapColonia[normalizarTexto($f['dir'])];
        }

        $listaId = (int)($f['lista'] ?? 1);
        if ($listaId < 1 || $listaId > 3) $listaId = 1;

        $nombre = normalizarTexto($f['nombre'] ?? '') ?: 'SIN NOMBRE';
        $ap1    = normalizarTexto($f['apellido1'] ?? '') ?: '—';

        if ($dryRun) {
            $idsMigrados[] = $idViejo;
            logStat('pacientes_ok', "[DRY] {$codigo} — {$nombre} {$ap1}");
            continue;
        }

        try {
            $stmtPac->execute([
                $idViejo, $codigo, mapTipoCliente($f['tipo_cliente'] ?? null),
                $nombre, $ap1, normalizarTexto($f['apellido2'] ?? '') ?: null,
                mapGenero($f['genero'] ?? null), fechaValida($f['fechan'] ?? null),
                normalizarTexto($f['nombre_empresa'] ?? '') ?: null,
                normalizarTexto($f['rtn_empresa'] ?? '') ?: null,
                normalizarTexto($f['tel'] ?? '') ?: null,
                normalizarTexto($f['cel'] ?? '') ?: null,
                normalizarTexto($f['correo'] ?? '') ?: null,
                normalizarTexto($f['dir'] ?? '') ?: null,
                $coloniaId, $listaId, toInt($f['puntos'] ?? '0'),
                normalizarTexto($f['nota'] ?? '') ?: null,
                normalizarTexto($f['responsable'] ?? '') ?: null,
                normalizarTexto($f['parentesco'] ?? '') ?: null,
            ]);
            $idsMigrados[] = $idViejo;
            logStat('pacientes_ok', "OK {$codigo} — {$nombre} {$ap1}");
        } catch (PDOException $e) {
            logStat('pacientes_error', "ERROR id={$idViejo} {$codigo}: " . $e->getMessage());
        }
    }

    // Antecedentes
    if (!empty($idsMigrados) && !$dryRun) {
        migrarAntecedentes($mysql, $pg, $idsMigrados);
    } elseif ($dryRun) {
        echo "  [DRY] Antecedentes se migrarían para " . count($idsMigrados) . " pacientes\n";
    }

    if (!$dryRun) resyncSequence($pg, 'pacientes');
    echo "\n";
}

function migrarAntecedentes(PDO $mysql, PDO $pg, array $idsPacientes): void {
    echo "  → Antecedentes\n";
    $in = implode(',', array_map('intval', $idsPacientes));

    $stmtA = $pg->prepare('
        INSERT INTO paciente_antecedentes (paciente_id, personal, alergias, familiares, hospitalario)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (paciente_id) DO UPDATE SET
            personal = EXCLUDED.personal,
            alergias = EXCLUDED.alergias,
            familiares = EXCLUDED.familiares,
            hospitalario = EXCLUDED.hospitalario
    ');

    foreach ($mysql->query("SELECT * FROM cliente_antecedente WHERE id_cliente IN ({$in})")->fetchAll(PDO::FETCH_ASSOC) as $a) {
        $pid = (int)$a['id_cliente'];
        if (!in_array($pid, $idsPacientes, true)) continue;
        $stmtA->execute([
            $pid,
            normalizarTexto($a['personal'] ?? '') ?: null,
            normalizarTexto($a['alergico'] ?? '') ?: null,
            normalizarTexto($a['familia'] ?? '') ?: null,
            normalizarTexto($a['hospitalario'] ?? '') ?: null,
        ]);
        logStat('antecedentes_ok', "Antecedentes paciente {$pid}");
    }

    $stmtG = $pg->prepare('
        INSERT INTO paciente_antecedentes_go (paciente_id, gestas, partos, hijos_vivos, gemelares, cesareas, abortos, hijos_muertos)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (paciente_id) DO UPDATE SET
            gestas = EXCLUDED.gestas, partos = EXCLUDED.partos
    ');

    foreach ($mysql->query("SELECT * FROM cliente_antecedenteg WHERE id_cliente IN ({$in})")->fetchAll(PDO::FETCH_ASSOC) as $g) {
        $pid = (int)$g['id_cliente'];
        if (!in_array($pid, $idsPacientes, true)) continue;
        $stmtG->execute([
            $pid,
            toInt($g['gestas'] ?? '0'), toInt($g['partos'] ?? '0'),
            toInt($g['hvivos'] ?? '0'), toInt($g['gemelares'] ?? '0'),
            toInt($g['cesareas'] ?? '0'), toInt($g['abortos'] ?? '0'),
            toInt($g['hmuertos'] ?? '0'),
        ]);
        logStat('antecedentes_go_ok', "Antec. GO paciente {$pid}");
    }
}

// ── 6. LABORATORIO (catálogo de pruebas + precios) ────────────────
function migrarLaboratorio(PDO $mysql, PDO $pg, bool $dryRun, string $listaDefault): void {
    echo "▶ Catálogo de laboratorio\n";

    $exists = $pg->query("SELECT to_regclass('public.laboratorio_info')")->fetchColumn();
    if (!$exists) {
        echo "  [ERROR] Falta tabla laboratorio_info en Supabase.\n";
        echo "  Ejecute en SQL Editor: schema_postgresql.sql (sección laboratorio) o migración 004.\n\n";
        return;
    }

    // Precios lista general (para rellenar costo si viene vacío)
    $preciosLista = [];
    foreach ($mysql->query("SELECT id_prueba, valor FROM laboratorio_valor WHERE id_lista = '{$listaDefault}'")->fetchAll(PDO::FETCH_ASSOC) as $p) {
        $v = toNum($p['valor'] ?? '0');
        if ($v > 0) $preciosLista[(string)$p['id_prueba']] = $v;
    }

    $filas = $mysql->query('SELECT * FROM laboratorio_info ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);

    $stmtInfo = $pg->prepare('
        INSERT INTO laboratorio_info (id, nombre, description, color, nota, dias, costo, comision, activo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)
        ON CONFLICT (id) DO UPDATE SET
            nombre = EXCLUDED.nombre,
            description = EXCLUDED.description,
            color = EXCLUDED.color,
            nota = EXCLUDED.nota,
            dias = EXCLUDED.dias,
            costo = EXCLUDED.costo,
            comision = EXCLUDED.comision,
            activo = TRUE
    ');

    foreach ($filas as $f) {
        $idViejo = (string)$f['id'];
        $nombre  = normalizarTexto($f['nombre'] ?? '');
        if ($nombre === '') {
            logStat('lab_omitidos', "Omitida prueba id={$idViejo} sin nombre");
            continue;
        }

        $costo = toNum($f['costo'] ?? '0');
        if ($costo <= 0 && isset($preciosLista[$idViejo])) {
            $costo = $preciosLista[$idViejo];
        }

        $dias = (string) toInt($f['dias'] ?? '1');
        $comision = toNum((string)($f['comision'] ?? '0'));

        if ($dryRun) {
            logStat('lab_ok', "[DRY] {$nombre}");
            continue;
        }

        try {
            $stmtInfo->execute([
                (int)$f['id'],
                $nombre,
                normalizarTexto($f['description'] ?? '') ?: null,
                normalizarTexto($f['color'] ?? '') ?: null,
                normalizarTexto($f['nota'] ?? '') ?: null,
                $dias,
                $costo,
                $comision,
            ]);
            logStat('lab_ok', "OK {$nombre}");
        } catch (PDOException $e) {
            logStat('lab_error', "ERROR id={$idViejo}: " . $e->getMessage());
        }
    }

    if (!$dryRun) resyncSequence($pg, 'laboratorio_info');

    // Precios por lista de precio
    echo "  → Precios (laboratorio_valor)\n";
    $stmtVal = $pg->prepare('
        INSERT INTO laboratorio_valor (id, id_prueba, id_lista, valor)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
            id_prueba = EXCLUDED.id_prueba,
            id_lista = EXCLUDED.id_lista,
            valor = EXCLUDED.valor
    ');

    foreach ($mysql->query('SELECT * FROM laboratorio_valor ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) as $v) {
        $idPrueba = (int)($v['id_prueba'] ?? 0);
        $idLista  = (int)($v['id_lista'] ?? 0);
        if ($idPrueba < 1 || $idLista < 1) continue;

        $valor = toNum($v['valor'] ?? '0');

        if ($dryRun) {
            logStat('lab_precio_ok', "[DRY] prueba {$idPrueba} lista {$idLista} = {$valor}");
            continue;
        }

        try {
            $stmtVal->execute([(int)$v['id'], $idPrueba, $idLista, $valor]);
            logStat('lab_precio_ok', "Precio prueba {$idPrueba} lista {$idLista}");
        } catch (PDOException $e) {
            logStat('lab_precio_error', "ERROR valor id={$v['id']}: " . $e->getMessage());
        }
    }

    if (!$dryRun) resyncSequence($pg, 'laboratorio_valor');

    // Insumos por prueba (requiere productos migrados)
    $hasInsumo = $pg->query("SELECT to_regclass('public.laboratorio_insumo')")->fetchColumn();
    if ($hasInsumo) {
        echo "  → Insumos por prueba\n";
        $stmtIns = $pg->prepare('
            INSERT INTO laboratorio_insumo (id, prueba_id, producto_id, cantidad)
            VALUES (?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                prueba_id = EXCLUDED.prueba_id,
                producto_id = EXCLUDED.producto_id,
                cantidad = EXCLUDED.cantidad
        ');

        foreach ($mysql->query('SELECT * FROM laboratorio_insumo ORDER BY id')->fetchAll(PDO::FETCH_ASSOC) as $ins) {
            $pruebaId = (int)($ins['id_laboratorio'] ?? 0);
            $prodId   = (int)($ins['id_producto'] ?? 0);
            $cant     = toNum($ins['cant'] ?? '1');
            if ($pruebaId < 1 || $prodId < 1) continue;

            if ($dryRun) {
                logStat('lab_insumo_ok', "[DRY] prueba {$pruebaId} → producto {$prodId}");
                continue;
            }

            try {
                $stmtIns->execute([(int)$ins['id'], $pruebaId, $prodId, $cant]);
                logStat('lab_insumo_ok', "Insumo prueba {$pruebaId} prod {$prodId}");
            } catch (PDOException $e) {
                logStat('lab_insumo_error', "ERROR insumo id={$ins['id']}: " . $e->getMessage());
            }
        }
        if (!$dryRun) resyncSequence($pg, 'laboratorio_insumo');
    }

    echo "\n";
}

// ── 7. INVENTARIO ─────────────────────────────────────────────────
function migrarInventario(PDO $mysql, PDO $pg, bool $dryRun, array $mapaSucursales, int $limiteProductos): void {
    global $mapProducto;
    echo "▶ Inventario (stock)\n";

    if (empty($mapProducto)) {
        // Cargar mapa desde Supabase si productos ya migrados
        foreach ($pg->query('SELECT id FROM productos')->fetchAll(PDO::FETCH_COLUMN) as $pid) {
            $mapProducto[(string)$pid] = (int)$pid;
        }
    }

    $sql = 'SELECT * FROM contenido ORDER BY id';
    $filas = $mysql->query($sql)->fetchAll(PDO::FETCH_ASSOC);

    $stmt = $pg->prepare('
        INSERT INTO inventario (producto_id, sucursal_id, lote, fecha_vencimiento, cantidad)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (producto_id, sucursal_id, lote, fecha_vencimiento)
        DO UPDATE SET cantidad = EXCLUDED.cantidad
    ');

    foreach ($filas as $f) {
        $idProd = (string)($f['id_producto'] ?? '');
        $idSuc  = (string)($f['id_sucursal'] ?? '');

        if (!isset($mapProducto[$idProd])) {
            if ($limiteProductos > 0) continue; // piloto: solo stock de productos migrados
            logStat('inventario_omitido', "Producto {$idProd} no migrado");
            continue;
        }

        $sucursalNueva = $mapaSucursales[$idSuc] ?? null;
        if ($sucursalNueva === null) {
            logStat('inventario_omitido', "Sucursal {$idSuc} sin mapeo en migrar_config.php");
            continue;
        }

        $cant = toInt($f['cant'] ?? '0');
        $lote = normalizarTexto($f['lote'] ?? '') ?: '';
        $fv   = fechaValida($f['fechav'] ?? null);

        if ($dryRun) {
            logStat('inventario_ok', "[DRY] prod {$idProd} suc {$idSuc}→{$sucursalNueva} cant {$cant}");
            continue;
        }

        try {
            $stmt->execute([$mapProducto[$idProd], $sucursalNueva, $lote, $fv, $cant]);
            logStat('inventario_ok', "OK prod {$idProd} suc {$sucursalNueva} cant {$cant}");
        } catch (PDOException $e) {
            logStat('inventario_error', "ERROR prod {$idProd}: " . $e->getMessage());
        }
    }
    echo "\n";
}

// ── Verificación previa ───────────────────────────────────────────
echo "── Verificación Supabase ──\n";
$tablasReq = ['sucursales', 'listas_precio', 'colonias', 'pacientes', 'productos', 'inventario', 'proveedores', 'servicios', 'laboratorio_info', 'laboratorio_valor'];
foreach ($tablasReq as $t) {
    $exists = $pg->query("SELECT to_regclass('public.{$t}')")->fetchColumn();
    if (!$exists) {
        fwrite(STDERR, "Falta tabla {$t}. Ejecute migraciones 001–045 en Supabase.\n");
        exit(1);
    }
}
$sucCount = (int)$pg->query('SELECT COUNT(*) FROM sucursales')->fetchColumn();
echo "Sucursales en Supabase: {$sucCount}\n";
if (empty($mapaSucursales)) {
    echo "AVISO: mapa_sucursales vacío en migrar_config.php — inventario no se migrará.\n";
}
echo "\n";

// ── Ejecutar pasos ────────────────────────────────────────────────
if (!$dryRun) {
    $pg->exec("SET session_replication_role = 'replica'");
}

try {
    if (debeEjecutar('colonias', $paso))    migrarColonias($mysql, $pg, $dryRun);
    if (debeEjecutar('proveedores', $paso)) migrarProveedores($mysql, $pg, $dryRun, $limiteProveedores);
    if (debeEjecutar('productos', $paso))   migrarProductos($mysql, $pg, $dryRun, $limiteProductos, $listaDefault);
    if (debeEjecutar('laboratorio', $paso)) migrarLaboratorio($mysql, $pg, $dryRun, $listaDefault);
    if (debeEjecutar('servicios', $paso))   migrarServicios($mysql, $pg, $dryRun, $listaDefault);
    if (debeEjecutar('pacientes', $paso))   migrarPacientes($mysql, $pg, $dryRun, $limitePacientes, $sinCodigoModo);
    if (debeEjecutar('inventario', $paso))  migrarInventario($mysql, $pg, $dryRun, $mapaSucursales, $limiteProductos);
} finally {
    if (!$dryRun) {
        $pg->exec("SET session_replication_role = 'origin'");
    }
}

// ── Resumen ───────────────────────────────────────────────────────
echo "═══ RESUMEN ═══\n";
foreach ($stats as $k => $v) {
    if ($v > 0) echo str_pad($k, 28) . $v . "\n";
}
echo "\nPróximos pasos:\n";
echo "  1. Supabase → Table Editor: revisar pacientes, productos, inventario\n";
echo "  2. App → Expediente: buscar un paciente migrado\n";
echo "  3. App → Inventario / Ventas: verificar stock y precios\n";
echo "  4. Si el piloto OK: php migrar_desde_mysql.php --paso=all --completo\n";
