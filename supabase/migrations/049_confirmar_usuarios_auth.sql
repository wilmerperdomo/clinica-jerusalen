-- Confirmar email y reparar usuarios creados desde la app (sin service role)

CREATE OR REPLACE FUNCTION fn_confirmar_usuario_auth(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT fn_usuario_es_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION fn_reparar_usuario_por_email(p_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_rol_id INTEGER;
  v_sucursal_id INTEGER;
BEGIN
  IF NOT fn_usuario_es_admin() THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN 'NO_AUTH: no existe en Authentication';
  END IF;

  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE id = v_user_id;

  SELECT id INTO v_sucursal_id FROM sucursales WHERE activo = TRUE ORDER BY id LIMIT 1;
  SELECT rol_id INTO v_rol_id FROM perfiles WHERE id = v_user_id;

  IF v_rol_id IS NULL THEN
    SELECT id INTO v_rol_id FROM roles WHERE nombre = 'Cajero' LIMIT 1;
  END IF;

  INSERT INTO perfiles (id, nombre, apellido, sucursal_id, rol_id, activo)
  SELECT v_user_id,
    COALESCE(u.raw_user_meta_data->>'nombre', split_part(u.email, '@', 1)),
    COALESCE(u.raw_user_meta_data->>'apellido', ''),
    COALESCE(v_sucursal_id, 1),
    v_rol_id,
    TRUE
  FROM auth.users u WHERE u.id = v_user_id
  ON CONFLICT (id) DO UPDATE SET
    activo = TRUE,
    rol_id = COALESCE(perfiles.rol_id, EXCLUDED.rol_id),
    sucursal_id = COALESCE(perfiles.sucursal_id, EXCLUDED.sucursal_id);

  SELECT rol_id INTO v_rol_id FROM perfiles WHERE id = v_user_id;
  DELETE FROM perfil_roles WHERE perfil_id = v_user_id;
  IF v_rol_id IS NOT NULL THEN
    INSERT INTO perfil_roles (perfil_id, rol_id) VALUES (v_user_id, v_rol_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN 'OK: ' || p_email;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_confirmar_usuario_auth(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_reparar_usuario_por_email(TEXT) TO authenticated;
