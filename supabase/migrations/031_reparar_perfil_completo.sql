-- ════════════════════════════════════════════════════════════════
--  REPARACIÓN COMPLETA DE USUARIOS Y PERFILES
--  Ejecutar UNA VEZ si corriste migraciones sueltas (027, etc.)
-- ════════════════════════════════════════════════════════════════

-- 1. Tabla perfil_roles (la app la usa pero faltaba el CREATE)
CREATE TABLE IF NOT EXISTS perfil_roles (
  perfil_id UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  rol_id    INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (perfil_id, rol_id)
);

ALTER TABLE perfil_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_lee_perfil_roles" ON perfil_roles;
CREATE POLICY "auth_lee_perfil_roles" ON perfil_roles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "admin_gestiona_perfil_roles" ON perfil_roles;
CREATE POLICY "admin_gestiona_perfil_roles" ON perfil_roles FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Columna es_super_admin si falta
ALTER TABLE roles ADD COLUMN IF NOT EXISTS es_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO roles (nombre, descripcion, es_admin, es_super_admin, color) VALUES
  ('Super Administrador', 'Control total del sistema', TRUE, TRUE, '#1D4ED8')
ON CONFLICT (nombre) DO UPDATE SET
  es_admin = TRUE, es_super_admin = TRUE;

UPDATE roles SET es_super_admin = FALSE WHERE nombre != 'Super Administrador';

-- 3. Crear perfil para CADA usuario de Auth que no tenga fila en perfiles
INSERT INTO perfiles (id, nombre, apellido, sucursal_id, rol_id, activo)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'nombre', split_part(u.email, '@', 1)),
  COALESCE(u.raw_user_meta_data->>'apellido', ''),
  (SELECT id FROM sucursales ORDER BY id LIMIT 1),
  (SELECT id FROM roles WHERE nombre = 'Cajero' LIMIT 1),
  TRUE
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM perfiles p WHERE p.id = u.id);

-- 4. admin@clinica.com → Super Admin + sucursal 1
UPDATE perfiles p
SET
  nombre      = COALESCE(p.nombre, 'Administrador'),
  sucursal_id = COALESCE(p.sucursal_id, 1),
  rol_id      = (SELECT id FROM roles WHERE nombre = 'Super Administrador' LIMIT 1),
  activo      = TRUE
FROM auth.users u
WHERE p.id = u.id AND u.email = 'admin@clinica.com';

-- 5. Sincronizar perfil_roles desde perfiles.rol_id
INSERT INTO perfil_roles (perfil_id, rol_id)
SELECT p.id, p.rol_id
FROM perfiles p
WHERE p.rol_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- 6. Permisos Super Admin y Administrador (por si 027 los borró)
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre IN ('Super Administrador', 'Administrador')
ON CONFLICT DO NOTHING;

-- 7. Verificación final
SELECT
  u.id          AS auth_id,
  u.email,
  p.id          AS perfil_id,
  p.nombre,
  r.nombre      AS rol,
  p.sucursal_id,
  s.nombre      AS sucursal,
  CASE WHEN p.id = u.id THEN 'OK' ELSE 'ERROR: IDs no coinciden' END AS estado
FROM auth.users u
LEFT JOIN perfiles p ON p.id = u.id
LEFT JOIN roles r ON r.id = p.rol_id
LEFT JOIN sucursales s ON s.id = p.sucursal_id
ORDER BY u.email;
