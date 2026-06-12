-- Agenda: vincular citas con catálogo de servicios
ALTER TABLE citas ADD COLUMN IF NOT EXISTS servicio_id     INTEGER REFERENCES servicios(id);
ALTER TABLE citas ADD COLUMN IF NOT EXISTS servicio_nombre VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_citas_servicio ON citas(servicio_id);

COMMENT ON COLUMN citas.servicio_id IS 'Servicio/consulta programada desde catálogo';
COMMENT ON COLUMN citas.servicio_nombre IS 'Nombre denormalizado del servicio al agendar';
