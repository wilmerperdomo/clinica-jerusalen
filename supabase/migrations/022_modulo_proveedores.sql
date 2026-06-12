-- ═══════════════════════════════════════════════════════════════
-- 022_modulo_proveedores.sql
-- Registra el módulo Proveedores en la tabla modulos y crea
-- los permisos correspondientes.
-- ═══════════════════════════════════════════════════════════════

-- Agregar módulo si no existe
INSERT INTO modulos (clave, nombre, icono, orden, activo)
VALUES ('proveedores', 'Proveedores', 'Truck', 42, true)
ON CONFLICT (clave) DO NOTHING;

-- Crear permiso 'ver' para el nuevo módulo
INSERT INTO permisos (modulo_id, accion)
SELECT m.id, 'ver'
FROM   modulos m
WHERE  m.clave = 'proveedores'
  AND  NOT EXISTS (
    SELECT 1 FROM permisos p2
    JOIN   modulos m2 ON m2.id = p2.modulo_id
    WHERE  m2.clave = 'proveedores' AND p2.accion = 'ver'
  );

-- Dar acceso a Administrador
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM   roles r, permisos p
JOIN   modulos m ON m.id = p.modulo_id
WHERE  r.nombre = 'Administrador'
  AND  m.clave  = 'proveedores'
  AND  p.accion = 'ver'
ON CONFLICT DO NOTHING;

-- Dar acceso a Enfermera (quien maneja inventario/compras)
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM   roles r, permisos p
JOIN   modulos m ON m.id = p.modulo_id
WHERE  r.nombre = 'Enfermera'
  AND  m.clave  = 'proveedores'
  AND  p.accion = 'ver'
ON CONFLICT DO NOTHING;
