-- ═══════════════════════════════════════════════════════════════
--  046 — Fix cierre de caja: RLS al pasar estado ABIERTA → CERRADA
--  La enfermera/cajero cierra su sesión; el detalle queda en el reporte impreso.
-- ═══════════════════════════════════════════════════════════════

-- Sesiones legacy sin cajero: asignar al primer movimiento del turno si existe
UPDATE caja_sesiones s
SET cajero_id = sub.cajero_id
FROM (
  SELECT DISTINCT ON (m.sesion_id) m.sesion_id, m.cajero_id
  FROM caja_movimientos m
  WHERE m.cajero_id IS NOT NULL
  ORDER BY m.sesion_id, m.id
) sub
WHERE s.id = sub.sesion_id
  AND s.cajero_id IS NULL
  AND s.estado = 'ABIERTA';

CREATE OR REPLACE FUNCTION fn_caja_puede_cerrar_sesion(p_sesion_id INTEGER)
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
      AND s.estado = 'ABIERTA'
      AND (
        s.cajero_id = auth.uid()
        OR (
          s.cajero_id IS NULL
          AND fn_caja_puede_ventas()
        )
        OR (
          fn_caja_es_admin()
          AND fn_caja_puede_ver_sucursal(s.sucursal_id)
        )
      )
  );
$$;

COMMENT ON FUNCTION fn_caja_puede_cerrar_sesion(INTEGER) IS
  'Operador: cierra su sesión ABIERTA; admin: cierra sesiones de su sucursal';

-- Política UPDATE: permitir cerrar (estado CERRADA) además de actualizar totales
DROP POLICY IF EXISTS "caja_sesiones_update" ON caja_sesiones;

CREATE POLICY "caja_sesiones_update"
  ON caja_sesiones FOR UPDATE TO authenticated
  USING (
    fn_caja_sesion_propia_abierta(id)
    OR (
      fn_caja_es_admin()
      AND fn_caja_puede_ver_sucursal(sucursal_id)
      AND estado = 'ABIERTA'
    )
  )
  WITH CHECK (
    (
      cajero_id = auth.uid()
      AND estado IN ('ABIERTA', 'CERRADA')
    )
    OR (
      fn_caja_es_admin()
      AND fn_caja_puede_ver_sucursal(sucursal_id)
      AND estado IN ('ABIERTA', 'CERRADA')
    )
    OR (
      fn_caja_puede_ventas()
      AND cajero_id IS NULL
      AND estado IN ('ABIERTA', 'CERRADA')
    )
  );

-- RPC: cierre atómico con validación (evita bloqueos RLS en producción)
CREATE OR REPLACE FUNCTION fn_cerrar_caja_sesion(
  p_sesion_id              INTEGER,
  p_hora_cierre            TIME,
  p_monto_efectivo_real    NUMERIC,
  p_monto_tarjeta_real     NUMERIC,
  p_monto_transfer_real    NUMERIC,
  p_total_ingresos         NUMERIC,
  p_total_egresos          NUMERIC,
  p_total_creditos         NUMERIC,
  p_saldo_esperado         NUMERIC,
  p_diferencia             NUMERIC,
  p_observacion            TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row caja_sesiones%ROWTYPE;
BEGIN
  IF NOT fn_caja_puede_cerrar_sesion(p_sesion_id) THEN
    RAISE EXCEPTION 'No autorizado para cerrar esta caja o la sesión ya está cerrada';
  END IF;

  SELECT * INTO v_row
  FROM caja_sesiones
  WHERE id = p_sesion_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.estado <> 'ABIERTA' THEN
    RAISE EXCEPTION 'Sesión no encontrada o ya cerrada';
  END IF;

  UPDATE caja_sesiones
  SET
    hora_cierre         = p_hora_cierre,
    monto_efectivo_real = p_monto_efectivo_real,
    monto_tarjeta_real  = p_monto_tarjeta_real,
    monto_transfer_real = p_monto_transfer_real,
    total_ingresos      = p_total_ingresos,
    total_egresos       = p_total_egresos,
    total_creditos      = p_total_creditos,
    saldo_esperado      = p_saldo_esperado,
    diferencia          = p_diferencia,
    observacion         = NULLIF(TRIM(p_observacion), ''),
    estado              = 'CERRADA',
    cajero_id           = COALESCE(cajero_id, auth.uid())
  WHERE id = p_sesion_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_sesion_id,
    'estado', 'CERRADA'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION fn_cerrar_caja_sesion(
  INTEGER, TIME, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION fn_caja_puede_cerrar_sesion(INTEGER) TO authenticated;
