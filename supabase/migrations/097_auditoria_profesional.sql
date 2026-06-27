-- ═══════════════════════════════════════════════════════════════
--  097 — Auditoría profesional: cobertura, seguridad, metadatos
-- ═══════════════════════════════════════════════════════════════

-- ── Columnas extra en bitácora ─────────────────────────────────
ALTER TABLE auditoria_general
  ADD COLUMN IF NOT EXISTS ip_address  VARCHAR(45),
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS sucursal_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_audit_gen_sucursal ON auditoria_general(sucursal_id);

-- ── Metadatos de respaldo ──────────────────────────────────────
ALTER TABLE respaldos
  ADD COLUMN IF NOT EXISTS hash_sha256 VARCHAR(64),
  ADD COLUMN IF NOT EXISTS comprimido  BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Registro de accesos al módulo ───────────────────────────────
CREATE TABLE IF NOT EXISTS auditoria_accesos (
  id              SERIAL PRIMARY KEY,
  accion          VARCHAR(40)  NOT NULL,
  detalle         TEXT,
  usuario_id      UUID,
  usuario_nombre  VARCHAR(200),
  usuario_email   VARCHAR(200),
  ip_address      VARCHAR(45),
  user_agent      TEXT,
  fecha           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_acc_fecha ON auditoria_accesos(fecha DESC);

ALTER TABLE auditoria_accesos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_acc_super" ON auditoria_accesos;
CREATE POLICY "audit_acc_super" ON auditoria_accesos
  FOR ALL TO authenticated
  USING (fn_usuario_es_super_admin())
  WITH CHECK (fn_usuario_es_super_admin());

-- ── Enmascarar campos sensibles en JSONB ───────────────────────
CREATE OR REPLACE FUNCTION fn_auditoria_enmascarar(p JSONB)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  k TEXT;
  sensibles TEXT[] := ARRAY[
    'password', 'contrasena', 'token', 'secret', 'api_key',
    'service_role', 'refresh_token', 'access_token'
  ];
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  FOREACH k IN ARRAY sensibles LOOP
    IF p ? k THEN
      p := jsonb_set(p, ARRAY[k], '"***"'::jsonb, true);
    END IF;
  END LOOP;
  RETURN p;
END;
$$;

-- ── Trigger genérico mejorado ───────────────────────────────────
CREATE OR REPLACE FUNCTION fn_auditoria_generica()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_email   TEXT;
  v_nombre  TEXT;
  v_reg     TEXT;
  v_antes   JSONB;
  v_despues JSONB;
  v_cambios TEXT[];
  v_suc     INTEGER;
  v_ip      TEXT;
  v_ua      TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_antes   := fn_auditoria_enmascarar(to_jsonb(OLD));
    v_despues := NULL;
    v_reg     := v_antes ->> 'id';
    v_suc     := NULLIF(v_antes ->> 'sucursal_id', '')::INTEGER;
  ELSIF TG_OP = 'INSERT' THEN
    v_antes   := NULL;
    v_despues := fn_auditoria_enmascarar(to_jsonb(NEW));
    v_reg     := v_despues ->> 'id';
    v_suc     := NULLIF(v_despues ->> 'sucursal_id', '')::INTEGER;
  ELSE
    v_antes   := fn_auditoria_enmascarar(to_jsonb(OLD));
    v_despues := fn_auditoria_enmascarar(to_jsonb(NEW));
    v_reg     := v_despues ->> 'id';
    v_suc     := COALESCE(
      NULLIF(v_despues ->> 'sucursal_id', '')::INTEGER,
      NULLIF(v_antes ->> 'sucursal_id', '')::INTEGER
    );

    SELECT array_agg(e.key) INTO v_cambios
    FROM jsonb_each(v_despues) AS e(key, value)
    WHERE (v_despues -> e.key) IS DISTINCT FROM (v_antes -> e.key)
      AND e.key NOT IN ('updated_at', 'created_at');

    IF v_cambios IS NULL OR array_length(v_cambios, 1) IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    SELECT NULLIF(TRIM(COALESCE(nombre,'') || ' ' || COALESCE(apellido,'')), '')
      INTO v_nombre FROM perfiles WHERE id = v_uid;
  END IF;
  v_nombre := COALESCE(v_nombre, NULLIF(current_setting('app.usuario_nombre', TRUE), ''));
  v_ip     := NULLIF(current_setting('app.ip_address', TRUE), '');
  v_ua     := NULLIF(current_setting('app.user_agent', TRUE), '');

  BEGIN
    INSERT INTO auditoria_general (
      tabla, registro_id, operacion, datos_antes, datos_despues,
      campos_cambiados, usuario_id, usuario_email, usuario_nombre,
      ip_address, user_agent, sucursal_id
    ) VALUES (
      TG_TABLE_NAME, v_reg, TG_OP, v_antes, v_despues,
      v_cambios, v_uid, v_email, v_nombre,
      v_ip, v_ua, v_suc
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- ── Bloquear INSERT manual en bitácora (solo triggers) ──────────
DROP POLICY IF EXISTS "audit_gen_insert" ON auditoria_general;
CREATE POLICY "audit_gen_no_client_insert" ON auditoria_general
  FOR INSERT TO authenticated WITH CHECK (false);

-- ── Ampliar tablas auditadas ─────────────────────────────────────
SELECT fn_attach_auditoria(t) FROM (VALUES
  ('planilla_periodos'),
  ('planilla_liquidaciones'),
  ('planilla_comisiones'),
  ('laboratorio_ordenes'),
  ('lab_perfiles'),
  ('lab_rangos'),
  ('finanzas_movimientos'),
  ('finanzas_tarjetas'),
  ('finanzas_deudas'),
  ('finanzas_prestamos'),
  ('finanzas_presupuestos'),
  ('finanzas_cuentas'),
  ('finanzas_categorias'),
  ('inventario_conteos'),
  ('inventario_transferencias'),
  ('promociones'),
  ('promocion_campanas'),
  ('promocion_reglas'),
  ('cxp'),
  ('cxp_abonos'),
  ('citas'),
  ('proveedores'),
  ('servicios'),
  ('medicos'),
  ('membresia_tipos'),
  ('cotizacion_detalles')
) AS x(t);

-- ── Retención bitácora: función (ejecutar vía cron) ─────────────
CREATE OR REPLACE FUNCTION fn_purgar_auditoria_antigua(p_meses INTEGER DEFAULT 12)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n INTEGER;
BEGIN
  DELETE FROM auditoria_general
  WHERE fecha < NOW() - (p_meses || ' months')::INTERVAL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

NOTIFY pgrst, 'reload schema';
