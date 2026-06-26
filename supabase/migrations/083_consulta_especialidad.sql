-- 083_consulta_especialidad.sql
-- Enfoque clínico opcional (pediatría / ginecología) dentro del mismo módulo de consultas.
-- Ejecutar en Supabase antes de probar en local.

ALTER TABLE consultas
  ADD COLUMN IF NOT EXISTS enfoque_clinico VARCHAR(20) DEFAULT 'general'
    CHECK (enfoque_clinico IN ('general', 'pediatria', 'ginecologia'));

COMMENT ON COLUMN consultas.enfoque_clinico IS
  'Enfoque clínico activo en el examen: general, pediatria o ginecologia.';

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

CREATE POLICY "auth_ve_consulta_pediatria"
  ON consulta_pediatria FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_ve_consulta_ginecologia"
  ON consulta_ginecologia FOR ALL TO authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_consulta_pediatria_updated_at') THEN
      CREATE TRIGGER tr_consulta_pediatria_updated_at
        BEFORE UPDATE ON consulta_pediatria
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_consulta_ginecologia_updated_at') THEN
      CREATE TRIGGER tr_consulta_ginecologia_updated_at
        BEFORE UPDATE ON consulta_ginecologia
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
  END IF;
END $$;
