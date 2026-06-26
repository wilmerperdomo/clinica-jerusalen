-- ═══════════════════════════════════════════════════════════════
-- PEGAR TODO ESTO EN SUPABASE → SQL EDITOR Y EJECUTAR (RUN)
-- Incluye 083 + 084 + 085. Es idempotente: se puede correr varias veces.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 083: Enfoque clínico (pediatría / ginecología)
-- ─────────────────────────────────────────────────────────────
ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS enfoque_clinico VARCHAR(20) DEFAULT 'general'
    CHECK (enfoque_clinico IN ('general', 'pediatria', 'ginecologia'));

CREATE TABLE IF NOT EXISTS consulta_pediatria (
    consulta_id         INTEGER PRIMARY KEY REFERENCES consultas(id) ON DELETE CASCADE,
    alimentacion        TEXT,
    hidratacion         TEXT,
    desarrollo          TEXT,
    vacunas_estado      VARCHAR(20) CHECK (vacunas_estado IS NULL OR vacunas_estado IN ('al_dia', 'pendiente', 'desconocido')),
    acompanante         TEXT,
    fiebre              TEXT,
    tos                 TEXT,
    diarrea             TEXT,
    vomitos             TEXT,
    convulsiones        BOOLEAN DEFAULT FALSE,
    notas_pediatria     TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consulta_ginecologia (
    consulta_id         INTEGER PRIMARY KEY REFERENCES consultas(id) ON DELETE CASCADE,
    fum                 DATE,
    fpp                 DATE,
    semanas_gestacion   NUMERIC(4,1),
    embarazo_activo     BOOLEAN DEFAULT FALSE,
    gestas              INTEGER,
    partos              INTEGER,
    cesareas            INTEGER,
    abortos             INTEGER,
    hijos_vivos         INTEGER,
    dolor_pelvico       TEXT,
    sangrado            TEXT,
    flujo_vaginal       TEXT,
    planificacion       TEXT,
    examen_vulva        TEXT,
    examen_especulo     TEXT,
    examen_tv           TEXT,
    notas_ginecologia   TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consulta_pediatria_consulta ON consulta_pediatria(consulta_id);
CREATE INDEX IF NOT EXISTS idx_consulta_ginecologia_consulta ON consulta_ginecologia(consulta_id);

ALTER TABLE consulta_pediatria   ENABLE ROW LEVEL SECURITY;
ALTER TABLE consulta_ginecologia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_ve_consulta_pediatria"   ON consulta_pediatria;
DROP POLICY IF EXISTS "auth_ve_consulta_ginecologia" ON consulta_ginecologia;
CREATE POLICY "auth_ve_consulta_pediatria"   ON consulta_pediatria   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_ve_consulta_ginecologia" ON consulta_ginecologia FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- 084: Embarazo, control prenatal, vacunas
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS embarazo (
    id              SERIAL PRIMARY KEY,
    paciente_id     INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    fum             DATE,
    fpp             DATE,
    activo          BOOLEAN DEFAULT TRUE,
    fecha_registro  DATE DEFAULT CURRENT_DATE,
    notas           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embarazo_paciente ON embarazo(paciente_id);
CREATE INDEX IF NOT EXISTS idx_embarazo_activo ON embarazo(paciente_id) WHERE activo = TRUE;

CREATE TABLE IF NOT EXISTS control_prenatal (
    consulta_id         INTEGER PRIMARY KEY REFERENCES consultas(id) ON DELETE CASCADE,
    embarazo_id         INTEGER REFERENCES embarazo(id) ON DELETE SET NULL,
    num_control         INTEGER,
    semanas_gestacion   NUMERIC(4,1),
    peso_materno        NUMERIC(5,2),
    presion_arterial    VARCHAR(20),
    fcf                 INTEGER,
    altura_uterina      NUMERIC(4,1),
    proteinuria         VARCHAR(50),
    edema               TEXT,
    usg_resumen         TEXT,
    labs_notas          TEXT,
    notas               TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_control_prenatal_embarazo ON control_prenatal(embarazo_id);

CREATE TABLE IF NOT EXISTS vacuna_catalogo (
    id              SERIAL PRIMARY KEY,
    codigo          VARCHAR(30) UNIQUE NOT NULL,
    nombre          VARCHAR(120) NOT NULL,
    dosis_etiqueta  VARCHAR(40),
    edad_min_meses  INTEGER DEFAULT 0,
    edad_max_meses  INTEGER,
    intervalo_meses INTEGER,
    activo          BOOLEAN DEFAULT TRUE,
    orden           INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS paciente_vacuna (
    id              SERIAL PRIMARY KEY,
    paciente_id     INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    vacuna_id       INTEGER NOT NULL REFERENCES vacuna_catalogo(id),
    fecha_aplicada  DATE NOT NULL,
    consulta_id     INTEGER REFERENCES consultas(id) ON DELETE SET NULL,
    lote            VARCHAR(50),
    notas           TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(paciente_id, vacuna_id, fecha_aplicada)
);

CREATE INDEX IF NOT EXISTS idx_paciente_vacuna_paciente ON paciente_vacuna(paciente_id);

ALTER TABLE embarazo         ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_prenatal ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacuna_catalogo  ENABLE ROW LEVEL SECURITY;
ALTER TABLE paciente_vacuna  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_embarazo"         ON embarazo;
DROP POLICY IF EXISTS "auth_control_prenatal" ON control_prenatal;
DROP POLICY IF EXISTS "auth_vacuna_catalogo"  ON vacuna_catalogo;
DROP POLICY IF EXISTS "auth_paciente_vacuna"  ON paciente_vacuna;
CREATE POLICY "auth_embarazo"         ON embarazo         FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_control_prenatal" ON control_prenatal FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_vacuna_catalogo"  ON vacuna_catalogo  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_paciente_vacuna"  ON paciente_vacuna  FOR ALL    TO authenticated USING (true) WITH CHECK (true);

INSERT INTO vacuna_catalogo (codigo, nombre, dosis_etiqueta, edad_min_meses, edad_max_meses, intervalo_meses, orden) VALUES
  ('BCG',           'BCG',                          'Al nacer',     0,  1,   NULL, 10),
  ('HEPB_0',        'Hepatitis B',                  'Al nacer',     0,  1,   1,    20),
  ('HEPB_2',        'Hepatitis B',                  '2a dosis',     1,  3,   2,    21),
  ('HEPB_6',        'Hepatitis B',                  '3a dosis',     6,  8,   NULL, 22),
  ('PENTA_2',       'Pentavalente (DPT+Hib+HepB)',  '2 meses',      2,  3,   2,    30),
  ('PENTA_4',       'Pentavalente (DPT+Hib+HepB)',  '4 meses',      4,  5,   2,    31),
  ('PENTA_6',       'Pentavalente (DPT+Hib+HepB)',  '6 meses',      6,  7,   NULL, 32),
  ('OPV_2',         'Polio (OPV/IPV)',              '2 meses',      2,  3,   2,    40),
  ('OPV_4',         'Polio (OPV/IPV)',              '4 meses',      4,  5,   2,    41),
  ('OPV_6',         'Polio (OPV/IPV)',              '6 meses',      6,  7,   NULL, 42),
  ('ROTA_2',        'Rotavirus',                    '2 meses',      2,  3,   2,    50),
  ('ROTA_4',        'Rotavirus',                    '4 meses',      4,  5,   NULL, 51),
  ('NEUMO_2',       'Neumococo conjugada',          '2 meses',      2,  3,   2,    60),
  ('NEUMO_4',       'Neumococo conjugada',          '4 meses',      4,  5,   2,    61),
  ('NEUMO_12',      'Neumococo conjugada',          '12 meses',    12, 14,   NULL, 62),
  ('SR_12',         'Sarampion-Rubeola (SR)',       '12 meses',    12, 14,   NULL, 70),
  ('DPT_18',        'DPT refuerzo',                 '18 meses',    18, 20,   NULL, 80),
  ('INFLUENZA_6',   'Influenza estacional',         '6 meses+',     6, 72,   12,   90)
ON CONFLICT (codigo) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 085: Consulta general ampliada + columnas ped/gineco
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS consulta_general (
    consulta_id             INTEGER PRIMARY KEY REFERENCES consultas(id) ON DELETE CASCADE,
    rev_cardiovascular      TEXT,
    rev_respiratorio        TEXT,
    rev_digestivo           TEXT,
    rev_neurologico         TEXT,
    rev_urinario            TEXT,
    rev_piel                TEXT,
    rev_musculo_esqueletico TEXT,
    diagnostico_principal   TEXT,
    diagnosticos_secundarios TEXT,
    plan_medicamentos       TEXT,
    plan_estudios           TEXT,
    plan_recomendaciones    TEXT,
    plan_signos_alarma      TEXT,
    plan_seguimiento        TEXT,
    escala_dolor            SMALLINT CHECK (escala_dolor IS NULL OR (escala_dolor >= 0 AND escala_dolor <= 10)),
    glasgow                 SMALLINT CHECK (glasgow IS NULL OR (glasgow >= 3 AND glasgow <= 15)),
    imc                     NUMERIC(5,2),
    plantilla_usada         VARCHAR(40),
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE consulta_pediatria
  ADD COLUMN IF NOT EXISTS control_nino_sano       VARCHAR(40),
  ADD COLUMN IF NOT EXISTS hitos_desarrollo        TEXT,
  ADD COLUMN IF NOT EXISTS tipo_alimentacion       VARCHAR(60),
  ADD COLUMN IF NOT EXISTS alarma_fiebre_rn        BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alarma_dificultad_resp  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alarma_deshidratacion   BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dosis_calculadas        TEXT;

ALTER TABLE consulta_ginecologia
  ADD COLUMN IF NOT EXISTS menarquia               TEXT,
  ADD COLUMN IF NOT EXISTS ciclos_menstruales      TEXT,
  ADD COLUMN IF NOT EXISTS pap                     TEXT,
  ADD COLUMN IF NOT EXISTS its                     TEXT,
  ADD COLUMN IF NOT EXISTS mamografia              TEXT,
  ADD COLUMN IF NOT EXISTS riesgo_prenatal         VARCHAR(20) CHECK (riesgo_prenatal IS NULL OR riesgo_prenatal IN ('bajo', 'alto')),
  ADD COLUMN IF NOT EXISTS alarma_sangrado         BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alarma_cefalea          BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alarma_edema            BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alarma_dolor_epigastrico BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS alarma_mov_fetales      BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS checklist_t1            TEXT,
  ADD COLUMN IF NOT EXISTS checklist_t2            TEXT,
  ADD COLUMN IF NOT EXISTS checklist_t3            TEXT,
  ADD COLUMN IF NOT EXISTS plan_parto_hospital     TEXT,
  ADD COLUMN IF NOT EXISTS plan_parto_signos       TEXT,
  ADD COLUMN IF NOT EXISTS plan_parto_notas        TEXT;

ALTER TABLE control_prenatal
  ADD COLUMN IF NOT EXISTS riesgo_prenatal VARCHAR(20) CHECK (riesgo_prenatal IS NULL OR riesgo_prenatal IN ('bajo', 'alto'));

ALTER TABLE consulta_general ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_consulta_general" ON consulta_general;
CREATE POLICY "auth_consulta_general" ON consulta_general FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────
-- Triggers updated_at (todas las tablas nuevas)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_consulta_pediatria_updated_at') THEN
      CREATE TRIGGER tr_consulta_pediatria_updated_at BEFORE UPDATE ON consulta_pediatria FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_consulta_ginecologia_updated_at') THEN
      CREATE TRIGGER tr_consulta_ginecologia_updated_at BEFORE UPDATE ON consulta_ginecologia FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_embarazo_updated_at') THEN
      CREATE TRIGGER tr_embarazo_updated_at BEFORE UPDATE ON embarazo FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_control_prenatal_updated_at') THEN
      CREATE TRIGGER tr_control_prenatal_updated_at BEFORE UPDATE ON control_prenatal FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_consulta_general_updated_at') THEN
      CREATE TRIGGER tr_consulta_general_updated_at BEFORE UPDATE ON consulta_general FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- Verificación: todas deben devolver el nombre, no NULL
-- ─────────────────────────────────────────────────────────────
SELECT
  to_regclass('public.consulta_general')      AS consulta_general,
  to_regclass('public.consulta_pediatria')    AS consulta_pediatria,
  to_regclass('public.consulta_ginecologia')  AS consulta_ginecologia,
  to_regclass('public.embarazo')              AS embarazo,
  to_regclass('public.control_prenatal')      AS control_prenatal,
  to_regclass('public.vacuna_catalogo')       AS vacuna_catalogo,
  to_regclass('public.paciente_vacuna')       AS paciente_vacuna;

-- ─────────────────────────────────────────────────────────────
-- 086: CIE-10 + diagnósticos estructurados
-- ─────────────────────────────────────────────────────────────
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

INSERT INTO cie10 (codigo, descripcion, capitulo) VALUES
  ('J00', 'Rinofaringitis aguda (resfriado comun)', 'Respiratorio'),
  ('J06.9', 'Infeccion aguda de vias respiratorias superiores, no especificada', 'Respiratorio'),
  ('J02.9', 'Faringitis aguda, no especificada', 'Respiratorio'),
  ('J03.9', 'Amigdalitis aguda, no especificada', 'Respiratorio'),
  ('J20.9', 'Bronquitis aguda, no especificada', 'Respiratorio'),
  ('J18.9', 'Neumonia, no especificada', 'Respiratorio'),
  ('J45.9', 'Asma, no especificada', 'Respiratorio'),
  ('J30.4', 'Rinitis alergica, no especificada', 'Respiratorio'),
  ('I10', 'Hipertension esencial (primaria)', 'Cardiovascular'),
  ('I25.9', 'Enfermedad isquemica cronica del corazon, no especificada', 'Cardiovascular'),
  ('I50.9', 'Insuficiencia cardiaca, no especificada', 'Cardiovascular'),
  ('E11.9', 'Diabetes mellitus tipo 2 sin complicaciones', 'Endocrino'),
  ('E11.65', 'Diabetes mellitus tipo 2 con hiperglucemia', 'Endocrino'),
  ('E78.5', 'Hiperlipidemia, no especificada', 'Endocrino'),
  ('E66.9', 'Obesidad, no especificada', 'Endocrino'),
  ('E03.9', 'Hipotiroidismo, no especificado', 'Endocrino'),
  ('K21.9', 'Enfermedad por reflujo gastroesofagico sin esofagitis', 'Digestivo'),
  ('K29.7', 'Gastritis, no especificada', 'Digestivo'),
  ('K59.0', 'Estrenimiento', 'Digestivo'),
  ('K52.9', 'Gastroenteritis y colitis no infecciosas, no especificadas', 'Digestivo'),
  ('K80.2', 'Calculo de vesicula biliar sin colecistitis', 'Digestivo'),
  ('A09', 'Diarrea y gastroenteritis de presunto origen infeccioso', 'Infeccioso'),
  ('B34.9', 'Infeccion viral, no especificada', 'Infeccioso'),
  ('N39.0', 'Infeccion de vias urinarias, sitio no especificado', 'Urinario'),
  ('N76.0', 'Vaginitis aguda', 'Ginecologico'),
  ('N94.6', 'Dismenorrea, no especificada', 'Ginecologico'),
  ('N92.0', 'Menstruacion excesiva con ciclo regular', 'Ginecologico'),
  ('O26.9', 'Atencion materna por otras afecciones, no especificadas', 'Obstetrico'),
  ('Z34.9', 'Supervision de embarazo normal, no especificada', 'Obstetrico'),
  ('O80', 'Parto unico espontaneo', 'Obstetrico'),
  ('M54.5', 'Lumbago no especificado', 'Musculoesqueletico'),
  ('M25.5', 'Dolor articular', 'Musculoesqueletico'),
  ('M79.3', 'Paniculitis, no especificada', 'Musculoesqueletico'),
  ('G43.9', 'Migrana, no especificada', 'Neurologico'),
  ('G44.2', 'Cefalea tensional', 'Neurologico'),
  ('R51', 'Cefalea', 'Sintomas'),
  ('R10.4', 'Otros dolores abdominales y los no especificados', 'Sintomas'),
  ('R50.9', 'Fiebre, no especificada', 'Sintomas'),
  ('R05', 'Tos', 'Sintomas'),
  ('R11', 'Nausea y vomito', 'Sintomas'),
  ('L30.9', 'Dermatitis, no especificada', 'Piel'),
  ('L20.9', 'Dermatitis atopica, no especificada', 'Piel'),
  ('B35.9', 'Dermatofitosis, no especificada', 'Piel'),
  ('H10.9', 'Conjuntivitis, no especificada', 'Oftalmologico'),
  ('H66.9', 'Otitis media, no especificada', 'ORL'),
  ('J32.9', 'Sinusitis cronica, no especificada', 'ORL'),
  ('F41.9', 'Trastorno de ansiedad, no especificado', 'Mental'),
  ('F32.9', 'Episodio depresivo, no especificado', 'Mental'),
  ('Z00.0', 'Examen medico general', 'Salud'),
  ('Z01.8', 'Otros examenes especiales', 'Salud'),
  ('Z23', 'Necesidad de inmunizacion contra enfermedad', 'Salud'),
  ('P07.3', 'Prematuridad', 'Pediatrico'),
  ('J21.9', 'Bronquiolitis aguda, no especificada', 'Pediatrico'),
  ('A37.9', 'Tos ferina, no especificada', 'Pediatrico'),
  ('B82.9', 'Parasitosis intestinal, no especificada', 'Pediatrico'),
  ('R62.0', 'Retraso del crecimiento', 'Pediatrico')
ON CONFLICT (codigo) DO NOTHING;

SELECT
  to_regclass('public.cie10')                 AS cie10,
  to_regclass('public.consulta_diagnosticos') AS consulta_diagnosticos,
  (SELECT COUNT(*)::int FROM cie10)           AS codigos_cie10;
