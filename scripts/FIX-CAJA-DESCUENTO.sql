-- Ejecutar en Supabase → SQL Editor si falla el cobro:
-- "Could not find the 'descuento_monto' column of 'caja_movimientos'"

ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS monto_bruto      NUMERIC(12,2) DEFAULT 0;

ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS descuento_pct    NUMERIC(5,2)  DEFAULT 0;

ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS descuento_monto  NUMERIC(12,2) DEFAULT 0;

ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS descuento_motivo VARCHAR(30)   DEFAULT '';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'caja_movimientos'
  AND column_name IN ('monto_bruto', 'descuento_pct', 'descuento_monto', 'descuento_motivo')
ORDER BY column_name;
