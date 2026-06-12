-- ════════════════════════════════════════════════════════════════
--  RESTAURAR PERMISOS DE ROLES
--  La migración 027 vació el rol Administrador; esto lo corrige.
-- ════════════════════════════════════════════════════════════════

-- 1. Administrador: todos los módulos y acciones
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'Administrador'
ON CONFLICT DO NOTHING;

-- 2. Super Administrador: todos los permisos
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'Super Administrador'
ON CONFLICT DO NOTHING;

-- 3. Médico
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON true
JOIN modulos m ON m.id = p.modulo_id
WHERE r.nombre = 'Médico'
  AND m.clave IN ('dashboard','agenda','notificaciones','consultas','pacientes','laboratorio','expediente')
  AND p.accion IN ('ver','crear','editar','imprimir')
ON CONFLICT DO NOTHING;

-- 4. Enfermera
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON true
JOIN modulos m ON m.id = p.modulo_id
WHERE r.nombre = 'Enfermera'
  AND m.clave IN ('dashboard','agenda','notificaciones','consultas','pacientes','laboratorio','expediente','inventario','productos','ventas','membresias','cotizaciones')
  AND p.accion IN ('ver','crear','editar','imprimir')
ON CONFLICT DO NOTHING;

-- 5. Cajero
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON true
JOIN modulos m ON m.id = p.modulo_id
WHERE r.nombre = 'Cajero'
  AND m.clave IN ('dashboard','ventas','pacientes','facturacion','cotizaciones','membresias','reportes')
  AND p.accion IN ('ver','crear','editar','imprimir')
ON CONFLICT DO NOTHING;

-- 6. Farmacéutico
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON true
JOIN modulos m ON m.id = p.modulo_id
WHERE r.nombre = 'Farmacéutico'
  AND m.clave IN ('dashboard','inventario','productos','compras','proveedores','ventas','pacientes')
  AND p.accion IN ('ver','crear','editar','imprimir')
ON CONFLICT DO NOTHING;

-- 7. Planilla y Control Financiero → Super Admin y Administrador
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON true
JOIN modulos m ON m.id = p.modulo_id
WHERE r.nombre IN ('Super Administrador', 'Administrador')
  AND m.clave IN ('planilla', 'control-financiero')
ON CONFLICT DO NOTHING;

-- 8. Asegurar admin@clinica.com como Super Administrador + sucursal principal
UPDATE perfiles
SET
  rol_id = (SELECT id FROM roles WHERE nombre = 'Super Administrador' LIMIT 1),
  sucursal_id = COALESCE(
    sucursal_id,
    (SELECT id FROM sucursales WHERE activo = TRUE ORDER BY id LIMIT 1)
  )
WHERE id IN (SELECT id FROM auth.users WHERE email = 'admin@clinica.com');

-- 9. Cualquier admin sin sucursal → primera sucursal activa
UPDATE perfiles p
SET sucursal_id = (SELECT id FROM sucursales WHERE activo = TRUE ORDER BY id LIMIT 1)
WHERE p.sucursal_id IS NULL
  AND p.rol_id IN (SELECT id FROM roles WHERE es_admin = TRUE OR es_super_admin = TRUE);

INSERT INTO perfil_roles (perfil_id, rol_id)
SELECT p.id, r.id
FROM perfiles p
JOIN auth.users u ON u.id = p.id
CROSS JOIN roles r
WHERE u.email = 'admin@clinica.com'
  AND r.nombre = 'Super Administrador'
ON CONFLICT DO NOTHING;
