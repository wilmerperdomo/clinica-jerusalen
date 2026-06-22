-- 065 · Fondo de caja sugerido por sucursal
-- El fondo (base/caja chica) es un monto que NO es ingreso del día: se conserva en el
-- cajón y se autocompleta al abrir caja. El cajero puede ajustarlo manualmente.

ALTER TABLE sucursales
  ADD COLUMN IF NOT EXISTS fondo_caja NUMERIC(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN sucursales.fondo_caja IS 'Fondo de caja sugerido (base que se conserva, no cuenta como ingreso del día)';
