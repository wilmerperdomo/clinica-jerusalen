-- ═══════════════════════════════════════════════════════════════
--  058 — Permiso configurable "crear consulta"
--   El botón "Nueva Consulta" ahora se controla por el permiso
--   consultas.crear (Configuración → Permisos → Acciones especiales).
--   - Garantiza que el permiso exista.
--   - Lo concede al rol Médico por defecto (el super admin puede
--     revocarlo o concederlo a otros roles desde la UI).
-- ═══════════════════════════════════════════════════════════════

-- 1. Asegurar que el permiso consultas.crear exista
INSERT INTO permisos (modulo_id, accion, descripcion)
SELECT m.id, 'crear', m.nombre || ' — crear'
FROM modulos m
WHERE m.clave = 'consultas'
ON CONFLICT (modulo_id, accion) DO NOTHING;

-- 2. Conceder "crear consulta" a los roles de tipo Médico por defecto
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN modulos m ON m.clave = 'consultas'
JOIN permisos p ON p.modulo_id = m.id AND p.accion = 'crear'
WHERE (r.nombre ILIKE '%médic%' OR r.nombre ILIKE '%medic%')
ON CONFLICT DO NOTHING;
