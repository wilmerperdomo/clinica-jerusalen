-- Signos vitales ampliados por enfoque clínico (general / pediatría / gineco-prenatal)
ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS saturacion_oxigeno VARCHAR(10),
  ADD COLUMN IF NOT EXISTS dolor_eva SMALLINT CHECK (dolor_eva IS NULL OR (dolor_eva >= 0 AND dolor_eva <= 10)),
  ADD COLUMN IF NOT EXISTS glucosa_capilar NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS hidratacion VARCHAR(30),
  ADD COLUMN IF NOT EXISTS dificultad_resp VARCHAR(30),
  ADD COLUMN IF NOT EXISTS signos_fum DATE,
  ADD COLUMN IF NOT EXISTS signos_semanas_gestacion NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS signos_fcf INTEGER,
  ADD COLUMN IF NOT EXISTS signos_altura_uterina NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS signos_edema TEXT,
  ADD COLUMN IF NOT EXISTS signos_proteinuria VARCHAR(50);

COMMENT ON COLUMN consultas.saturacion_oxigeno IS 'SpO2 %';
COMMENT ON COLUMN consultas.dolor_eva IS 'Escala visual analógica del dolor 0-10';
COMMENT ON COLUMN consultas.glucosa_capilar IS 'Glucosa capilar mg/dL';
COMMENT ON COLUMN consultas.hidratacion IS 'Estado de hidratación (pediatría)';
COMMENT ON COLUMN consultas.dificultad_resp IS 'Dificultad respiratoria (pediatría)';
COMMENT ON COLUMN consultas.signos_fum IS 'FUM capturada en signos vitales (gineco)';
COMMENT ON COLUMN consultas.signos_semanas_gestacion IS 'Semanas de gestación al momento de signos';
COMMENT ON COLUMN consultas.signos_fcf IS 'Frecuencia cardíaca fetal';
COMMENT ON COLUMN consultas.signos_altura_uterina IS 'Altura uterina cm';
COMMENT ON COLUMN consultas.signos_edema IS 'Edema materno';
COMMENT ON COLUMN consultas.signos_proteinuria IS 'Proteinuria en orina';
