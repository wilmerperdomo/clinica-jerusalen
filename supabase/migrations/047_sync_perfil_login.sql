-- Sincronizar perfil_roles al iniciar sesión (sin service role)

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
