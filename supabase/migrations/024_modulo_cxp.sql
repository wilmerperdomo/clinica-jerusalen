-- ═══════════════════════════════════════════════════════════════
-- 024_modulo_cxp.sql — Registra módulo CXP en RBAC
-- ═══════════════════════════════════════════════════════════════

INSERT INTO modulos (clave, nombre, icono, orden, activo)
VALUES ('cxp', 'Cuentas por Pagar', 'CreditCard', 43, true)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO permisos (modulo_id, accion)
SELECT m.id, 'ver'
FROM   modulos m
WHERE  m.clave = 'cxp'
  AND  NOT EXISTS (
    SELECT 1 FROM permisos p2
    JOIN   modulos m2 ON m2.id = p2.modulo_id
    WHERE  m2.clave = 'cxp' AND p2.accion = 'ver'
  );

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM   roles r, permisos p
JOIN   modulos m ON m.id = p.modulo_id
WHERE  r.nombre IN ('Administrador', 'Enfermera')
  AND  m.clave  = 'cxp'
  AND  p.accion = 'ver'
ON CONFLICT DO NOTHING;
