-- Listar todos los perfiles (admins) y confirmar usuarios para login

CREATE OR REPLACE FUNCTION fn_listar_perfiles_admin()
RETURNS TABLE (
  id UUID,
  nombre TEXT,
  apellido TEXT,
  cedula TEXT,
  telefono TEXT,
  sucursal_id INTEGER,
  rol_id INTEGER,
  activo BOOLEAN,
  created_at TIMESTAMPTZ,
  email TEXT,
  rol_nombre TEXT,
  rol_color TEXT,
  rol_es_admin BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.nombre,
    p.apellido,
    p.cedula,
    p.telefono,
    p.sucursal_id,
    p.rol_id,
    p.activo,
    p.created_at,
    u.email,
    r.nombre,
    r.color,
    r.es_admin
  FROM perfiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN roles r ON r.id = p.rol_id
  WHERE fn_usuario_es_admin()
  ORDER BY p.created_at DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION fn_listar_perfiles_admin() TO authenticated;
