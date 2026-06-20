-- ═══════════════════════════════════════════════════════════════
--  FIX — Cotización "POR_COBRAR" (pasa por caja antes de facturar)
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Equivale a la migración 060_cotizacion_por_cobrar.sql
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE cname text;
BEGIN
  IF to_regclass('public.cotizaciones') IS NULL THEN
    RAISE NOTICE 'La tabla cotizaciones no existe; nada que hacer.';
    RETURN;
  END IF;

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
