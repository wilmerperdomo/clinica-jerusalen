-- 084_control_prenatal_vacunas.sql
-- Serie de controles prenatales, carnet de vacunación y base para curvas de crecimiento.
-- Ejecutar en Supabase después de 083_consulta_especialidad.sql

-- ── Embarazo activo (episodio por paciente) ─────────────────────
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

-- ── Control prenatal por consulta (1:1) ─────────────────────────
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

-- ── Catálogo de vacunas (esquema pediátrico simplificado) ───────
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

-- ── RLS ─────────────────────────────────────────────────────────
ALTER TABLE embarazo           ENABLE ROW LEVEL SECURITY;
ALTER TABLE control_prenatal     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vacuna_catalogo      ENABLE ROW LEVEL SECURITY;
ALTER TABLE paciente_vacuna      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_embarazo"        ON embarazo        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_control_prenatal" ON control_prenatal FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_vacuna_catalogo"  ON vacuna_catalogo  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_paciente_vacuna"  ON paciente_vacuna  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── Triggers updated_at ─────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_embarazo_updated_at') THEN
      CREATE TRIGGER tr_embarazo_updated_at
        BEFORE UPDATE ON embarazo FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_control_prenatal_updated_at') THEN
      CREATE TRIGGER tr_control_prenatal_updated_at
        BEFORE UPDATE ON control_prenatal FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
  END IF;
END $$;

-- ── Catálogo inicial (Honduras / ESAP simplificado) ─────────────
INSERT INTO vacuna_catalogo (codigo, nombre, dosis_etiqueta, edad_min_meses, edad_max_meses, intervalo_meses, orden) VALUES
  ('BCG',           'BCG',                          'Al nacer',     0,  1,   NULL, 10),
  ('HEPB_0',        'Hepatitis B',                  'Al nacer',     0,  1,   1,    20),
  ('HEPB_2',        'Hepatitis B',                  '2ª dosis',     1,  3,   2,    21),
  ('HEPB_6',        'Hepatitis B',                  '3ª dosis',     6,  8,   NULL, 22),
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
  ('SR_12',         'Sarampión-Rubéola (SR)',       '12 meses',    12, 14,   NULL, 70),
  ('DPT_18',        'DPT refuerzo',                 '18 meses',    18, 20,   NULL, 80),
  ('INFLUENZA_6',   'Influenza estacional',         '6 meses+',     6, 72,   12,   90)
ON CONFLICT (codigo) DO NOTHING;
