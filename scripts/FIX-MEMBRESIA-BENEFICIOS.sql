-- Ejecutar en Supabase → SQL Editor para habilitar beneficios estructurados de membresía.
-- Agrega a los planes: consulta gratis y % de descuento por categoría.

ALTER TABLE membresia_tipos
  ADD COLUMN IF NOT EXISTS consulta_gratis   BOOLEAN      NOT NULL DEFAULT FALSE;

ALTER TABLE membresia_tipos
  ADD COLUMN IF NOT EXISTS pct_consulta      NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE membresia_tipos
  ADD COLUMN IF NOT EXISTS pct_laboratorio   NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE membresia_tipos
  ADD COLUMN IF NOT EXISTS pct_medicamentos  NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE membresia_tipos
  ADD COLUMN IF NOT EXISTS pct_servicios     NUMERIC(5,2) NOT NULL DEFAULT 0;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'membresia_tipos'
  AND column_name IN ('consulta_gratis','pct_consulta','pct_laboratorio','pct_medicamentos','pct_servicios')
ORDER BY column_name;
