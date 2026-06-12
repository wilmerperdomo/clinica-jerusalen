<?php
/**
 * CONFIGURACIÓN — BananaHosting (base en la nube del sistema viejo)
 *
 * Dónde sacar los datos en cPanel de BananaHosting:
 *   - Bases de datos MySQL → nombre de base, usuario, contraseña
 *   - Host: suele ser algo como srvXX.bananahosting.com o el dominio del hosting
 *     (desde su PC NO use "localhost" — eso solo funciona dentro del servidor)
 */

return [
    // ── MySQL en BananaHosting ────────────────────────────────────
    // CAMBIE mysql_host por el host que muestra cPanel (no "localhost")
    'mysql_host' => 'localhost',  // ← REEMPLAZAR: host remoto de BananaHosting
    'mysql_port' => 3306,
    'mysql_db'   => 'tnrclham_bd',      // nombre exacto en cPanel
    'mysql_user' => 'tnrclham_usu',     // usuario MySQL en cPanel
    'mysql_pass' => 'honduras2020',     // contraseña MySQL en cPanel

    'lista_precio_default' => 1,

    // Mapeo sucursal vieja → id en Supabase (SELECT id, nombre FROM sucursales;)
    'mapa_sucursales' => [
        '1' => 1,
        '2' => 1,
        '3' => 1,
        '4' => 1,
    ],

    'limite_pacientes'   => 50,
    'limite_productos'   => 100,
    'limite_proveedores' => 0,
    'pacientes_sin_codigo' => 'generar',
];
