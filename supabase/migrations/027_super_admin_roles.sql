-- ════════════════════════════════════════════════════════════════

--  SUPER ADMIN vs ADMINISTRADOR

--  Super Admin = control total | Administrador = permisos asignados

-- ════════════════════════════════════════════════════════════════



ALTER TABLE roles ADD COLUMN IF NOT EXISTS es_super_admin BOOLEAN NOT NULL DEFAULT FALSE;



-- Rol Super Administrador (control total)

INSERT INTO roles (nombre, descripcion, es_admin, es_super_admin, color) VALUES

  ('Super Administrador', 'Control total del sistema', TRUE, TRUE, '#1D4ED8')

ON CONFLICT (nombre) DO UPDATE SET

  es_admin       = TRUE,

  es_super_admin = TRUE,

  descripcion    = EXCLUDED.descripcion;



-- Administrador normal: es_admin sí, super admin no

UPDATE roles SET es_admin = TRUE, es_super_admin = FALSE

WHERE nombre = 'Administrador';



-- Asegurar que solo Super Administrador tenga es_super_admin

UPDATE roles SET es_super_admin = FALSE

WHERE nombre != 'Super Administrador' AND es_super_admin = TRUE;



UPDATE roles SET es_super_admin = TRUE

WHERE nombre = 'Super Administrador';



-- Asignar admin@clinica.com al Super Administrador

UPDATE perfiles SET rol_id = (SELECT id FROM roles WHERE nombre = 'Super Administrador' LIMIT 1)

WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@clinica.com' LIMIT 1);



INSERT INTO perfil_roles (perfil_id, rol_id)

SELECT p.id, r.id

FROM perfiles p

JOIN auth.users u ON u.id = p.id

CROSS JOIN roles r

WHERE u.email = 'admin@clinica.com' AND r.nombre = 'Super Administrador'

ON CONFLICT DO NOTHING;

-- El rol Administrador ya no hereda todos los permisos automáticamente.
-- El Super Administrador los asigna en Configuración → Permisos.
DELETE FROM rol_permisos
WHERE rol_id = (SELECT id FROM roles WHERE nombre = 'Administrador' LIMIT 1);

