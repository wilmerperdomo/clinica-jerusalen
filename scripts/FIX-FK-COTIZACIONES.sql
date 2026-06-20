-- ═══════════════════════════════════════════════════════════════
--  FIX — "Could not find a relationship between 'cotizaciones'
--         and 'sucursales' in the schema cache"
--  (Opcional: el código ya no depende del join embebido. Esto
--   habilita los joins de Supabase y mejora la integridad.)
--  Ejecutar en: Supabase → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.cotizaciones') IS NULL THEN
    RAISE NOTICE 'La tabla cotizaciones no existe; nada que hacer.';
    RETURN;
  END IF;

  IF to_regclass('public.sucursales') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE table_name = 'cotizaciones' AND constraint_name = 'fk_cotizaciones_sucursal'
     ) THEN
    EXECUTE 'ALTER TABLE cotizaciones
             ADD CONSTRAINT fk_cotizaciones_sucursal
             FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) NOT VALID';
  END IF;

  IF to_regclass('public.pacientes') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE table_name = 'cotizaciones' AND constraint_name = 'fk_cotizaciones_paciente'
     ) THEN
    EXECUTE 'ALTER TABLE cotizaciones
             ADD CONSTRAINT fk_cotizaciones_paciente
             FOREIGN KEY (paciente_id) REFERENCES pacientes(id) NOT VALID';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
