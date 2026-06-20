-- ═══════════════════════════════════════════════════════════════
--  059 — Relación FK de cotizaciones (sucursal/paciente)
--   Síntoma: "Could not find a relationship between 'cotizaciones'
--   and 'sucursales' in the schema cache".
--   Causa: cotizaciones.sucursal_id se creó sin REFERENCES, así que
--   PostgREST no reconoce la relación para joins embebidos.
--   Se agrega como NOT VALID para no fallar con datos legacy.
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.cotizaciones') IS NULL THEN
    RETURN;
  END IF;

  -- FK a sucursales
  IF to_regclass('public.sucursales') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM information_schema.table_constraints
       WHERE table_name = 'cotizaciones' AND constraint_name = 'fk_cotizaciones_sucursal'
     ) THEN
    EXECUTE 'ALTER TABLE cotizaciones
             ADD CONSTRAINT fk_cotizaciones_sucursal
             FOREIGN KEY (sucursal_id) REFERENCES sucursales(id) NOT VALID';
  END IF;

  -- FK a pacientes (opcional, mejora joins)
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

-- Refrescar el caché de esquema de PostgREST
NOTIFY pgrst, 'reload schema';
