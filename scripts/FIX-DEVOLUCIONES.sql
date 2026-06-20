-- ═══════════════════════════════════════════════════════════════
--  062 — Motor de reversas: Anulación + Devolución (Notas de crédito)
--   - Devolución parcial o total de una factura (nota de crédito).
--   - Anulación total (marca la factura anulada) por el mismo motor.
--   - Reembolso por caja (EGRESO efectivo/tarjeta) o saldo a favor.
--   - Reversa proporcional de puntos de fidelidad.
--   - Reingreso opcional de inventario (kardex DEVOLUCION).
--   - Autorización obligatoria por código del super usuario.
--   Todo en una sola operación atómica (fn_registrar_devolucion).
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Columnas nuevas ─────────────────────────────────────────
ALTER TABLE facturas  ADD COLUMN IF NOT EXISTS monto_devuelto NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS saldo_favor    NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ── 2. Kardex: permitir tipo DEVOLUCION ────────────────────────
ALTER TABLE inventario_movimientos DROP CONSTRAINT IF EXISTS inventario_movimientos_tipo_check;
ALTER TABLE inventario_movimientos
  ADD CONSTRAINT inventario_movimientos_tipo_check
  CHECK (tipo IN ('ENTRADA','SALIDA','AJUSTE','TRANSFERENCIA','VENTA','CONSUMO','DEVOLUCION'));

-- ── 3. Tablas ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devoluciones (
  id                SERIAL PRIMARY KEY,
  numero            VARCHAR(30)  NOT NULL,
  factura_id        INTEGER      NOT NULL REFERENCES facturas(id),
  factura_numero    VARCHAR(30),
  paciente_id       INTEGER,
  paciente_nombre   VARCHAR(200),
  sucursal_id       INTEGER      NOT NULL,
  items             JSONB        NOT NULL DEFAULT '[]',
  subtotal          NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento_monto   NUMERIC(12,2) NOT NULL DEFAULT 0,
  isv_monto         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total             NUMERIC(12,2) NOT NULL DEFAULT 0,
  motivo            TEXT,
  tipo_reembolso    VARCHAR(20)  NOT NULL
                      CHECK (tipo_reembolso IN ('EFECTIVO','TARJETA','TRANSFERENCIA','SALDO_FAVOR')),
  referencia_pago   VARCHAR(100),
  caja_movimiento_id INTEGER,
  caja_sesion_id    INTEGER,
  puntos_revertidos INTEGER       NOT NULL DEFAULT 0,
  es_anulacion      BOOLEAN       NOT NULL DEFAULT FALSE,
  estado            VARCHAR(15)   NOT NULL DEFAULT 'EMITIDA'
                      CHECK (estado IN ('EMITIDA','ANULADA')),
  cajero_nombre     VARCHAR(150),
  usuario_id        UUID,
  fecha             DATE          NOT NULL DEFAULT CURRENT_DATE,
  hora              TIME          NOT NULL DEFAULT CURRENT_TIME,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_devoluciones_factura  ON devoluciones(factura_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_sucursal ON devoluciones(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_devoluciones_fecha    ON devoluciones(fecha DESC);

CREATE TABLE IF NOT EXISTS devolucion_correlativos (
  sucursal_id    INTEGER PRIMARY KEY,
  ultimo_numero  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS paciente_saldo_movimientos (
  id            SERIAL PRIMARY KEY,
  paciente_id   INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  tipo          VARCHAR(15) NOT NULL CHECK (tipo IN ('ABONO','CONSUMO','AJUSTE')),
  monto         NUMERIC(12,2) NOT NULL,
  saldo_despues NUMERIC(12,2) NOT NULL DEFAULT 0,
  devolucion_id INTEGER,
  factura_id    INTEGER,
  nota          TEXT,
  usuario_id    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_psm_paciente ON paciente_saldo_movimientos(paciente_id);

CREATE TABLE IF NOT EXISTS autorizaciones (
  id                 SERIAL PRIMARY KEY,
  codigo             VARCHAR(12) NOT NULL,
  proposito          VARCHAR(15) NOT NULL DEFAULT 'DEVOLUCION'
                       CHECK (proposito IN ('DEVOLUCION','ANULACION')),
  factura_id         INTEGER,
  sucursal_id        INTEGER,
  monto_max          NUMERIC(12,2),
  estado             VARCHAR(12) NOT NULL DEFAULT 'ACTIVO'
                       CHECK (estado IN ('ACTIVO','USADO','EXPIRADO','REVOCADO')),
  expira_at          TIMESTAMPTZ,
  generado_por       UUID,
  generado_por_nombre VARCHAR(150),
  usado_por          UUID,
  usado_en           TIMESTAMPTZ,
  devolucion_id      INTEGER,
  nota               TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_autorizaciones_codigo_activo
  ON autorizaciones(codigo) WHERE estado = 'ACTIVO';
CREATE INDEX IF NOT EXISTS idx_autorizaciones_factura ON autorizaciones(factura_id);

-- ── 4. RLS ─────────────────────────────────────────────────────
ALTER TABLE devoluciones               ENABLE ROW LEVEL SECURITY;
ALTER TABLE devolucion_correlativos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE paciente_saldo_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE autorizaciones             ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "devoluciones_all"      ON devoluciones;
DROP POLICY IF EXISTS "dev_correl_all"        ON devolucion_correlativos;
DROP POLICY IF EXISTS "psm_all"               ON paciente_saldo_movimientos;
DROP POLICY IF EXISTS "autorizaciones_select" ON autorizaciones;
DROP POLICY IF EXISTS "autorizaciones_super"  ON autorizaciones;

CREATE POLICY "devoluciones_all"   ON devoluciones               FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "dev_correl_all"     ON devolucion_correlativos    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "psm_all"            ON paciente_saldo_movimientos FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Autorizaciones: cualquiera autenticado puede leer (para validar/listar);
-- solo el super admin puede crearlas/cambiarlas.
CREATE POLICY "autorizaciones_select" ON autorizaciones FOR SELECT TO authenticated USING (true);
CREATE POLICY "autorizaciones_super"  ON autorizaciones FOR ALL    TO authenticated
  USING (fn_usuario_es_super_admin()) WITH CHECK (fn_usuario_es_super_admin());

-- ── 5. Permiso configurable facturacion.devolver ───────────────
INSERT INTO permisos (modulo_id, accion, descripcion)
SELECT m.id, 'devolver', m.nombre || ' — devolver / nota de crédito'
FROM modulos m
WHERE m.clave = 'facturacion'
ON CONFLICT (modulo_id, accion) DO NOTHING;

-- ── 6. RPC: generar código de autorización (solo super admin) ──
CREATE OR REPLACE FUNCTION fn_generar_autorizacion(
  p_factura_id INTEGER,
  p_proposito  TEXT DEFAULT 'DEVOLUCION',
  p_minutos    INTEGER DEFAULT 60
)
RETURNS TABLE(codigo TEXT, expira_at TIMESTAMPTZ, monto_max NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fact     facturas%ROWTYPE;
  v_codigo   TEXT;
  v_max      NUMERIC;
  v_nombre   TEXT;
  v_intentos INTEGER := 0;
BEGIN
  IF NOT fn_usuario_es_super_admin() THEN
    RAISE EXCEPTION 'Solo el super administrador puede generar códigos de autorización';
  END IF;

  SELECT * INTO v_fact FROM facturas WHERE id = p_factura_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_fact.estado <> 'emitida' THEN RAISE EXCEPTION 'La factura no está emitida'; END IF;

  v_max := GREATEST(COALESCE(v_fact.total,0) - COALESCE(v_fact.monto_devuelto,0), 0);
  IF v_max <= 0 THEN RAISE EXCEPTION 'La factura ya fue devuelta en su totalidad'; END IF;

  LOOP
    v_codigo := LPAD((FLOOR(RANDOM() * 1000000))::INTEGER::TEXT, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM autorizaciones a WHERE a.codigo = v_codigo AND a.estado = 'ACTIVO'
    );
    v_intentos := v_intentos + 1;
    IF v_intentos > 20 THEN RAISE EXCEPTION 'No se pudo generar un código único'; END IF;
  END LOOP;

  SELECT TRIM(COALESCE(nombre,'') || ' ' || COALESCE(apellido,'')) INTO v_nombre
  FROM perfiles WHERE id = auth.uid();

  INSERT INTO autorizaciones (
    codigo, proposito, factura_id, sucursal_id, monto_max,
    estado, expira_at, generado_por, generado_por_nombre
  ) VALUES (
    v_codigo,
    CASE WHEN UPPER(p_proposito) = 'ANULACION' THEN 'ANULACION' ELSE 'DEVOLUCION' END,
    p_factura_id, v_fact.sucursal_id, v_max,
    'ACTIVO', NOW() + (p_minutos || ' minutes')::INTERVAL, auth.uid(), v_nombre
  );

  RETURN QUERY SELECT v_codigo, NOW() + (p_minutos || ' minutes')::INTERVAL, v_max;
END;
$$;

-- ── 7. RPC: registrar devolución / anulación (motor atómico) ───
CREATE OR REPLACE FUNCTION fn_registrar_devolucion(
  p_factura_id     INTEGER,
  p_items          JSONB,
  p_motivo         TEXT,
  p_tipo_reembolso TEXT,
  p_referencia     TEXT DEFAULT NULL,
  p_sesion_id      INTEGER DEFAULT NULL,
  p_codigo         TEXT DEFAULT NULL,
  p_anula          BOOLEAN DEFAULT FALSE,
  p_cajero_nombre  TEXT DEFAULT NULL
)
RETURNS devoluciones
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fact     facturas%ROWTYPE;
  v_es_super BOOLEAN;
  v_auth     autorizaciones%ROWTYPE;
  v_item     JSONB;
  v_idx      INTEGER;
  v_cant     NUMERIC;
  v_orig     NUMERIC;
  v_prev     NUMERIC;
  v_subtotal NUMERIC := 0;
  v_isv      NUMERIC := 0;
  v_bruto    NUMERIC := 0;
  v_factor   NUMERIC := 1;
  v_total    NUMERIC := 0;
  v_descuento NUMERIC := 0;
  v_restante NUMERIC;
  v_sucursal INTEGER;
  v_paciente INTEGER;
  v_mov_id   INTEGER := NULL;
  v_correl   INTEGER;
  v_numero   TEXT;
  v_dev      devoluciones%ROWTYPE;
  v_puntos   INTEGER;
  v_saldo_pt INTEGER;
  v_saldo_fv NUMERIC;
  v_prod     INTEGER;
  v_antes    INTEGER;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'No hay ítems para devolver';
  END IF;

  SELECT * INTO v_fact FROM facturas WHERE id = p_factura_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada'; END IF;
  IF v_fact.estado <> 'emitida' THEN RAISE EXCEPTION 'La factura no está emitida (no se puede devolver)'; END IF;

  v_sucursal := v_fact.sucursal_id;
  v_paciente := v_fact.paciente_id;
  v_es_super := fn_usuario_es_super_admin();

  -- Totales desde los ítems recibidos
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_idx  := (v_item->>'factura_item_idx')::INTEGER;
    v_cant := COALESCE((v_item->>'cantidad')::NUMERIC, 0);
    IF v_cant <= 0 THEN RAISE EXCEPTION 'Cantidad inválida en un ítem'; END IF;

    v_subtotal := v_subtotal + COALESCE((v_item->>'subtotal')::NUMERIC, 0);
    v_isv := v_isv + COALESCE((v_item->>'subtotal')::NUMERIC, 0) * COALESCE((v_item->>'isv_pct')::NUMERIC, 0) / 100;

    -- Validar que no se exceda lo disponible en la línea original
    v_orig := COALESCE((v_fact.items -> v_idx ->> 'cantidad')::NUMERIC, 0);
    SELECT COALESCE(SUM((x->>'cantidad')::NUMERIC), 0) INTO v_prev
    FROM devoluciones d, jsonb_array_elements(d.items) x
    WHERE d.factura_id = p_factura_id AND d.estado <> 'ANULADA'
      AND (x->>'factura_item_idx')::INTEGER = v_idx;
    IF v_prev + v_cant > v_orig + 0.001 THEN
      RAISE EXCEPTION 'La cantidad a devolver supera lo disponible en la línea %', v_idx;
    END IF;
  END LOOP;

  -- Si la factura tuvo descuento global, repartirlo proporcionalmente
  -- sobre las líneas devueltas (para no exceder el saldo neto).
  v_bruto := v_subtotal + v_isv;
  IF (COALESCE(v_fact.subtotal,0) + COALESCE(v_fact.isv_monto,0)) > 0 THEN
    v_factor := COALESCE(v_fact.total,0) / (v_fact.subtotal + v_fact.isv_monto);
  END IF;
  IF v_factor > 1 THEN v_factor := 1; END IF;
  v_total := ROUND(v_bruto * v_factor, 2);
  v_descuento := ROUND(v_bruto - v_total, 2);
  IF v_total <= 0 THEN RAISE EXCEPTION 'El total a reembolsar debe ser mayor a cero'; END IF;

  v_restante := GREATEST(COALESCE(v_fact.total,0) - COALESCE(v_fact.monto_devuelto,0), 0);
  IF v_total > v_restante + 0.01 THEN
    RAISE EXCEPTION 'El monto a devolver (L %) supera el saldo de la factura (L %)', ROUND(v_total,2), ROUND(v_restante,2);
  END IF;
  IF p_anula AND v_total < v_restante - 0.01 THEN
    RAISE EXCEPTION 'La anulación debe cubrir el saldo completo de la factura';
  END IF;

  -- Autorización (los no super admin requieren código del super usuario)
  IF NOT v_es_super THEN
    IF p_codigo IS NULL OR LENGTH(TRIM(p_codigo)) = 0 THEN
      RAISE EXCEPTION 'Se requiere un código de autorización del super usuario';
    END IF;
    SELECT * INTO v_auth FROM autorizaciones
    WHERE codigo = TRIM(p_codigo)
      AND estado = 'ACTIVO'
      AND proposito = (CASE WHEN p_anula THEN 'ANULACION' ELSE 'DEVOLUCION' END)
      AND factura_id = p_factura_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Código de autorización inválido o no corresponde a esta operación';
    END IF;
    IF v_auth.expira_at IS NOT NULL AND v_auth.expira_at < NOW() THEN
      UPDATE autorizaciones SET estado = 'EXPIRADO' WHERE id = v_auth.id;
      RAISE EXCEPTION 'El código de autorización venció. Solicite uno nuevo.';
    END IF;
    IF v_auth.monto_max IS NOT NULL AND v_total > v_auth.monto_max + 0.01 THEN
      RAISE EXCEPTION 'El monto excede lo autorizado (máx L %)', ROUND(v_auth.monto_max,2);
    END IF;
  END IF;

  -- Reembolso
  IF p_tipo_reembolso = 'SALDO_FAVOR' THEN
    IF v_paciente IS NULL THEN
      RAISE EXCEPTION 'No se puede dar saldo a favor: la factura no tiene paciente asociado';
    END IF;
    UPDATE pacientes SET saldo_favor = COALESCE(saldo_favor,0) + v_total
    WHERE id = v_paciente RETURNING saldo_favor INTO v_saldo_fv;
  ELSIF p_tipo_reembolso IN ('EFECTIVO','TARJETA','TRANSFERENCIA') THEN
    IF p_sesion_id IS NULL THEN
      RAISE EXCEPTION 'Se requiere una caja abierta para reembolsar en efectivo/tarjeta/transferencia';
    END IF;
    PERFORM 1 FROM caja_sesiones WHERE id = p_sesion_id AND estado = 'ABIERTA';
    IF NOT FOUND THEN RAISE EXCEPTION 'La caja indicada no está abierta'; END IF;
    INSERT INTO caja_movimientos (
      sesion_id, sucursal_id, tipo, concepto, paciente_id, paciente_nombre,
      monto, forma_pago, referencia_pago, nota, cajero_id, fecha, hora
    ) VALUES (
      p_sesion_id, v_sucursal, 'EGRESO',
      (CASE WHEN p_anula THEN 'Anulación' ELSE 'Devolución' END) || ' Factura ' || v_fact.numero,
      v_paciente, v_fact.cliente_nombre, v_total, p_tipo_reembolso,
      p_referencia, COALESCE(p_motivo, 'Devolución'), auth.uid(), CURRENT_DATE, CURRENT_TIME
    ) RETURNING id INTO v_mov_id;
    UPDATE caja_sesiones SET total_egresos = COALESCE(total_egresos,0) + v_total WHERE id = p_sesion_id;
  ELSE
    RAISE EXCEPTION 'Tipo de reembolso inválido: %', p_tipo_reembolso;
  END IF;

  -- Correlativo de nota de crédito
  INSERT INTO devolucion_correlativos (sucursal_id, ultimo_numero)
  VALUES (v_sucursal, 1)
  ON CONFLICT (sucursal_id) DO UPDATE SET ultimo_numero = devolucion_correlativos.ultimo_numero + 1
  RETURNING ultimo_numero INTO v_correl;
  v_numero := 'NC-' || v_sucursal || '-' || LPAD(v_correl::TEXT, 6, '0');

  -- Cabecera de la devolución
  INSERT INTO devoluciones (
    numero, factura_id, factura_numero, paciente_id, paciente_nombre, sucursal_id,
    items, subtotal, descuento_monto, isv_monto, total, motivo,
    tipo_reembolso, referencia_pago, caja_movimiento_id, caja_sesion_id,
    es_anulacion, estado, cajero_nombre, usuario_id
  ) VALUES (
    v_numero, p_factura_id, v_fact.numero, v_paciente, v_fact.cliente_nombre, v_sucursal,
    p_items, ROUND(v_subtotal,2), v_descuento, ROUND(v_isv,2), v_total, p_motivo,
    p_tipo_reembolso, p_referencia, v_mov_id, p_sesion_id,
    p_anula, 'EMITIDA', p_cajero_nombre, auth.uid()
  ) RETURNING * INTO v_dev;

  -- Consumir el código
  IF v_auth.id IS NOT NULL THEN
    UPDATE autorizaciones
    SET estado = 'USADO', usado_por = auth.uid(), usado_en = NOW(), devolucion_id = v_dev.id
    WHERE id = v_auth.id;
  END IF;

  -- Saldo a favor: registrar movimiento
  IF p_tipo_reembolso = 'SALDO_FAVOR' THEN
    INSERT INTO paciente_saldo_movimientos (
      paciente_id, tipo, monto, saldo_despues, devolucion_id, factura_id, nota, usuario_id
    ) VALUES (
      v_paciente, 'ABONO', v_total, v_saldo_fv, v_dev.id, p_factura_id,
      'Saldo a favor por ' || v_numero, auth.uid()
    );
  END IF;

  -- Actualizar factura (el trigger de auditoría usa app.usuario_nombre)
  IF p_anula AND p_cajero_nombre IS NOT NULL THEN
    PERFORM set_config('app.usuario_nombre', p_cajero_nombre, TRUE);
  END IF;
  UPDATE facturas
  SET monto_devuelto = COALESCE(monto_devuelto,0) + v_total,
      estado = CASE WHEN p_anula THEN 'anulada' ELSE estado END,
      motivo_anulacion = CASE WHEN p_anula THEN COALESCE(p_motivo, motivo_anulacion) ELSE motivo_anulacion END,
      fecha_anulacion  = CASE WHEN p_anula THEN NOW() ELSE fecha_anulacion END
  WHERE id = p_factura_id;

  -- Reversa proporcional de puntos
  IF v_paciente IS NOT NULL THEN
    v_puntos := FLOOR(v_total / 26)::INTEGER;
    IF v_puntos > 0 THEN
      UPDATE pacientes SET puntos = GREATEST(COALESCE(puntos,0) - v_puntos, 0)
      WHERE id = v_paciente RETURNING puntos INTO v_saldo_pt;
      INSERT INTO paciente_puntos_movimientos (
        paciente_id, tipo, puntos, saldo_despues, monto_base, factura_id, nota, usuario_id
      ) VALUES (
        v_paciente, 'REVERSO', -v_puntos, COALESCE(v_saldo_pt,0), v_total, p_factura_id,
        'Reverso por ' || v_numero, auth.uid()
      );
      UPDATE devoluciones SET puntos_revertidos = v_puntos WHERE id = v_dev.id;
      v_dev.puntos_revertidos := v_puntos;
    END IF;
  END IF;

  -- Reingreso opcional de inventario
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF COALESCE((v_item->>'reingresa_stock')::BOOLEAN, FALSE)
       AND (v_item->>'producto_id') IS NOT NULL
       AND (v_item->>'producto_id') <> '' THEN
      v_prod := (v_item->>'producto_id')::INTEGER;
      v_cant := COALESCE((v_item->>'cantidad')::NUMERIC, 0);

      SELECT COALESCE(SUM(cantidad),0) INTO v_antes
      FROM inventario WHERE producto_id = v_prod AND sucursal_id = v_sucursal;

      UPDATE inventario SET cantidad = cantidad + v_cant::INTEGER, updated_at = NOW()
      WHERE producto_id = v_prod AND sucursal_id = v_sucursal
        AND COALESCE(lote,'') = '' AND fecha_vencimiento IS NULL;
      IF NOT FOUND THEN
        INSERT INTO inventario (producto_id, sucursal_id, lote, cantidad)
        VALUES (v_prod, v_sucursal, '', v_cant::INTEGER);
      END IF;

      INSERT INTO inventario_movimientos (
        producto_id, sucursal_id, tipo, cantidad, cantidad_antes, cantidad_despues,
        motivo, referencia_tipo, referencia_id, usuario_id
      ) VALUES (
        v_prod, v_sucursal, 'DEVOLUCION', v_cant::INTEGER, v_antes, v_antes + v_cant::INTEGER,
        'Devolución ' || v_numero, 'devolucion', v_dev.id, auth.uid()
      );
    END IF;
  END LOOP;

  RETURN v_dev;
END;
$$;

-- ── 8. RPC: anular una devolución (revierte todo) — super admin ─
CREATE OR REPLACE FUNCTION fn_anular_devolucion(p_id INTEGER, p_motivo TEXT DEFAULT NULL)
RETURNS devoluciones
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_dev   devoluciones%ROWTYPE;
  v_item  JSONB;
  v_prod  INTEGER;
  v_cant  NUMERIC;
  v_saldo_fv NUMERIC;
  v_saldo_pt INTEGER;
BEGIN
  IF NOT fn_usuario_es_super_admin() THEN
    RAISE EXCEPTION 'Solo el super administrador puede anular una devolución';
  END IF;

  SELECT * INTO v_dev FROM devoluciones WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devolución no encontrada'; END IF;
  IF v_dev.estado = 'ANULADA' THEN RAISE EXCEPTION 'La devolución ya está anulada'; END IF;

  -- Revertir reembolso
  IF v_dev.tipo_reembolso = 'SALDO_FAVOR' AND v_dev.paciente_id IS NOT NULL THEN
    UPDATE pacientes SET saldo_favor = GREATEST(COALESCE(saldo_favor,0) - v_dev.total, 0)
    WHERE id = v_dev.paciente_id RETURNING saldo_favor INTO v_saldo_fv;
    INSERT INTO paciente_saldo_movimientos (paciente_id, tipo, monto, saldo_despues, devolucion_id, nota, usuario_id)
    VALUES (v_dev.paciente_id, 'AJUSTE', -v_dev.total, COALESCE(v_saldo_fv,0), v_dev.id,
            'Anulación de ' || v_dev.numero, auth.uid());
  ELSIF v_dev.caja_movimiento_id IS NOT NULL THEN
    UPDATE caja_movimientos SET anulado = TRUE WHERE id = v_dev.caja_movimiento_id;
    IF v_dev.caja_sesion_id IS NOT NULL THEN
      UPDATE caja_sesiones SET total_egresos = GREATEST(COALESCE(total_egresos,0) - v_dev.total, 0)
      WHERE id = v_dev.caja_sesion_id;
    END IF;
  END IF;

  -- Reponer puntos revertidos
  IF v_dev.paciente_id IS NOT NULL AND v_dev.puntos_revertidos > 0 THEN
    UPDATE pacientes SET puntos = COALESCE(puntos,0) + v_dev.puntos_revertidos
    WHERE id = v_dev.paciente_id RETURNING puntos INTO v_saldo_pt;
    INSERT INTO paciente_puntos_movimientos (paciente_id, tipo, puntos, saldo_despues, factura_id, nota, usuario_id)
    VALUES (v_dev.paciente_id, 'AJUSTE', v_dev.puntos_revertidos, COALESCE(v_saldo_pt,0), v_dev.factura_id,
            'Reposición por anulación de ' || v_dev.numero, auth.uid());
  END IF;

  -- Sacar del stock lo que se había reingresado
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_dev.items) LOOP
    IF COALESCE((v_item->>'reingresa_stock')::BOOLEAN, FALSE)
       AND (v_item->>'producto_id') IS NOT NULL
       AND (v_item->>'producto_id') <> '' THEN
      v_prod := (v_item->>'producto_id')::INTEGER;
      v_cant := COALESCE((v_item->>'cantidad')::NUMERIC, 0);
      UPDATE inventario SET cantidad = GREATEST(cantidad - v_cant::INTEGER, 0), updated_at = NOW()
      WHERE producto_id = v_prod AND sucursal_id = v_dev.sucursal_id
        AND COALESCE(lote,'') = '' AND fecha_vencimiento IS NULL;
      INSERT INTO inventario_movimientos (producto_id, sucursal_id, tipo, cantidad, motivo, referencia_tipo, referencia_id, usuario_id)
      VALUES (v_prod, v_dev.sucursal_id, 'AJUSTE', -v_cant::INTEGER, 'Anulación devolución ' || v_dev.numero, 'devolucion', v_dev.id, auth.uid());
    END IF;
  END LOOP;

  -- Revertir el saldo devuelto de la factura; si era anulación, reactivar
  UPDATE facturas
  SET monto_devuelto = GREATEST(COALESCE(monto_devuelto,0) - v_dev.total, 0),
      estado = CASE WHEN v_dev.es_anulacion THEN 'emitida' ELSE estado END
  WHERE id = v_dev.factura_id;

  UPDATE devoluciones SET estado = 'ANULADA', motivo = COALESCE(p_motivo, motivo) WHERE id = v_dev.id
  RETURNING * INTO v_dev;

  RETURN v_dev;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_generar_autorizacion(INTEGER, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_registrar_devolucion(INTEGER, JSONB, TEXT, TEXT, TEXT, INTEGER, TEXT, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_anular_devolucion(INTEGER, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
