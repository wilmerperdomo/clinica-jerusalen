-- Reparar correlativos de factura: sincronizar con facturas existentes y función atómica

-- Sincronizar ultimo_numero desde facturas ya emitidas
INSERT INTO factura_correlativos (sucursal_id, ultimo_numero)
SELECT
  f.sucursal_id,
  COALESCE(MAX(
    NULLIF(regexp_replace(f.numero, '^.*-', ''), '')::BIGINT
  ), 0)
FROM facturas f
GROUP BY f.sucursal_id
ON CONFLICT (sucursal_id) DO UPDATE
SET ultimo_numero = GREATEST(factura_correlativos.ultimo_numero, EXCLUDED.ultimo_numero),
    updated_at    = NOW();

-- Función atómica: siempre MAX(correlativo, facturas existentes) + 1
CREATE OR REPLACE FUNCTION fn_siguiente_correlativo(p_sucursal_id INTEGER)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
  v_siguiente   BIGINT;
  v_max_factura BIGINT;
  v_inicial     BIGINT;
  v_cor         BIGINT;
BEGIN
  SELECT COALESCE(NULLIF(TRIM(numero_inicial::text), ''), '1')::BIGINT
  INTO v_inicial
  FROM sucursales WHERE id = p_sucursal_id;

  IF NOT FOUND THEN v_inicial := 1; END IF;

  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(numero, '^.*-', ''), '')::BIGINT
  ), 0)
  INTO v_max_factura
  FROM facturas
  WHERE sucursal_id = p_sucursal_id;

  INSERT INTO factura_correlativos (sucursal_id, ultimo_numero)
  VALUES (p_sucursal_id, GREATEST(v_inicial - 1, v_max_factura, 0))
  ON CONFLICT (sucursal_id) DO NOTHING;

  SELECT ultimo_numero INTO v_cor
  FROM factura_correlativos
  WHERE sucursal_id = p_sucursal_id
  FOR UPDATE;

  v_siguiente := GREATEST(COALESCE(v_cor, 0), v_max_factura, v_inicial - 1) + 1;

  UPDATE factura_correlativos
  SET ultimo_numero = v_siguiente,
      updated_at    = NOW()
  WHERE sucursal_id = p_sucursal_id;

  RETURN v_siguiente;
END;
$$;
