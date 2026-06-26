-- 085_consulta_clinica_profesional.sql
-- Consulta general ampliada + pediatría y gineco/prenatal profesionales.
-- Ejecutar después de 083 y 084.

-- ── Consulta GENERAL ampliada ───────────────────────────────────
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
CREATE POLICY "auth_consulta_general" ON consulta_general FOR ALL TO authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_consulta_general_updated_at') THEN
      CREATE TRIGGER tr_consulta_general_updated_at
        BEFORE UPDATE ON consulta_general FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
  END IF;
END $$;
