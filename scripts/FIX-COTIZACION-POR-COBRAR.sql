-- ═══════════════════════════════════════════════════════════════
--  FIX — Cotización "POR_COBRAR" (pasa por caja antes de facturar)
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Equivale a la migración 060_cotizacion_por_cobrar.sql
--
--  NOTA: SQL plano (sin bloque DO/DECLARE) para que el SQL Editor de
--  Supabase no inserte por error un "ALTER TABLE ... ENABLE RLS".
--  El CHECK de estado se creó inline en 026, por lo que su nombre es
--  determinístico: cotizaciones_estado_check.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE cotizaciones DROP CONSTRAINT IF EXISTS cotizaciones_estado_check;

ALTER TABLE cotizaciones
  ADD CONSTRAINT cotizaciones_estado_check
  CHECK (estado IN ('PENDIENTE','ACEPTADA','VENCIDA','POR_COBRAR','CONVERTIDA','ANULADA'));
