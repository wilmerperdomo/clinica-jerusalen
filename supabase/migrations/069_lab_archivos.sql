-- Resultados externos (maquila): archivos PDF/imagen + flag en órdenes

CREATE TABLE IF NOT EXISTS lab_archivos (
    id              SERIAL PRIMARY KEY,
    lab_grupo_id    VARCHAR(64) NOT NULL,
    paciente_id     INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    orden_id        INTEGER REFERENCES consulta_analisis(id) ON DELETE SET NULL,
    storage_path    TEXT NOT NULL,
    nombre_archivo  TEXT NOT NULL,
    mime_type       VARCHAR(100),
    tamano_bytes    BIGINT,
    tipo            VARCHAR(20) NOT NULL DEFAULT 'EXTERNO',
    subido_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_archivos_grupo ON lab_archivos(lab_grupo_id);
CREATE INDEX IF NOT EXISTS idx_lab_archivos_paciente ON lab_archivos(paciente_id);

ALTER TABLE consulta_analisis
    ADD COLUMN IF NOT EXISTS resultado_externo BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE lab_archivos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_lab_archivos_all ON lab_archivos;
CREATE POLICY auth_lab_archivos_all ON lab_archivos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('lab-resultados', 'lab-resultados', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS auth_upload_lab_resultados ON storage.objects;
DROP POLICY IF EXISTS auth_read_lab_resultados ON storage.objects;
DROP POLICY IF EXISTS auth_delete_lab_resultados ON storage.objects;

CREATE POLICY auth_upload_lab_resultados ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'lab-resultados');

CREATE POLICY auth_read_lab_resultados ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'lab-resultados');

CREATE POLICY auth_delete_lab_resultados ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'lab-resultados');

COMMENT ON TABLE lab_archivos IS 'PDF/imagen de resultados maquilados o adjuntos por grupo de laboratorio';
