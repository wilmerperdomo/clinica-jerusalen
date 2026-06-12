-- ============================================================
--  DESCUENTO POR EDAD — columnas en caja_movimientos
--  Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- Monto antes del descuento (precio de lista)
ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS monto_bruto      NUMERIC(12,2) DEFAULT 0;

-- Porcentaje de descuento aplicado (0 = sin descuento)
ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS descuento_pct    NUMERIC(5,2)  DEFAULT 0;

-- Monto del descuento en lempiras
ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS descuento_monto  NUMERIC(12,2) DEFAULT 0;

-- Motivo: '3ra Edad', '4ta Edad', 'Manual', ''
ALTER TABLE caja_movimientos
  ADD COLUMN IF NOT EXISTS descuento_motivo VARCHAR(30)   DEFAULT '';

-- El campo `monto` existente se usará como el monto NETO (después del descuento)
COMMENT ON COLUMN caja_movimientos.monto        IS 'Monto neto cobrado (después de descuento)';
COMMENT ON COLUMN caja_movimientos.monto_bruto  IS 'Monto de lista antes de descuento';
COMMENT ON COLUMN caja_movimientos.descuento_pct IS 'Porcentaje de descuento aplicado';
COMMENT ON COLUMN caja_movimientos.descuento_motivo IS '3ra Edad | 4ta Edad | Manual | (vacío)';
