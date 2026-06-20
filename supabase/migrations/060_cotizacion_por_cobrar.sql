-- ═══════════════════════════════════════════════════════════════
--  060 — Cotización "POR_COBRAR" (pasa por caja antes de facturar)
--   Al convertir una cotización ya no se emite la factura directo:
--   se envía a caja con estado POR_COBRAR; caja cobra y emite la
--   factura fiscal. Aquí se agrega el estado al CHECK constraint.
--
--   El CHECK de estado se creó inline en 026 (estado VARCHAR ... CHECK),
--   por lo que su nombre es determinístico: cotizaciones_estado_check.
--   Se usa SQL plano para evitar que el SQL Editor de Supabase inyecte
--   un "ENABLE ROW LEVEL SECURITY" al detectar variables DECLARE.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_estado_check;

ALTER TABLE cotizaciones
  ADD CONSTRAINT cotizaciones_estado_check
  CHECK (estado IN ('PENDIENTE','ACEPTADA','VENCIDA','POR_COBRAR','CONVERTIDA','ANULADA'));
