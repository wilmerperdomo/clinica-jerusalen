-- ═══════════════════════════════════════════════════════════════
--  091 — Configuración editable del programa de fidelidad
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fidelidad_config (
  id                      INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  lempiras_por_punto      NUMERIC(10,2) NOT NULL DEFAULT 26,
  valor_lempira_por_punto NUMERIC(10,2) NOT NULL DEFAULT 1,
  porcentaje_max_canje    NUMERIC(5,2)  NOT NULL DEFAULT 25,
  monto_minimo_cobro      NUMERIC(10,2) NOT NULL DEFAULT 1,
  activo                  BOOLEAN       NOT NULL DEFAULT TRUE,
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_by              UUID REFERENCES auth.users(id)
);

INSERT INTO fidelidad_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE fidelidad_config IS 'Parámetros globales del programa de puntos de fidelidad';
COMMENT ON COLUMN fidelidad_config.porcentaje_max_canje IS 'Máximo % del total de la factura/cobro que puede pagarse con puntos (ej. 25 = 25%)';
COMMENT ON COLUMN fidelidad_config.monto_minimo_cobro IS 'Monto mínimo que debe quedar por cobrar/facturar después del canje';

ALTER TABLE fidelidad_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fidelidad_config_select" ON fidelidad_config;
DROP POLICY IF EXISTS "fidelidad_config_update" ON fidelidad_config;

CREATE POLICY "fidelidad_config_select"
  ON fidelidad_config FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "fidelidad_config_update"
  ON fidelidad_config FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- Acumulación usa lempiras_por_punto de la configuración
CREATE OR REPLACE FUNCTION fn_acumular_puntos_factura(p_factura_id INTEGER)
RETURNS TABLE(puntos_otorgados INTEGER, saldo_nuevo INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fact   facturas%ROWTYPE;
  v_puntos INTEGER;
  v_saldo  INTEGER;
  v_lempiras_por_punto NUMERIC;
BEGIN
  SELECT * INTO v_fact FROM facturas WHERE id = p_factura_id;

  IF NOT FOUND OR v_fact.estado <> 'emitida' THEN
    RETURN QUERY SELECT 0, COALESCE(
      (SELECT puntos FROM pacientes WHERE id = v_fact.paciente_id), 0
    );
    RETURN;
  END IF;

  IF v_fact.paciente_id IS NULL THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM paciente_puntos_movimientos
    WHERE factura_id = p_factura_id AND tipo = 'ACUMULACION'
  ) THEN
    SELECT puntos INTO v_saldo FROM pacientes WHERE id = v_fact.paciente_id;
    RETURN QUERY SELECT 0, COALESCE(v_saldo, 0);
    RETURN;
  END IF;

  SELECT COALESCE(lempiras_por_punto, 26) INTO v_lempiras_por_punto
  FROM fidelidad_config WHERE id = 1;

  IF NOT FOUND OR v_lempiras_por_punto <= 0 THEN
    v_lempiras_por_punto := 26;
  END IF;

  v_puntos := FLOOR(COALESCE(v_fact.total, 0) / v_lempiras_por_punto)::INTEGER;

  IF v_puntos <= 0 THEN
    SELECT puntos INTO v_saldo FROM pacientes WHERE id = v_fact.paciente_id;
    RETURN QUERY SELECT 0, COALESCE(v_saldo, 0);
    RETURN;
  END IF;

  UPDATE pacientes
  SET puntos = COALESCE(puntos, 0) + v_puntos
  WHERE id = v_fact.paciente_id
  RETURNING puntos INTO v_saldo;

  INSERT INTO paciente_puntos_movimientos (
    paciente_id, tipo, puntos, saldo_despues, monto_base, factura_id, nota
  ) VALUES (
    v_fact.paciente_id,
    'ACUMULACION',
    v_puntos,
    v_saldo,
    v_fact.total,
    p_factura_id,
    'Factura ' || v_fact.numero || ' — L ' || TRIM(TO_CHAR(v_fact.total, '999999990.00'))
  );

  RETURN QUERY SELECT v_puntos, v_saldo;
END;
$$;
