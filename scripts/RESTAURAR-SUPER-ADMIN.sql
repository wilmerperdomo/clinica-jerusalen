-- ═══════════════════════════════════════════════════════════════
-- RESTAURAR admin@clinica.com como Super Administrador
-- Ejecutar en Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. Asegurar que existe el rol Super Administrador
INSERT INTO roles (nombre, descripcion, es_admin, es_super_admin, color)
VALUES ('Super Administrador', 'Control total del sistema', TRUE, TRUE, '#1D4ED8')
ON CONFLICT (nombre) DO UPDATE SET
  es_admin = TRUE,
  es_super_admin = TRUE;

UPDATE roles SET es_super_admin = FALSE WHERE nombre != 'Super Administrador';

-- 2. Crear perfil si el usuario existe en Auth pero no en perfiles
INSERT INTO perfiles (id, nombre, apellido, sucursal_id, rol_id, activo)
SELECT
  u.id,
  'Administrador',
  'Sistema',
  (SELECT id FROM sucursales WHERE activo = TRUE ORDER BY id LIMIT 1),
  (SELECT id FROM roles WHERE nombre = 'Super Administrador' LIMIT 1),
  TRUE
FROM auth.users u
WHERE u.email = 'admin@clinica.com'
  AND NOT EXISTS (SELECT 1 FROM perfiles p WHERE p.id = u.id);

-- 3. Restaurar rol Super Admin + sucursal
UPDATE perfiles p
SET
  nombre      = COALESCE(NULLIF(p.nombre, ''), 'Administrador'),
  apellido    = COALESCE(p.apellido, 'Sistema'),
  rol_id      = (SELECT id FROM roles WHERE nombre = 'Super Administrador' LIMIT 1),
  sucursal_id = COALESCE(
    p.sucursal_id,
    (SELECT id FROM sucursales WHERE activo = TRUE ORDER BY id LIMIT 1)
  ),
  activo      = TRUE
FROM auth.users u
WHERE p.id = u.id
  AND u.email = 'admin@clinica.com';

-- 4. Sincronizar perfil_roles (permisos del menú)
DELETE FROM perfil_roles pr
USING auth.users u, perfiles p
WHERE u.email = 'admin@clinica.com'
  AND p.id = u.id
  AND pr.perfil_id = p.id;

INSERT INTO perfil_roles (perfil_id, rol_id)
SELECT p.id, p.rol_id
FROM perfiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'admin@clinica.com'
  AND p.rol_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 5. Verificar resultado
SELECT
  u.email,
  p.nombre,
  r.nombre AS rol,
  r.es_super_admin,
  s.nombre AS sucursal,
  p.activo
FROM auth.users u
LEFT JOIN perfiles p ON p.id = u.id
LEFT JOIN roles r ON r.id = p.rol_id
LEFT JOIN sucursales s ON s.id = p.sucursal_id
WHERE u.email = 'admin@clinica.com';
