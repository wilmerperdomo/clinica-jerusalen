-- ════════════════════════════════════════════════════════════════
--  CORREGIR SUCURSAL EN PERFILES (después de migración 027)
-- ════════════════════════════════════════════════════════════════

-- admin@clinica.com → Super Admin + sucursal principal
UPDATE perfiles
SET
  rol_id = (SELECT id FROM roles WHERE nombre = 'Super Administrador' LIMIT 1),
  sucursal_id = COALESCE(
    sucursal_id,
    (SELECT id FROM sucursales WHERE activo = TRUE ORDER BY id LIMIT 1)
  )
WHERE id IN (SELECT id FROM auth.users WHERE email = 'admin@clinica.com');

-- Admins sin sucursal → primera sucursal activa
UPDATE perfiles p
SET sucursal_id = (SELECT id FROM sucursales WHERE activo = TRUE ORDER BY id LIMIT 1)
WHERE p.sucursal_id IS NULL
  AND p.rol_id IN (SELECT id FROM roles WHERE es_admin = TRUE OR es_super_admin = TRUE);

-- Verificar
SELECT u.email, p.nombre, r.nombre AS rol, s.nombre AS sucursal
FROM perfiles p
JOIN auth.users u ON u.id = p.id
LEFT JOIN roles r ON r.id = p.rol_id
LEFT JOIN sucursales s ON s.id = p.sucursal_id
ORDER BY u.email;
