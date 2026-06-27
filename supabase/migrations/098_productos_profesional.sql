-- ═══════════════════════════════════════════════════════════════
--  098 — Productos profesional: historial de precios automático,
--        índices únicos, código autogenerado y categorías dinámicas
-- ═══════════════════════════════════════════════════════════════

-- ── Índice único parcial para código de barra (ignora NULL/vacío) ──
CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_codigo_barra
  ON productos (codigo_barra)
  WHERE codigo_barra IS NOT NULL AND codigo_barra <> '';

-- ── Trigger: registrar cambios de precio/costo automáticamente ─────
CREATE OR REPLACE FUNCTION fn_producto_precio_historial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.precio_venta IS DISTINCT FROM OLD.precio_venta)
     OR (NEW.costo IS DISTINCT FROM OLD.costo) THEN
    BEGIN
      INSERT INTO producto_precio_historial (
        producto_id, precio_anterior, precio_nuevo,
        costo_anterior, costo_nuevo, motivo, usuario_id
      ) VALUES (
        NEW.id, OLD.precio_venta, NEW.precio_venta,
        OLD.costo, NEW.costo,
        NULLIF(current_setting('app.motivo_precio', TRUE), ''),
        auth.uid()
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- nunca bloquear la actualización del producto
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_producto_precio ON productos;
CREATE TRIGGER trg_producto_precio
  AFTER UPDATE OF precio_venta, costo ON productos
  FOR EACH ROW EXECUTE FUNCTION fn_producto_precio_historial();

-- ── Función: siguiente código automático por prefijo ───────────────
CREATE OR REPLACE FUNCTION fn_siguiente_codigo_producto(p_prefijo TEXT DEFAULT 'PRD')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max INTEGER;
BEGIN
  SELECT COALESCE(MAX(
    NULLIF(regexp_replace(codigo, '^' || p_prefijo || '-?', '', 'i'), '')::INTEGER
  ), 0)
  INTO v_max
  FROM productos
  WHERE codigo ~* ('^' || p_prefijo || '-?[0-9]+$');

  RETURN p_prefijo || '-' || LPAD((COALESCE(v_max, 0) + 1)::TEXT, 5, '0');
EXCEPTION WHEN OTHERS THEN
  RETURN p_prefijo || '-' || to_char(NOW(), 'YYMMDDHH24MISS');
END;
$$;

-- ── Índice para búsqueda de historial por producto ─────────────────
CREATE INDEX IF NOT EXISTS idx_prec_hist_producto
  ON producto_precio_historial (producto_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
