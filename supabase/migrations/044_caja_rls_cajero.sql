-- ═══════════════════════════════════════════════════════════════
--  044 — RLS CAJA: políticas por operador de caja / sucursal
--  Regla de negocio: quien opera caja es Enfermera (cajero = enfermero).
--  La columna cajero_id identifica al usuario que abrió la sesión (auth.uid()).
--  Autorización: permiso módulo ventas/ver (Enfermera) o administrador.
--  Tras cierre: el operador no consulta sesiones cerradas (solo imprime el reporte).
--  Objetivo: cada operador solo mueve SU sesión abierta; admins auditan su sucursal.
-- ═══════════════════════════════════════════════════════════════

-- ── 0. Columnas requeridas (algunas BD no las tienen en cxc) ───

ALTER TABLE cxc
  ADD COLUMN IF NOT EXISTS cajero_id UUID REFERENCES auth.users(id);

ALTER TABLE cxc_abonos
  ADD COLUMN IF NOT EXISTS cajero_id UUID REFERENCES auth.users(id);

ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS cajero_id UUID REFERENCES auth.users(id);

ALTER TABLE caja_sesiones
  ADD COLUMN IF NOT EXISTS cajero_id UUID REFERENCES auth.users(id);

-- ── 1. Funciones auxiliares (SECURITY DEFINER) ─────────────────

CREATE OR REPLACE FUNCTION fn_caja_sucursal_usuario()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.sucursal_id
  FROM perfiles p
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION fn_caja_es_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM perfiles p
    JOIN roles r ON r.id = p.rol_id
    WHERE p.id = auth.uid()
      AND COALESCE(r.es_super_admin, FALSE) = TRUE
  )
  OR EXISTS (
    SELECT 1
    FROM perfil_roles pr
    JOIN roles r ON r.id = pr.rol_id
    WHERE pr.perfil_id = auth.uid()
      AND COALESCE(r.es_super_admin, FALSE) = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION fn_caja_es_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fn_caja_es_super_admin()
  OR EXISTS (
    SELECT 1
    FROM perfiles p
    JOIN roles r ON r.id = p.rol_id
    WHERE p.id = auth.uid()
      AND r.es_admin = TRUE
  )
  OR EXISTS (
    SELECT 1
    FROM perfil_roles pr
    JOIN roles r ON r.id = pr.rol_id
    WHERE pr.perfil_id = auth.uid()
      AND r.es_admin = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION fn_caja_es_enfermera()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM perfiles p
    JOIN roles r ON r.id = p.rol_id
    WHERE p.id = auth.uid()
      AND r.nombre = 'Enfermera'
  )
  OR EXISTS (
    SELECT 1
    FROM perfil_roles pr
    JOIN roles r ON r.id = pr.rol_id
    WHERE pr.perfil_id = auth.uid()
      AND r.nombre = 'Enfermera'
  );
$$;

CREATE OR REPLACE FUNCTION fn_caja_puede_ventas()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT fn_caja_es_admin()
  OR fn_caja_es_enfermera()
  OR EXISTS (
    SELECT 1
    FROM perfiles p
    JOIN rol_permisos rp ON rp.rol_id = p.rol_id
    JOIN permisos perm ON perm.id = rp.permiso_id
    JOIN modulos m ON m.id = perm.modulo_id
    WHERE p.id = auth.uid()
      AND m.clave = 'ventas'
      AND perm.accion = 'ver'
  )
  OR EXISTS (
    SELECT 1
    FROM perfil_roles pr
    JOIN rol_permisos rp ON rp.rol_id = pr.rol_id
    JOIN permisos perm ON perm.id = rp.permiso_id
    JOIN modulos m ON m.id = perm.modulo_id
    WHERE pr.perfil_id = auth.uid()
      AND m.clave = 'ventas'
      AND perm.accion = 'ver'
  );
$$;

CREATE OR REPLACE FUNCTION fn_caja_puede_ver_sucursal(p_sucursal_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    fn_caja_es_super_admin()
    OR p_sucursal_id IS NULL
    OR p_sucursal_id = fn_caja_sucursal_usuario()
    OR fn_caja_sucursal_usuario() IS NULL AND fn_caja_es_admin();
$$;

CREATE OR REPLACE FUNCTION fn_caja_sesion_accesible(p_sesion_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM caja_sesiones s
    WHERE s.id = p_sesion_id
      AND (
        (s.cajero_id = auth.uid() AND s.estado = 'ABIERTA')
        OR (
          fn_caja_es_admin()
          AND fn_caja_puede_ver_sucursal(s.sucursal_id)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION fn_caja_sesion_propia_abierta(p_sesion_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM caja_sesiones s
    WHERE s.id = p_sesion_id
      AND s.cajero_id = auth.uid()
      AND s.estado = 'ABIERTA'
  );
$$;

COMMENT ON FUNCTION fn_caja_es_enfermera() IS 'Operador de caja: rol Enfermera (cajero = enfermero en la clínica)';
COMMENT ON FUNCTION fn_caja_puede_ventas() IS 'Enfermera, permiso ventas/ver o administrador';
COMMENT ON FUNCTION fn_caja_sesion_accesible(INTEGER) IS 'Operador: solo su sesión ABIERTA; admin: cualquier sesión de su sucursal';
COMMENT ON FUNCTION fn_caja_sesion_propia_abierta(INTEGER) IS 'Sesión abierta del operador autenticado (cajero_id = auth.uid())';

-- ── 2. Eliminar políticas anteriores (permisivas y re-ejecución) ─

DROP POLICY IF EXISTS "auth_conceptos_sel"        ON caja_conceptos;
DROP POLICY IF EXISTS "auth_sesiones_all"         ON caja_sesiones;
DROP POLICY IF EXISTS "auth_movimientos_all"      ON caja_movimientos;
DROP POLICY IF EXISTS "auth_cxc_all"              ON cxc;
DROP POLICY IF EXISTS "auth_cxc_abonos_all"       ON cxc_abonos;

DROP POLICY IF EXISTS "caja_conceptos_select"     ON caja_conceptos;
DROP POLICY IF EXISTS "caja_conceptos_admin_write" ON caja_conceptos;
DROP POLICY IF EXISTS "caja_sesiones_select"      ON caja_sesiones;
DROP POLICY IF EXISTS "caja_sesiones_insert"      ON caja_sesiones;
DROP POLICY IF EXISTS "caja_sesiones_update"      ON caja_sesiones;
DROP POLICY IF EXISTS "caja_sesiones_delete_admin" ON caja_sesiones;
DROP POLICY IF EXISTS "caja_movimientos_select"     ON caja_movimientos;
DROP POLICY IF EXISTS "caja_movimientos_insert"   ON caja_movimientos;
DROP POLICY IF EXISTS "caja_movimientos_update_admin" ON caja_movimientos;
DROP POLICY IF EXISTS "caja_movimientos_delete_admin" ON caja_movimientos;
DROP POLICY IF EXISTS "cxc_select"                ON cxc;
DROP POLICY IF EXISTS "cxc_insert"                ON cxc;
DROP POLICY IF EXISTS "cxc_update"                ON cxc;
DROP POLICY IF EXISTS "cxc_delete_admin"          ON cxc;
DROP POLICY IF EXISTS "cxc_abonos_select"         ON cxc_abonos;
DROP POLICY IF EXISTS "cxc_abonos_insert"         ON cxc_abonos;
DROP POLICY IF EXISTS "cxc_abonos_update_admin"   ON cxc_abonos;
DROP POLICY IF EXISTS "cxc_abonos_delete_admin"   ON cxc_abonos;

-- ── 3. caja_conceptos ──────────────────────────────────────────

CREATE POLICY "caja_conceptos_select"
  ON caja_conceptos FOR SELECT TO authenticated
  USING (fn_caja_puede_ventas());

CREATE POLICY "caja_conceptos_admin_write"
  ON caja_conceptos FOR ALL TO authenticated
  USING (fn_caja_es_admin())
  WITH CHECK (fn_caja_es_admin());

-- ── 4. caja_sesiones ───────────────────────────────────────────

CREATE POLICY "caja_sesiones_select"
  ON caja_sesiones FOR SELECT TO authenticated
  USING (
    (cajero_id = auth.uid() AND estado = 'ABIERTA')
    OR (
      fn_caja_es_admin()
      AND fn_caja_puede_ver_sucursal(sucursal_id)
    )
  );

CREATE POLICY "caja_sesiones_insert"
  ON caja_sesiones FOR INSERT TO authenticated
  WITH CHECK (
    fn_caja_puede_ventas()
    AND cajero_id = auth.uid()
    AND estado = 'ABIERTA'
    AND (
      fn_caja_es_admin()
      OR sucursal_id = fn_caja_sucursal_usuario()
    )
  );

CREATE POLICY "caja_sesiones_update"
  ON caja_sesiones FOR UPDATE TO authenticated
  USING (
    (cajero_id = auth.uid() AND estado = 'ABIERTA')
    OR fn_caja_es_admin()
  )
  WITH CHECK (
    cajero_id = auth.uid()
    OR fn_caja_es_admin()
  );

CREATE POLICY "caja_sesiones_delete_admin"
  ON caja_sesiones FOR DELETE TO authenticated
  USING (fn_caja_es_admin());

-- ── 5. caja_movimientos ────────────────────────────────────────

CREATE POLICY "caja_movimientos_select"
  ON caja_movimientos FOR SELECT TO authenticated
  USING (fn_caja_sesion_accesible(sesion_id));

CREATE POLICY "caja_movimientos_insert"
  ON caja_movimientos FOR INSERT TO authenticated
  WITH CHECK (
    fn_caja_puede_ventas()
    AND cajero_id = auth.uid()
    AND fn_caja_sesion_propia_abierta(sesion_id)
  );

CREATE POLICY "caja_movimientos_update_admin"
  ON caja_movimientos FOR UPDATE TO authenticated
  USING (fn_caja_es_admin())
  WITH CHECK (fn_caja_es_admin());

CREATE POLICY "caja_movimientos_delete_admin"
  ON caja_movimientos FOR DELETE TO authenticated
  USING (fn_caja_es_admin());

-- ── 6. cxc ─────────────────────────────────────────────────────

CREATE POLICY "cxc_select"
  ON cxc FOR SELECT TO authenticated
  USING (
    fn_caja_puede_ventas()
    AND fn_caja_puede_ver_sucursal(sucursal_id)
  );

CREATE POLICY "cxc_insert"
  ON cxc FOR INSERT TO authenticated
  WITH CHECK (
    fn_caja_puede_ventas()
    AND fn_caja_puede_ver_sucursal(sucursal_id)
    AND (cajero_id IS NULL OR cajero_id = auth.uid() OR fn_caja_es_admin())
  );

CREATE POLICY "cxc_update"
  ON cxc FOR UPDATE TO authenticated
  USING (
    fn_caja_puede_ventas()
    AND fn_caja_puede_ver_sucursal(sucursal_id)
  )
  WITH CHECK (
    fn_caja_puede_ventas()
    AND fn_caja_puede_ver_sucursal(sucursal_id)
  );

CREATE POLICY "cxc_delete_admin"
  ON cxc FOR DELETE TO authenticated
  USING (fn_caja_es_admin());

-- ── 7. cxc_abonos ──────────────────────────────────────────────

CREATE POLICY "cxc_abonos_select"
  ON cxc_abonos FOR SELECT TO authenticated
  USING (
    fn_caja_puede_ventas()
    AND (
      sesion_id IS NULL
      OR fn_caja_sesion_accesible(sesion_id)
      OR EXISTS (
        SELECT 1 FROM cxc c
        WHERE c.id = cxc_abonos.cxc_id
          AND fn_caja_puede_ver_sucursal(c.sucursal_id)
      )
    )
  );

CREATE POLICY "cxc_abonos_insert"
  ON cxc_abonos FOR INSERT TO authenticated
  WITH CHECK (
    fn_caja_puede_ventas()
    AND cajero_id = auth.uid()
    AND sesion_id IS NOT NULL
    AND fn_caja_sesion_propia_abierta(sesion_id)
  );

CREATE POLICY "cxc_abonos_update_admin"
  ON cxc_abonos FOR UPDATE TO authenticated
  USING (fn_caja_es_admin())
  WITH CHECK (fn_caja_es_admin());

CREATE POLICY "cxc_abonos_delete_admin"
  ON cxc_abonos FOR DELETE TO authenticated
  USING (fn_caja_es_admin());
