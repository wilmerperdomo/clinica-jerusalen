-- ═══════════════════════════════════════════════════════════════
--  FIX SEGURIDAD Y RENDIMIENTO  (Fases 1B, 3 y 5)
--  Pega TODO este script en Supabase → SQL Editor y ejecútalo una vez.
--  Es idempotente: se puede correr de nuevo sin romper nada.
--  Equivale a las migraciones 052 + 053 + 054.
-- ═══════════════════════════════════════════════════════════════

-- ════════ 052 — Seguridad RBAC (cerrar auto-ascenso de rol) ════════

CREATE OR REPLACE FUNCTION fn_proteger_columnas_perfil()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF fn_usuario_es_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.rol_id      IS DISTINCT FROM OLD.rol_id
     OR NEW.sucursal_id IS DISTINCT FROM OLD.sucursal_id
     OR NEW.activo    IS DISTINCT FROM OLD.activo THEN
    RAISE EXCEPTION 'No autorizado para cambiar rol, sucursal o estado del perfil';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_perfil ON perfiles;
CREATE TRIGGER trg_proteger_perfil
  BEFORE UPDATE ON perfiles
  FOR EACH ROW
  EXECUTE FUNCTION fn_proteger_columnas_perfil();

DROP POLICY IF EXISTS "admin_gestiona_perfil_roles" ON perfil_roles;
CREATE POLICY "admin_gestiona_perfil_roles" ON perfil_roles
  FOR ALL TO authenticated
  USING (fn_usuario_es_admin())
  WITH CHECK (fn_usuario_es_admin());

DROP POLICY IF EXISTS "admin_gestiona_rol_permisos" ON rol_permisos;
CREATE POLICY "admin_gestiona_rol_permisos" ON rol_permisos
  FOR ALL TO authenticated
  USING (fn_usuario_es_admin())
  WITH CHECK (fn_usuario_es_admin());

DROP POLICY IF EXISTS "admin_gestiona_permisos" ON permisos;
CREATE POLICY "admin_gestiona_permisos" ON permisos
  FOR ALL TO authenticated
  USING (fn_usuario_es_admin())
  WITH CHECK (fn_usuario_es_admin());

GRANT EXECUTE ON FUNCTION fn_proteger_columnas_perfil() TO authenticated;

-- ════════ 053 — Seguridad de facturas ════════

DROP POLICY IF EXISTS "auth_facturas" ON facturas;

DROP POLICY IF EXISTS "facturas_select" ON facturas;
CREATE POLICY "facturas_select" ON facturas
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "facturas_insert" ON facturas;
CREATE POLICY "facturas_insert" ON facturas
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "facturas_update_admin" ON facturas;
CREATE POLICY "facturas_update_admin" ON facturas
  FOR UPDATE TO authenticated
  USING (fn_usuario_es_admin())
  WITH CHECK (fn_usuario_es_admin());

DROP POLICY IF EXISTS "facturas_delete_admin" ON facturas;
CREATE POLICY "facturas_delete_admin" ON facturas
  FOR DELETE TO authenticated
  USING (fn_usuario_es_admin());

ALTER VIEW v_facturas_auditoria SET (security_invoker = on);

DROP POLICY IF EXISTS "sistema_inserta_auditoria" ON facturas_auditoria;
DROP POLICY IF EXISTS "auditoria_insert_admin" ON facturas_auditoria;
CREATE POLICY "auditoria_insert_admin" ON facturas_auditoria
  FOR INSERT TO authenticated
  WITH CHECK (fn_usuario_es_admin());

-- ════════ 054 — Índices de rendimiento ════════

CREATE INDEX IF NOT EXISTS idx_caja_sesiones_sucursal ON caja_sesiones(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_caja_sesiones_estado   ON caja_sesiones(estado);
CREATE INDEX IF NOT EXISTS idx_citas_sucursal ON citas(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_citas_estado   ON citas(estado);
CREATE INDEX IF NOT EXISTS idx_cxc_paciente ON cxc(paciente_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_paciente ON cotizaciones(paciente_id);
CREATE INDEX IF NOT EXISTS idx_consulta_documentos_paciente ON consulta_documentos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_facturas_sucursal ON facturas(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_facturas_paciente ON facturas(paciente_id);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha    ON facturas(fecha);
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_sesion ON caja_movimientos(sesion_id);
