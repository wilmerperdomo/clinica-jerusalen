-- 086_consulta_soap_cie10.sql
-- Catálogo CIE-10, diagnósticos estructurados por consulta.
-- Ejecutar después de 085.

CREATE TABLE IF NOT EXISTS cie10 (
    codigo       VARCHAR(10) PRIMARY KEY,
    descripcion  TEXT NOT NULL,
    capitulo     VARCHAR(120),
    activo       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_cie10_descripcion ON cie10(descripcion);
CREATE INDEX IF NOT EXISTS idx_cie10_activo ON cie10(activo) WHERE activo = TRUE;

CREATE TABLE IF NOT EXISTS consulta_diagnosticos (
    id           SERIAL PRIMARY KEY,
    consulta_id  INTEGER NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
    cie10_codigo VARCHAR(10) REFERENCES cie10(codigo) ON DELETE SET NULL,
    descripcion  TEXT NOT NULL,
    principal    BOOLEAN NOT NULL DEFAULT FALSE,
    orden        SMALLINT NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consulta_dx_consulta ON consulta_diagnosticos(consulta_id);

ALTER TABLE cie10                ENABLE ROW LEVEL SECURITY;
ALTER TABLE consulta_diagnosticos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_cie10_select"        ON cie10;
DROP POLICY IF EXISTS "auth_consulta_diagnosticos" ON consulta_diagnosticos;
CREATE POLICY "auth_cie10_select" ON cie10 FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_consulta_diagnosticos" ON consulta_diagnosticos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Catálogo inicial (atención primaria — ampliar después con importación completa)
INSERT INTO cie10 (codigo, descripcion, capitulo) VALUES
  ('J00', 'Rinofaringitis aguda (resfriado común)', 'Respiratorio'),
  ('J06.9', 'Infección aguda de vías respiratorias superiores, no especificada', 'Respiratorio'),
  ('J02.9', 'Faringitis aguda, no especificada', 'Respiratorio'),
  ('J03.9', 'Amigdalitis aguda, no especificada', 'Respiratorio'),
  ('J20.9', 'Bronquitis aguda, no especificada', 'Respiratorio'),
  ('J18.9', 'Neumonía, no especificada', 'Respiratorio'),
  ('J45.9', 'Asma, no especificada', 'Respiratorio'),
  ('J30.4', 'Rinitis alérgica, no especificada', 'Respiratorio'),
  ('I10', 'Hipertensión esencial (primaria)', 'Cardiovascular'),
  ('I25.9', 'Enfermedad isquémica crónica del corazón, no especificada', 'Cardiovascular'),
  ('I50.9', 'Insuficiencia cardíaca, no especificada', 'Cardiovascular'),
  ('E11.9', 'Diabetes mellitus tipo 2 sin complicaciones', 'Endocrino'),
  ('E11.65', 'Diabetes mellitus tipo 2 con hiperglucemia', 'Endocrino'),
  ('E78.5', 'Hiperlipidemia, no especificada', 'Endocrino'),
  ('E66.9', 'Obesidad, no especificada', 'Endocrino'),
  ('E03.9', 'Hipotiroidismo, no especificado', 'Endocrino'),
  ('K21.9', 'Enfermedad por reflujo gastroesofágico sin esofagitis', 'Digestivo'),
  ('K29.7', 'Gastritis, no especificada', 'Digestivo'),
  ('K59.0', 'Estreñimiento', 'Digestivo'),
  ('K52.9', 'Gastroenteritis y colitis no infecciosas, no especificadas', 'Digestivo'),
  ('K80.2', 'Cálculo de vesícula biliar sin colecistitis', 'Digestivo'),
  ('A09', 'Diarrea y gastroenteritis de presunto origen infeccioso', 'Infeccioso'),
  ('B34.9', 'Infección viral, no especificada', 'Infeccioso'),
  ('N39.0', 'Infección de vías urinarias, sitio no especificado', 'Urinario'),
  ('N76.0', 'Vaginitis aguda', 'Ginecológico'),
  ('N94.6', 'Dismenorrea, no especificada', 'Ginecológico'),
  ('N92.0', 'Menstruación excesiva con ciclo regular', 'Ginecológico'),
  ('O26.9', 'Atención materna por otras afecciones, no especificadas', 'Obstétrico'),
  ('Z34.9', 'Supervisión de embarazo normal, no especificada', 'Obstétrico'),
  ('O80', 'Parto único espontáneo', 'Obstétrico'),
  ('M54.5', 'Lumbago no especificado', 'Musculoesquelético'),
  ('M25.5', 'Dolor articular', 'Musculoesquelético'),
  ('M79.3', 'Paniculitis, no especificada', 'Musculoesquelético'),
  ('G43.9', 'Migraña, no especificada', 'Neurológico'),
  ('G44.2', 'Cefalea tensional', 'Neurológico'),
  ('R51', 'Cefalea', 'Síntomas'),
  ('R10.4', 'Otros dolores abdominales y los no especificados', 'Síntomas'),
  ('R50.9', 'Fiebre, no especificada', 'Síntomas'),
  ('R05', 'Tos', 'Síntomas'),
  ('R11', 'Náusea y vómito', 'Síntomas'),
  ('L30.9', 'Dermatitis, no especificada', 'Piel'),
  ('L20.9', 'Dermatitis atópica, no especificada', 'Piel'),
  ('B35.9', 'Dermatofitosis, no especificada', 'Piel'),
  ('H10.9', 'Conjuntivitis, no especificada', 'Oftalmológico'),
  ('H66.9', 'Otitis media, no especificada', 'ORL'),
  ('J32.9', 'Sinusitis crónica, no especificada', 'ORL'),
  ('F41.9', 'Trastorno de ansiedad, no especificado', 'Mental'),
  ('F32.9', 'Episodio depresivo, no especificado', 'Mental'),
  ('Z00.0', 'Examen médico general', 'Salud'),
  ('Z01.8', 'Otros exámenes especiales', 'Salud'),
  ('Z23', 'Necesidad de inmunización contra enfermedad', 'Salud'),
  ('P07.3', 'Prematuridad', 'Pediátrico'),
  ('J21.9', 'Bronquiolitis aguda, no especificada', 'Pediátrico'),
  ('A37.9', 'Tos ferina, no especificada', 'Pediátrico'),
  ('B82.9', 'Parasitosis intestinal, no especificada', 'Pediátrico'),
  ('R62.0', 'Retraso del crecimiento', 'Pediátrico')
ON CONFLICT (codigo) DO NOTHING;
