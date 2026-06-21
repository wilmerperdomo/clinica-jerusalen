-- 064 · Beneficios estructurados de membresía
-- Permite que el sistema aplique automáticamente en caja los beneficios del plan:
-- consulta gratis y % de descuento por categoría (consulta, laboratorio, medicamentos, servicios).
-- Los beneficios de texto (membresia_beneficios) se conservan como descripción informativa.

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

COMMENT ON COLUMN membresia_tipos.consulta_gratis  IS 'La consulta médica no se cobra (100% cubierta por el plan)';
COMMENT ON COLUMN membresia_tipos.pct_consulta     IS '% de descuento en consulta (si no es gratis), 0-100';
COMMENT ON COLUMN membresia_tipos.pct_laboratorio  IS '% de descuento en laboratorio, 0-100';
COMMENT ON COLUMN membresia_tipos.pct_medicamentos IS '% de descuento en medicamentos, 0-100';
COMMENT ON COLUMN membresia_tipos.pct_servicios    IS '% de descuento en servicios/procedimientos, 0-100';
