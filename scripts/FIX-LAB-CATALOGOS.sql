-- ============================================================
--  FIX / SETUP — Catálogos de laboratorio (médicos + perfiles)
--  y campos extra de la orden de laboratorio.
--
--  Ejecutar TODO este bloque en Supabase → SQL Editor.
--  Es idempotente: se puede correr varias veces sin romper nada.
-- ============================================================

-- ---- MÉDICOS DE REFERENCIA / SOLICITANTES ----
CREATE TABLE IF NOT EXISTS medicos (
    id            SERIAL PRIMARY KEY,
    nombre        VARCHAR(150) NOT NULL,
    especialidad  VARCHAR(120),
    colegiado     VARCHAR(60),
    telefono      VARCHAR(30),
    correo        VARCHAR(120),
    activo        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_medicos_nombre ON medicos (nombre);
CREATE INDEX IF NOT EXISTS idx_medicos_activo ON medicos (activo);

-- ---- PERFILES / PAQUETES DE LABORATORIO ----
CREATE TABLE IF NOT EXISTS lab_perfiles (
    id            SERIAL PRIMARY KEY,
    nombre        VARCHAR(150) NOT NULL,
    descripcion   TEXT,
    precio        NUMERIC(10,2),
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

-- ---- RLS permisiva para autenticados ----
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

-- ---- TRIGGERS updated_at ----
DROP TRIGGER IF EXISTS trg_medicos_updated_at ON medicos;
CREATE TRIGGER trg_medicos_updated_at
  BEFORE UPDATE ON medicos FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_lab_perfiles_updated_at ON lab_perfiles;
CREATE TRIGGER trg_lab_perfiles_updated_at
  BEFORE UPDATE ON lab_perfiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
--  VERIFICACIÓN
-- ============================================================
SELECT 'medicos' AS tabla, COUNT(*) AS filas FROM medicos
UNION ALL SELECT 'lab_perfiles', COUNT(*) FROM lab_perfiles
UNION ALL SELECT 'lab_perfil_pruebas', COUNT(*) FROM lab_perfil_pruebas;

SELECT column_name
FROM information_schema.columns
WHERE table_name = 'consulta_analisis'
  AND column_name IN ('medico_id','medico_nombre','perfil_id','observaciones',
                      'entrega_fecha','entrega_whatsapp','entrega_email','entrega_fisico','urgente')
ORDER BY column_name;
