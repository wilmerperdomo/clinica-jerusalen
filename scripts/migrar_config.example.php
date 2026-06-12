<?php
/**
 * Copie este archivo como migrar_config.php y ajuste los valores.
 * migrar_config.php está en .gitignore — no suba contraseñas al repositorio.
 */

return [
    // ── MySQL (sistema viejo) ─────────────────────────────────────
    'mysql_host' => '127.0.0.1',
    'mysql_port' => 3306,
    'mysql_db'   => 'tnrclham_bd',
    'mysql_user' => 'tnrclham_usu',
    'mysql_pass' => 'CAMBIAR_AQUI',

    // ── Lista de precios en el sistema viejo → listas_precio nuevo ─
    // General = 1 en ambos sistemas (por defecto)
    'lista_precio_default' => 1,

    // ── Mapeo sucursal vieja (id MySQL) → sucursal nueva (id Supabase) ─
    // Ejecute en Supabase: SELECT id, nombre FROM sucursales;
    // y en MySQL: SELECT id, nom, nombre FROM sucursal;
    'mapa_sucursales' => [
        '1' => 1,  // Casa Matriz
        '2' => 1,  // Sucursal #2 → ajuste al id real en Supabase
        '3' => 1,  // Bodega
        '4' => 1,  // Bodega interna
    ],

    // ── Límites modo piloto (0 = sin límite) ───────────────────────
    'limite_pacientes'  => 50,
    'limite_productos'  => 100,
    'limite_proveedores'=> 0,

    // Pacientes sin cédula: 'generar' crea LEGACY-{id}, 'omitir' los salta
    'pacientes_sin_codigo' => 'generar',
];
