-- ════════════════════════════════════════════════════════════════
--  099: FIX consulta_servicios — columnas precio / cantidad / usuario
--  Problema: 003_consultas.sql creó la tabla con columna `valor`
--  (sin precio ni cantidad). 016_consulta_servicios.sql usa
--  CREATE TABLE IF NOT EXISTS, por lo que NO altera la tabla ya
--  existente. El código inserta `precio` y `cantidad`, generando:
--    Could not find the 'cantidad' column of 'consulta_servicios'
--  Esta migración garantiza que las columnas existan y copia los
--  valores históricos de `valor` → `precio`. Es idempotente.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE consulta_servicios
  ADD COLUMN IF NOT EXISTS precio   NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE consulta_servicios
  ADD COLUMN IF NOT EXISTS cantidad INTEGER       NOT NULL DEFAULT 1;

ALTER TABLE consulta_servicios
  ADD COLUMN IF NOT EXISTS usuario  VARCHAR(100);

-- Backfill: copiar `valor` histórico hacia `precio` cuando exista la
-- columna antigua y el precio aún esté en 0.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'consulta_servicios' AND column_name = 'valor'
  ) THEN
    EXECUTE 'UPDATE consulta_servicios SET precio = valor WHERE precio = 0 AND valor IS NOT NULL AND valor <> 0';
  END IF;
END $$;

-- Refrescar el schema cache de PostgREST para que Supabase reconozca
-- las nuevas columnas de inmediato.
NOTIFY pgrst, 'reload schema';
