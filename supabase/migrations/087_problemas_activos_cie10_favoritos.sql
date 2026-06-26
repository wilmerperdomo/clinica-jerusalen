-- 087_problemas_activos_cie10_favoritos.sql
-- Problemas activos del paciente y favoritos CIE-10 por médico.

CREATE TABLE IF NOT EXISTS paciente_problema_activo (
    id           SERIAL PRIMARY KEY,
    paciente_id  INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    etiqueta     VARCHAR(120) NOT NULL,
    cie10_codigo VARCHAR(10) REFERENCES cie10(codigo) ON DELETE SET NULL,
    activo       BOOLEAN NOT NULL DEFAULT TRUE,
    notas        TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_problema_paciente ON paciente_problema_activo(paciente_id);
CREATE INDEX IF NOT EXISTS idx_problema_activo ON paciente_problema_activo(paciente_id) WHERE activo = TRUE;

CREATE TABLE IF NOT EXISTS medico_cie10_favorito (
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    cie10_codigo VARCHAR(10) NOT NULL REFERENCES cie10(codigo) ON DELETE CASCADE,
    uso_count    INTEGER NOT NULL DEFAULT 1,
    updated_at   TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, cie10_codigo)
);

ALTER TABLE paciente_problema_activo ENABLE ROW LEVEL SECURITY;
ALTER TABLE medico_cie10_favorito ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_problema_activo" ON paciente_problema_activo;
DROP POLICY IF EXISTS "auth_cie10_favorito" ON medico_cie10_favorito;
CREATE POLICY "auth_problema_activo" ON paciente_problema_activo FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_cie10_favorito" ON medico_cie10_favorito FOR ALL TO authenticated USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'tr_problema_activo_updated_at') THEN
      CREATE TRIGGER tr_problema_activo_updated_at
        BEFORE UPDATE ON paciente_problema_activo FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
  END IF;
END $$;
