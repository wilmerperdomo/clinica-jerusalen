-- ═══════════════════════════════════════════════════════════════
--  060 — Cotización "POR_COBRAR" (pasa por caja antes de facturar)
--   Al convertir una cotización ya no se emite la factura directo:
--   se envía a caja con estado POR_COBRAR; caja cobra y emite la
--   factura fiscal. Aquí se agrega el estado al CHECK constraint.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE cname text;
BEGIN
  IF to_regclass('public.cotizaciones') IS NULL THEN
    RETURN;
  END IF;

  -- Quitar el CHECK de estado existente (nombre puede variar)
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'public.cotizaciones'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%estado%';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE cotizaciones DROP CONSTRAINT %I', cname);
  END IF;

  ALTER TABLE cotizaciones
    ADD CONSTRAINT cotizaciones_estado_check
    CHECK (estado IN ('PENDIENTE','ACEPTADA','VENCIDA','POR_COBRAR','CONVERTIDA','ANULADA'));
END $$;
