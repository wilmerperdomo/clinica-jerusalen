-- Documentos clínicos (receta, constancia, defunción) + archivos de examen

CREATE TABLE IF NOT EXISTS documento_correlativos (
  id            SERIAL PRIMARY KEY,
  sucursal_id   INTEGER NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
  tipo          VARCHAR(20) NOT NULL CHECK (tipo IN ('RECETA', 'CONSTANCIA', 'DEFUNCION')),
  ultimo_numero INTEGER NOT NULL DEFAULT 0,
  UNIQUE (sucursal_id, tipo)
);

CREATE TABLE IF NOT EXISTS consulta_documentos (
  id              SERIAL PRIMARY KEY,
  consulta_id     INTEGER NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
  paciente_id     INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  sucursal_id     INTEGER REFERENCES sucursales(id),
  tipo            VARCHAR(20) NOT NULL CHECK (tipo IN ('RECETA', 'CONSTANCIA', 'DEFUNCION')),
  correlativo     INTEGER NOT NULL,
  numero_doc      VARCHAR(40) NOT NULL,
  contenido       JSONB NOT NULL DEFAULT '{}',
  medico_id       UUID REFERENCES auth.users(id),
  medico_nombre   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consulta_documentos_consulta ON consulta_documentos(consulta_id);
CREATE INDEX IF NOT EXISTS idx_consulta_documentos_tipo ON consulta_documentos(consulta_id, tipo);

CREATE TABLE IF NOT EXISTS consulta_archivos (
  id              SERIAL PRIMARY KEY,
  consulta_id     INTEGER REFERENCES consultas(id) ON DELETE SET NULL,
  paciente_id     INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  categoria       VARCHAR(50) DEFAULT 'examen',
  storage_path    TEXT NOT NULL,
  mime_type       TEXT,
  tamano_bytes    INTEGER,
  nota            TEXT,
  subido_por      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consulta_archivos_paciente ON consulta_archivos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_consulta_archivos_consulta ON consulta_archivos(consulta_id);

ALTER TABLE documento_correlativos ENABLE ROW LEVEL SECURITY;
ALTER TABLE consulta_documentos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE consulta_archivos     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_documento_correlativos" ON documento_correlativos;
CREATE POLICY "auth_documento_correlativos" ON documento_correlativos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_consulta_documentos" ON consulta_documentos;
CREATE POLICY "auth_consulta_documentos" ON consulta_documentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_consulta_archivos" ON consulta_archivos;
CREATE POLICY "auth_consulta_archivos" ON consulta_archivos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('consulta-archivos', 'consulta-archivos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "auth_upload_consulta_archivos" ON storage.objects;
DROP POLICY IF EXISTS "auth_read_consulta_archivos" ON storage.objects;
DROP POLICY IF EXISTS "auth_delete_consulta_archivos" ON storage.objects;

CREATE POLICY "auth_upload_consulta_archivos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'consulta-archivos');

CREATE POLICY "auth_read_consulta_archivos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'consulta-archivos');

CREATE POLICY "auth_delete_consulta_archivos" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'consulta-archivos');
