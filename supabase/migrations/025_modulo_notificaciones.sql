-- ═══════════════════════════════════════════════════════════════
-- 025_modulo_notificaciones.sql
-- ═══════════════════════════════════════════════════════════════

INSERT INTO modulos (clave, nombre, icono, orden, activo)
VALUES ('notificaciones', 'Notificaciones', 'Bell', 5, true)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO permisos (modulo_id, accion)
SELECT m.id, 'ver'
FROM   modulos m
WHERE  m.clave = 'notificaciones'
  AND  NOT EXISTS (
    SELECT 1 FROM permisos p2
    JOIN   modulos m2 ON m2.id = p2.modulo_id
    WHERE  m2.clave = 'notificaciones' AND p2.accion = 'ver'
  );

-- Todos los roles activos pueden ver notificaciones
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM   roles r, permisos p
JOIN   modulos m ON m.id = p.modulo_id
WHERE  r.nombre IN ('Administrador', 'Enfermera', 'Médico')
  AND  m.clave  = 'notificaciones'
  AND  p.accion = 'ver'
ON CONFLICT DO NOTHING;
