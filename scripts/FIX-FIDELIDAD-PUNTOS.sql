-- Ejecutar en Supabase → SQL Editor (copia de migrations/051_fidelidad_puntos.sql)

CREATE TABLE IF NOT EXISTS paciente_puntos_movimientos (
  id                  SERIAL PRIMARY KEY,
  paciente_id         INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  tipo                VARCHAR(20) NOT NULL
                        CHECK (tipo IN ('ACUMULACION', 'CANJE', 'AJUSTE', 'REVERSO')),
  puntos              INTEGER NOT NULL,
  saldo_despues       INTEGER NOT NULL DEFAULT 0,
  monto_base          NUMERIC(12,2),
  factura_id          INTEGER REFERENCES facturas(id) ON DELETE SET NULL,
  caja_movimiento_id  INTEGER REFERENCES caja_movimientos(id) ON DELETE SET NULL,
  nota                TEXT,
  usuario_id          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ppm_paciente ON paciente_puntos_movimientos(paciente_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ppm_factura_acumulacion_unica
  ON paciente_puntos_movimientos(factura_id)
  WHERE tipo = 'ACUMULACION' AND factura_id IS NOT NULL;

CREATE OR REPLACE FUNCTION fn_acumular_puntos_factura(p_factura_id INTEGER)
RETURNS TABLE(puntos_otorgados INTEGER, saldo_nuevo INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fact facturas%ROWTYPE; v_puntos INTEGER; v_saldo INTEGER;
BEGIN
  SELECT * INTO v_fact FROM facturas WHERE id = p_factura_id;
  IF NOT FOUND OR v_fact.estado <> 'emitida' OR v_fact.paciente_id IS NULL THEN
    RETURN QUERY SELECT 0, COALESCE((SELECT puntos FROM pacientes WHERE id = v_fact.paciente_id), 0);
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM paciente_puntos_movimientos WHERE factura_id = p_factura_id AND tipo = 'ACUMULACION') THEN
    SELECT puntos INTO v_saldo FROM pacientes WHERE id = v_fact.paciente_id;
    RETURN QUERY SELECT 0, COALESCE(v_saldo, 0);
    RETURN;
  END IF;
  v_puntos := FLOOR(COALESCE(v_fact.total, 0) / 26)::INTEGER;
  IF v_puntos <= 0 THEN
    SELECT puntos INTO v_saldo FROM pacientes WHERE id = v_fact.paciente_id;
    RETURN QUERY SELECT 0, COALESCE(v_saldo, 0);
    RETURN;
  END IF;
  UPDATE pacientes SET puntos = COALESCE(puntos, 0) + v_puntos WHERE id = v_fact.paciente_id RETURNING puntos INTO v_saldo;
  INSERT INTO paciente_puntos_movimientos (paciente_id, tipo, puntos, saldo_despues, monto_base, factura_id, nota)
  VALUES (v_fact.paciente_id, 'ACUMULACION', v_puntos, v_saldo, v_fact.total, p_factura_id,
    'Factura ' || v_fact.numero);
  RETURN QUERY SELECT v_puntos, v_saldo;
END; $$;

CREATE OR REPLACE FUNCTION fn_canjear_puntos_laboratorio(
  p_paciente_id INTEGER, p_puntos INTEGER, p_movimiento_id INTEGER DEFAULT NULL, p_nota TEXT DEFAULT NULL
)
RETURNS TABLE(puntos_canjeados INTEGER, saldo_restante INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_saldo_actual INTEGER; v_canje INTEGER; v_nuevo INTEGER;
BEGIN
  IF p_paciente_id IS NULL OR p_puntos IS NULL OR p_puntos <= 0 THEN
    RAISE EXCEPTION 'Datos de canje inválidos';
  END IF;
  SELECT COALESCE(puntos, 0) INTO v_saldo_actual FROM pacientes WHERE id = p_paciente_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paciente no encontrado'; END IF;
  v_canje := LEAST(p_puntos, v_saldo_actual);
  IF v_canje <= 0 THEN RAISE EXCEPTION 'El paciente no tiene puntos suficientes'; END IF;
  v_nuevo := v_saldo_actual - v_canje;
  UPDATE pacientes SET puntos = v_nuevo WHERE id = p_paciente_id;
  INSERT INTO paciente_puntos_movimientos (paciente_id, tipo, puntos, saldo_despues, caja_movimiento_id, nota, usuario_id)
  VALUES (p_paciente_id, 'CANJE', -v_canje, v_nuevo, p_movimiento_id, COALESCE(p_nota, 'Canje laboratorio'), auth.uid());
  RETURN QUERY SELECT v_canje, v_nuevo;
END; $$;

GRANT EXECUTE ON FUNCTION fn_acumular_puntos_factura(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_canjear_puntos_laboratorio(INTEGER, INTEGER, INTEGER, TEXT) TO authenticated;

ALTER TABLE paciente_puntos_movimientos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ppm_select" ON paciente_puntos_movimientos;
DROP POLICY IF EXISTS "ppm_insert" ON paciente_puntos_movimientos;
CREATE POLICY "ppm_select" ON paciente_puntos_movimientos FOR SELECT TO authenticated USING (true);
CREATE POLICY "ppm_insert" ON paciente_puntos_movimientos FOR INSERT TO authenticated WITH CHECK (true);
