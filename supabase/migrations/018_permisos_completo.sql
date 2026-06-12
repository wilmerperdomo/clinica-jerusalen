-- ════════════════════════════════════════════════════════════════
--  PERMISOS COMPLETO — agregar módulos nuevos + permisos Enfermera
-- ════════════════════════════════════════════════════════════════

-- 1. Agregar módulos que faltan
INSERT INTO modulos (clave, nombre, icono, orden) VALUES
  ('agenda',      'Agenda',           'CalendarDays', 1),
  ('expediente',  'Expediente',       'BookOpen',     4),
  ('facturacion', 'Facturación',      'FileText',     12)
ON CONFLICT (clave) DO UPDATE SET nombre = EXCLUDED.nombre, orden = EXCLUDED.orden;

-- Actualizar orden de módulos existentes
UPDATE modulos SET orden = 0  WHERE clave = 'dashboard';
UPDATE modulos SET orden = 2  WHERE clave = 'consultas';
UPDATE modulos SET orden = 3  WHERE clave = 'pacientes';
UPDATE modulos SET orden = 5  WHERE clave = 'laboratorio';
UPDATE modulos SET orden = 6  WHERE clave = 'inventario';
UPDATE modulos SET orden = 7  WHERE clave = 'productos';
UPDATE modulos SET orden = 8  WHERE clave = 'compras';
UPDATE modulos SET orden = 9  WHERE clave = 'ventas';
UPDATE modulos SET orden = 10 WHERE clave = 'membresias';
UPDATE modulos SET orden = 11 WHERE clave = 'reportes';
UPDATE modulos SET orden = 13 WHERE clave = 'configuracion';

-- 2. Crear permisos para módulos nuevos
INSERT INTO permisos (modulo_id, accion, descripcion)
SELECT m.id, a.accion, m.nombre || ' — ' || a.accion
FROM modulos m
CROSS JOIN (VALUES ('ver'),('crear'),('editar'),('eliminar'),('imprimir'),('exportar')) AS a(accion)
WHERE m.clave IN ('agenda', 'expediente', 'facturacion')
ON CONFLICT (modulo_id, accion) DO NOTHING;

-- 3. Administrador: agregar permisos de módulos nuevos
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.nombre = 'Administrador'
ON CONFLICT DO NOTHING;

-- 4. Médico: + agenda + expediente
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON true
JOIN modulos m ON m.id = p.modulo_id
WHERE r.nombre = 'Médico'
AND   m.clave IN ('dashboard','agenda','consultas','pacientes','laboratorio','expediente')
AND   p.accion IN ('ver','crear','editar','imprimir')
ON CONFLICT DO NOTHING;

-- 5. Enfermera: agenda, consultas, pacientes, lab, inventario, ventas, membresias, expediente
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON true
JOIN modulos m ON m.id = p.modulo_id
WHERE r.nombre = 'Enfermera'
AND   m.clave IN ('dashboard','agenda','consultas','pacientes','laboratorio','expediente','inventario','productos','ventas','membresias')
AND   p.accion IN ('ver','crear','editar','imprimir')
ON CONFLICT DO NOTHING;

-- 6. Política para que admin pueda modificar rol_permisos
DROP POLICY IF EXISTS "admin_gestiona_rol_permisos" ON rol_permisos;
CREATE POLICY "admin_gestiona_rol_permisos"
  ON rol_permisos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "admin_gestiona_permisos" ON permisos;
CREATE POLICY "admin_gestiona_permisos"
  ON permisos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
