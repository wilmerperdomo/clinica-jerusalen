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

-- La vista de auditoría respeta la RLS de quien consulta (solo si existe)
DO $$
BEGIN
  IF to_regclass('public.v_facturas_auditoria') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW v_facturas_auditoria SET (security_invoker = on)';
  END IF;
END $$;

DROP POLICY IF EXISTS "sistema_inserta_auditoria" ON facturas_auditoria;
DROP POLICY IF EXISTS "auditoria_insert_admin" ON facturas_auditoria;
CREATE POLICY "auditoria_insert_admin" ON facturas_auditoria
  FOR INSERT TO authenticated
  WITH CHECK (fn_usuario_es_admin());

-- ════════ 055 — Reparar esquema de cxc (cobros a crédito) ════════
-- En bases legacy cxc no tenía estas columnas y los cobros a CRÉDITO
-- fallaban al crear la cuenta por cobrar.
ALTER TABLE cxc ADD COLUMN IF NOT EXISTS paciente_id INTEGER;
ALTER TABLE cxc ADD COLUMN IF NOT EXISTS sucursal_id INTEGER;

-- ════════ 054 — Índices de rendimiento (robusto) ════════
-- Crea cada índice SOLO si la tabla y la columna existen.

DO $$
DECLARE
  d_str  TEXT;
  parts  TEXT[];
  defs   TEXT[] := ARRAY[
    'idx_caja_sesiones_sucursal|caja_sesiones|sucursal_id',
    'idx_caja_sesiones_estado|caja_sesiones|estado',
    'idx_citas_sucursal|citas|sucursal_id',
    'idx_citas_estado|citas|estado',
    'idx_cxc_paciente|cxc|paciente_id',
    'idx_cotizaciones_paciente|cotizaciones|paciente_id',
    'idx_consulta_documentos_paciente|consulta_documentos|paciente_id',
    'idx_facturas_sucursal|facturas|sucursal_id',
    'idx_facturas_paciente|facturas|paciente_id',
    'idx_facturas_fecha|facturas|fecha',
    'idx_caja_movimientos_sesion|caja_movimientos|sesion_id'
  ];
BEGIN
  FOREACH d_str IN ARRAY defs LOOP
    parts := string_to_array(d_str, '|');
    IF to_regclass('public.' || parts[2]) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = parts[2]
           AND column_name  = parts[3]
       ) THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (%I)', parts[1], parts[2], parts[3]);
    END IF;
  END LOOP;
END $$;
