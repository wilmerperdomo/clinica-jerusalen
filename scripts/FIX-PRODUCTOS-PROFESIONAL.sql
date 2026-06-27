-- FIX: Productos profesional — pegar en Supabase SQL Editor
-- (mismo contenido que supabase/migrations/098_productos_profesional.sql)

CREATE UNIQUE INDEX IF NOT EXISTS uq_productos_codigo_barra
  ON productos (codigo_barra)
  WHERE codigo_barra IS NOT NULL AND codigo_barra <> '';

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
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_producto_precio ON productos;
CREATE TRIGGER trg_producto_precio
  AFTER UPDATE OF precio_venta, costo ON productos
  FOR EACH ROW EXECUTE FUNCTION fn_producto_precio_historial();

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

CREATE INDEX IF NOT EXISTS idx_prec_hist_producto
  ON producto_precio_historial (producto_id, created_at DESC);

-- Honduras: medicamentos exentos de ISV
UPDATE productos
   SET gravado = FALSE, isv_porcentaje = 0
 WHERE tipo = 'Medicamento'
   AND (gravado IS DISTINCT FROM FALSE OR isv_porcentaje IS DISTINCT FROM 0);

NOTIFY pgrst, 'reload schema';
