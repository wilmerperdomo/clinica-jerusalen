-- ═══════════════════════════════════════════════════════════════
-- 019_multi_sucursal.sql
-- Agrega sucursal_id a tablas que aún no lo tienen
-- para que el filtro por sucursal funcione en todos los módulos.
-- ═══════════════════════════════════════════════════════════════

-- ── consulta_analisis (órdenes de lab) ──────────────────────────
ALTER TABLE consulta_analisis
  ADD COLUMN IF NOT EXISTS sucursal_id INTEGER REFERENCES sucursales(id);

CREATE INDEX IF NOT EXISTS idx_consulta_analisis_sucursal
  ON consulta_analisis(sucursal_id);

-- Poblar desde la consulta padre en bloque separado para evitar
-- que el planificador no reconozca la columna recién añadida
DO $$
BEGIN
  UPDATE consulta_analisis ca
  SET    sucursal_id = c.sucursal_id
  FROM   consultas c
  WHERE  ca.id_consulta::INTEGER = c.id
    AND  ca.sucursal_id IS NULL;
END;
$$;

-- ── cxc ─────────────────────────────────────────────────────────
ALTER TABLE cxc
  ADD COLUMN IF NOT EXISTS sucursal_id INTEGER REFERENCES sucursales(id);

CREATE INDEX IF NOT EXISTS idx_cxc_sucursal ON cxc(sucursal_id);

-- compras: la tabla se crea en 013_compras.sql y ya incluye sucursal_id
