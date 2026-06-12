-- Columnas de descuento en caja_movimientos (migración 007 — re-aplicar si faltó en producción)

ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS monto_bruto      NUMERIC(12,2) DEFAULT 0;

ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS descuento_pct    NUMERIC(5,2)  DEFAULT 0;

ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS descuento_monto  NUMERIC(12,2) DEFAULT 0;

ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS descuento_motivo VARCHAR(30)   DEFAULT '';

COMMENT ON COLUMN caja_movimientos.monto IS 'Monto neto cobrado (después de descuento)';
COMMENT ON COLUMN caja_movimientos.monto_bruto IS 'Monto de lista antes de descuento';
COMMENT ON COLUMN caja_movimientos.descuento_pct IS 'Porcentaje de descuento aplicado';
COMMENT ON COLUMN caja_movimientos.descuento_motivo IS '3ra Edad | 4ta Edad | Manual | (vacío)';
