-- ============================================================
--  LABORATORIO — Catálogos de médicos y perfiles/paquetes
--  + campos extra en consulta_analisis (médico, perfil,
--    observaciones, entrega, urgente)
--  Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- ---- MÉDICOS DE REFERENCIA / SOLICITANTES ----
CREATE TABLE IF NOT EXISTS medicos (
    id            SERIAL PRIMARY KEY,
    nombre        VARCHAR(150) NOT NULL,
    especialidad  VARCHAR(120),
    colegiado     VARCHAR(60),          -- número de colegiación / registro (opcional)
    telefono      VARCHAR(30),
    correo        VARCHAR(120),
    activo        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_medicos_nombre ON medicos (nombre);
CREATE INDEX IF NOT EXISTS idx_medicos_activo ON medicos (activo);

-- ---- PERFILES / PAQUETES DE LABORATORIO ----
-- Un perfil agrupa VARIAS pruebas distintas (ej. "Perfil prenatal").
-- Distinto de laboratorio_info.es_panel + lab_panel_campos, que son los
-- parámetros internos de UNA sola prueba.
CREATE TABLE IF NOT EXISTS lab_perfiles (
    id            SERIAL PRIMARY KEY,
    nombre        VARCHAR(150) NOT NULL,
    descripcion   TEXT,
    precio        NUMERIC(10,2),        -- NULL = se cobra la suma de las pruebas que contiene
    activo        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lab_perfil_pruebas (
    id          SERIAL PRIMARY KEY,
    perfil_id   INTEGER NOT NULL REFERENCES lab_perfiles(id) ON DELETE CASCADE,
    prueba_id   INTEGER NOT NULL REFERENCES laboratorio_info(id) ON DELETE CASCADE,
    UNIQUE (perfil_id, prueba_id)
);

CREATE INDEX IF NOT EXISTS idx_lab_perfil_pruebas_perfil ON lab_perfil_pruebas (perfil_id);
CREATE INDEX IF NOT EXISTS idx_lab_perfil_pruebas_prueba ON lab_perfil_pruebas (prueba_id);

-- ---- COLUMNAS EXTRA EN consulta_analisis ----
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS medico_id         INTEGER REFERENCES medicos(id);
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS medico_nombre     VARCHAR(150);
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS perfil_id         INTEGER REFERENCES lab_perfiles(id);
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS observaciones     TEXT;
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS entrega_fecha     TIMESTAMPTZ;
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS entrega_whatsapp  BOOLEAN DEFAULT FALSE;
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS entrega_email     BOOLEAN DEFAULT FALSE;
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS entrega_fisico    BOOLEAN DEFAULT FALSE;
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS urgente           BOOLEAN DEFAULT FALSE;

-- ---- RLS (permisiva para usuarios autenticados, patrón de las demás tablas) ----
DO $$
DECLARE
  t TEXT;
  pol RECORD;
  tablas TEXT[] := ARRAY['medicos', 'lab_perfiles', 'lab_perfil_pruebas'];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
      END LOOP;
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        'auth_' || t || '_all', t
      );
    END IF;
  END LOOP;
END $$;

-- ---- TRIGGERS updated_at (reutiliza update_updated_at de 002_pacientes.sql) ----
DROP TRIGGER IF EXISTS trg_medicos_updated_at ON medicos;
CREATE TRIGGER trg_medicos_updated_at
  BEFORE UPDATE ON medicos FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_lab_perfiles_updated_at ON lab_perfiles;
CREATE TRIGGER trg_lab_perfiles_updated_at
  BEFORE UPDATE ON lab_perfiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
