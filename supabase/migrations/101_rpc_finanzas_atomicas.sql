-- ═══════════════════════════════════════════════════════════════
-- 101 — RPCs atómicos: abonos CXC/CXP y creación CXC crédito
-- ═══════════════════════════════════════════════════════════════

-- ── Abono a cuenta por cobrar (movimiento caja + abono + saldo CXC) ──
CREATE OR REPLACE FUNCTION fn_registrar_abono_cxc(
  p_cxc_id            INTEGER,
  p_sesion_id         INTEGER,
  p_sucursal_id       INTEGER,
  p_monto             NUMERIC,
  p_forma_pago        VARCHAR,
  p_nota              TEXT,
  p_fecha             DATE,
  p_hora              TIME,
  p_concepto          TEXT,
  p_paciente_id       INTEGER,
  p_paciente_nombre   TEXT,
  p_referencia_pago   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cxc       cxc%ROWTYPE;
  v_abono_id  INTEGER;
  v_pagado    NUMERIC;
  v_saldo     NUMERIC;
  v_estado    VARCHAR(15);
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del abono debe ser mayor a cero';
  END IF;

  IF NOT fn_caja_sesion_propia_abierta(p_sesion_id) THEN
    RAISE EXCEPTION 'No hay sesión de caja abierta accesible';
  END IF;

  SELECT * INTO v_cxc FROM cxc WHERE id = p_cxc_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CXC no encontrada';
  END IF;

  IF v_cxc.estado NOT IN ('PENDIENTE', 'PARCIAL') THEN
    RAISE EXCEPTION 'La CXC no admite abonos (estado: %)', v_cxc.estado;
  END IF;

  IF p_monto > v_cxc.saldo + 0.005 THEN
    RAISE EXCEPTION 'El abono supera el saldo pendiente';
  END IF;

  INSERT INTO caja_movimientos (
    sesion_id, sucursal_id, cajero_id, tipo, concepto,
    paciente_id, paciente_nombre, monto, forma_pago,
    referencia_pago, nota, fecha, hora
  ) VALUES (
    p_sesion_id, p_sucursal_id, auth.uid(), 'INGRESO', p_concepto,
    p_paciente_id, p_paciente_nombre, p_monto, p_forma_pago,
    p_referencia_pago, p_nota, p_fecha, p_hora
  );

  UPDATE caja_sesiones
  SET total_ingresos = COALESCE(total_ingresos, 0) + p_monto
  WHERE id = p_sesion_id;

  INSERT INTO cxc_abonos (cxc_id, sesion_id, monto, forma_pago, nota, cajero_id, fecha, hora)
  VALUES (p_cxc_id, p_sesion_id, p_monto, p_forma_pago, p_nota, auth.uid(), p_fecha, p_hora)
  RETURNING id INTO v_abono_id;

  v_pagado := COALESCE(v_cxc.monto_pagado, 0) + p_monto;
  v_saldo  := v_cxc.monto_total - v_pagado;
  IF v_saldo <= 0.005 THEN
    v_estado := 'PAGADO';
    v_saldo  := 0;
    v_pagado := v_cxc.monto_total;
  ELSE
    v_estado := 'PARCIAL';
  END IF;

  UPDATE cxc
  SET monto_pagado = v_pagado,
      saldo        = GREATEST(v_saldo, 0),
      estado       = v_estado,
      fecha_pago   = CASE WHEN v_estado = 'PAGADO' THEN p_fecha ELSE fecha_pago END
  WHERE id = p_cxc_id;

  RETURN jsonb_build_object(
    'ok', true,
    'abono_id', v_abono_id,
    'monto_pagado', v_pagado,
    'saldo', GREATEST(v_saldo, 0),
    'estado', v_estado
  );
END;
$$;

-- ── Abono a cuenta por pagar (proveedor) ──
CREATE OR REPLACE FUNCTION fn_registrar_abono_cxp(
  p_cxp_id            INTEGER,
  p_monto             NUMERIC,
  p_forma_pago        VARCHAR DEFAULT 'EFECTIVO',
  p_nota              TEXT DEFAULT NULL,
  p_cajero_nombre     VARCHAR DEFAULT NULL,
  p_sucursal_id       INTEGER DEFAULT NULL,
  p_sesion_id         INTEGER DEFAULT NULL,
  p_registrar_caja    BOOLEAN DEFAULT FALSE,
  p_fecha             DATE DEFAULT CURRENT_DATE,
  p_hora              TIME DEFAULT CURRENT_TIME
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cxp       compra_cxp%ROWTYPE;
  v_abono_id  INTEGER;
  v_pagado    NUMERIC;
  v_saldo     NUMERIC;
  v_estado    VARCHAR(20);
  v_fp_caja   VARCHAR(20);
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del abono debe ser mayor a cero';
  END IF;

  SELECT * INTO v_cxp FROM compra_cxp WHERE id = p_cxp_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CXP no encontrada';
  END IF;

  IF p_monto > COALESCE(v_cxp.saldo, 0) + 0.005 THEN
    RAISE EXCEPTION 'El abono supera el saldo pendiente';
  END IF;

  INSERT INTO compra_cxp_abonos (
    cxp_id, compra_id, proveedor_id, proveedor_nombre,
    monto, forma_pago, nota, cajero_id, cajero_nombre,
    sucursal_id, sesion_id, fecha, hora
  ) VALUES (
    v_cxp.id, v_cxp.compra_id, v_cxp.proveedor_id, v_cxp.proveedor_nombre,
    p_monto, p_forma_pago, p_nota, auth.uid(), p_cajero_nombre,
    COALESCE(p_sucursal_id, v_cxp.sucursal_id), p_sesion_id, p_fecha, p_hora
  )
  RETURNING id INTO v_abono_id;

  v_pagado := COALESCE(v_cxp.monto_pagado, 0) + p_monto;
  v_saldo  := COALESCE(v_cxp.saldo, 0) - p_monto;
  IF v_saldo <= 0.005 THEN
    v_estado := 'PAGADO';
    v_saldo  := 0;
  ELSE
    v_estado := 'PARCIAL';
  END IF;

  UPDATE compra_cxp
  SET monto_pagado = v_pagado,
      saldo        = GREATEST(v_saldo, 0),
      estado       = v_estado,
      updated_at   = NOW()
  WHERE id = p_cxp_id;

  IF p_registrar_caja AND p_sesion_id IS NOT NULL THEN
    v_fp_caja := CASE
      WHEN p_forma_pago = 'TARJETA' THEN 'TARJETA'
      WHEN p_forma_pago = 'TRANSFERENCIA' THEN 'TRANSFERENCIA'
      ELSE 'EFECTIVO'
    END;

    INSERT INTO caja_movimientos (
      sesion_id, sucursal_id, cajero_id, tipo, concepto,
      monto, forma_pago, nota, fecha, hora
    ) VALUES (
      p_sesion_id,
      COALESCE(p_sucursal_id, v_cxp.sucursal_id),
      auth.uid(),
      'EGRESO',
      'Pago CXP — ' || COALESCE(v_cxp.proveedor_nombre, 'Proveedor'),
      p_monto,
      v_fp_caja,
      COALESCE(p_nota, 'Abono CXP #' || p_cxp_id),
      p_fecha,
      p_hora
    );

    UPDATE caja_sesiones
    SET total_egresos = COALESCE(total_egresos, 0) + p_monto
    WHERE id = p_sesion_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'abono_id', v_abono_id,
    'monto_pagado', v_pagado,
    'saldo', GREATEST(v_saldo, 0),
    'estado', v_estado
  );
END;
$$;

-- ── Crear CXC por venta a crédito (vincula opcionalmente al primer movimiento) ──
CREATE OR REPLACE FUNCTION fn_crear_cxc_credito(
  p_paciente_id       INTEGER,
  p_paciente_nombre   TEXT,
  p_concepto          TEXT,
  p_monto_total       NUMERIC,
  p_fecha             DATE,
  p_sucursal_id       INTEGER DEFAULT NULL,
  p_movimiento_id     INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id INTEGER;
BEGIN
  IF p_monto_total IS NULL OR p_monto_total <= 0 THEN
    RAISE EXCEPTION 'El monto de la CXC debe ser mayor a cero';
  END IF;

  IF NOT fn_caja_puede_ventas() THEN
    RAISE EXCEPTION 'No autorizado para crear cuentas por cobrar';
  END IF;

  IF p_sucursal_id IS NOT NULL AND NOT fn_caja_puede_ver_sucursal(p_sucursal_id) THEN
    RAISE EXCEPTION 'No autorizado para la sucursal indicada';
  END IF;

  INSERT INTO cxc (
    paciente_id, paciente_nombre, concepto,
    monto_total, monto_pagado, saldo, estado,
    fecha, movimiento_id, sucursal_id, cajero_id
  ) VALUES (
    p_paciente_id, p_paciente_nombre, p_concepto,
    p_monto_total, 0, p_monto_total, 'PENDIENTE',
    p_fecha, p_movimiento_id, p_sucursal_id, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'cxc_id', v_id);
END;
$$;

-- ── Ingreso CREDITO + CXC en una sola transacción (lab, cotización, venta simple) ──
CREATE OR REPLACE FUNCTION fn_registrar_ingreso_credito_cxc(
  p_movimiento        JSONB,
  p_cxc_concepto      TEXT,
  p_paciente_id       INTEGER DEFAULT NULL,
  p_paciente_nombre   TEXT DEFAULT NULL,
  p_sucursal_id       INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov_id    INTEGER;
  v_monto     NUMERIC;
  v_sesion_id INTEGER;
  v_fecha     DATE;
  v_cxc_id    INTEGER;
BEGIN
  v_monto     := (p_movimiento->>'monto')::NUMERIC;
  v_sesion_id := (p_movimiento->>'sesion_id')::INTEGER;
  v_fecha     := COALESCE((p_movimiento->>'fecha')::DATE, CURRENT_DATE);

  IF v_monto IS NULL OR v_monto <= 0 THEN
    RAISE EXCEPTION 'Monto inválido';
  END IF;

  IF NOT fn_caja_sesion_propia_abierta(v_sesion_id) THEN
    RAISE EXCEPTION 'Sesión de caja no accesible';
  END IF;

  INSERT INTO caja_movimientos (
    sesion_id, sucursal_id, cajero_id, tipo, concepto,
    paciente_id, paciente_nombre, monto, forma_pago,
    referencia_pago, nota, fecha, hora,
    monto_bruto, descuento_pct, descuento_monto, descuento_motivo,
    consulta_id
  )
  SELECT
    v_sesion_id,
    COALESCE((p_movimiento->>'sucursal_id')::INTEGER, p_sucursal_id),
    auth.uid(),
    'INGRESO',
    p_movimiento->>'concepto',
    COALESCE((p_movimiento->>'paciente_id')::INTEGER, p_paciente_id),
    COALESCE(p_movimiento->>'paciente_nombre', p_paciente_nombre),
    v_monto,
    'CREDITO',
    p_movimiento->>'referencia_pago',
    p_movimiento->>'nota',
    v_fecha,
    COALESCE((p_movimiento->>'hora')::TIME, CURRENT_TIME),
    NULLIF(p_movimiento->>'monto_bruto', '')::NUMERIC,
    NULLIF(p_movimiento->>'descuento_pct', '')::NUMERIC,
    NULLIF(p_movimiento->>'descuento_monto', '')::NUMERIC,
    p_movimiento->>'descuento_motivo',
    NULLIF(p_movimiento->>'consulta_id', '')::INTEGER
  RETURNING id INTO v_mov_id;

  UPDATE caja_sesiones
  SET total_ingresos = COALESCE(total_ingresos, 0) + v_monto
  WHERE id = v_sesion_id;

  INSERT INTO cxc (
    paciente_id, paciente_nombre, concepto,
    monto_total, monto_pagado, saldo, estado,
    fecha, movimiento_id, sucursal_id, cajero_id
  ) VALUES (
    COALESCE((p_movimiento->>'paciente_id')::INTEGER, p_paciente_id),
    COALESCE(p_movimiento->>'paciente_nombre', p_paciente_nombre),
    p_cxc_concepto,
    v_monto, 0, v_monto, 'PENDIENTE',
    v_fecha, v_mov_id,
    COALESCE((p_movimiento->>'sucursal_id')::INTEGER, p_sucursal_id),
    auth.uid()
  )
  RETURNING id INTO v_cxc_id;

  RETURN jsonb_build_object('ok', true, 'movimiento_id', v_mov_id, 'cxc_id', v_cxc_id);
END;
$$;

GRANT EXECUTE ON FUNCTION fn_registrar_abono_cxc(
  INTEGER, INTEGER, INTEGER, NUMERIC, VARCHAR, TEXT, DATE, TIME, TEXT, INTEGER, TEXT, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION fn_registrar_abono_cxp(
  INTEGER, NUMERIC, VARCHAR, TEXT, VARCHAR, INTEGER, INTEGER, BOOLEAN, DATE, TIME
) TO authenticated;

GRANT EXECUTE ON FUNCTION fn_crear_cxc_credito(
  INTEGER, TEXT, TEXT, NUMERIC, DATE, INTEGER, INTEGER
) TO authenticated;

GRANT EXECUTE ON FUNCTION fn_registrar_ingreso_credito_cxc(
  JSONB, TEXT, INTEGER, TEXT, INTEGER
) TO authenticated;
