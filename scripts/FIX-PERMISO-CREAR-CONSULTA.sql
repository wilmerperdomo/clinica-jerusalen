-- ═══════════════════════════════════════════════════════════════
--  FIX — Permiso configurable "crear consulta"
--  El botón "Nueva Consulta" se controla por el permiso consultas.crear.
--  Ejecutar en: Supabase → SQL Editor → New query → Run
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

-- Verificar qué roles pueden crear consultas:
SELECT r.nombre AS rol
FROM rol_permisos rp
JOIN roles r ON r.id = rp.rol_id
JOIN permisos p ON p.id = rp.permiso_id
JOIN modulos m ON m.id = p.modulo_id
WHERE m.clave = 'consultas' AND p.accion = 'crear'
ORDER BY r.nombre;
