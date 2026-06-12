-- ═══════════════════════════════════════════════════════════════
-- REPARAR usuarios creados que no son reconocidos por el sistema
-- Ejecutar en Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. Función de sincronización al login (si no existe)
CREATE OR REPLACE FUNCTION fn_sync_perfil_roles_login()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rol_id INTEGER;
  v_sucursal_id INTEGER;
BEGIN
  SELECT rol_id, sucursal_id INTO v_rol_id, v_sucursal_id
  FROM perfiles WHERE id = auth.uid();

  IF v_rol_id IS NULL THEN
    SELECT id INTO v_sucursal_id FROM sucursales WHERE activo = TRUE ORDER BY id LIMIT 1;
    SELECT id INTO v_rol_id FROM roles WHERE nombre = 'Cajero' LIMIT 1;

    INSERT INTO perfiles (id, nombre, apellido, sucursal_id, rol_id, activo)
    VALUES (
      auth.uid(),
      split_part((SELECT email FROM auth.users WHERE id = auth.uid()), '@', 1),
      '',
      COALESCE(v_sucursal_id, 1),
      v_rol_id,
      TRUE
    )
    ON CONFLICT (id) DO NOTHING;

    SELECT rol_id INTO v_rol_id FROM perfiles WHERE id = auth.uid();
  END IF;

  IF v_rol_id IS NOT NULL THEN
    DELETE FROM perfil_roles WHERE perfil_id = auth.uid();
    INSERT INTO perfil_roles (perfil_id, rol_id)
    VALUES (auth.uid(), v_rol_id)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_sync_perfil_roles_login() TO authenticated;

-- 2. Crear perfil para usuarios Auth SIN fila en perfiles
INSERT INTO perfiles (id, nombre, apellido, sucursal_id, rol_id, activo)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'nombre', split_part(u.email, '@', 1)),
  COALESCE(u.raw_user_meta_data->>'apellido', ''),
  (SELECT id FROM sucursales WHERE activo = TRUE ORDER BY id LIMIT 1),
  (SELECT id FROM roles WHERE nombre = 'Cajero' LIMIT 1),
  TRUE
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM perfiles p WHERE p.id = u.id);

-- 3. Sincronizar perfil_roles para TODOS los usuarios con rol_id
DELETE FROM perfil_roles pr
USING perfiles p
WHERE pr.perfil_id = p.id
  AND (pr.rol_id IS DISTINCT FROM p.rol_id OR pr.rol_id IS NULL);

INSERT INTO perfil_roles (perfil_id, rol_id)
SELECT p.id, p.rol_id
FROM perfiles p
WHERE p.rol_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM perfil_roles pr
    WHERE pr.perfil_id = p.id AND pr.rol_id = p.rol_id
  )
ON CONFLICT DO NOTHING;

-- 4. Activar usuarios desactivados por error
UPDATE perfiles SET activo = TRUE WHERE activo = FALSE;

-- 5. VERIFICAR — lista todos los usuarios y su estado
SELECT
  u.email,
  p.nombre,
  p.apellido,
  r.nombre AS rol,
  s.nombre AS sucursal,
  p.activo,
  CASE
    WHEN p.id IS NULL THEN '❌ Sin perfil'
    WHEN p.rol_id IS NULL THEN '❌ Sin rol'
    WHEN NOT EXISTS (SELECT 1 FROM perfil_roles pr WHERE pr.perfil_id = p.id) THEN '❌ Sin perfil_roles'
    ELSE '✅ OK'
  END AS estado
FROM auth.users u
LEFT JOIN perfiles p ON p.id = u.id
LEFT JOIN roles r ON r.id = p.rol_id
LEFT JOIN sucursales s ON s.id = p.sucursal_id
ORDER BY u.email;
