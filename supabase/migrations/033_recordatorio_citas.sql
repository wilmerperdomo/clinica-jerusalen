-- Recordatorios de citas: seguimiento de llamadas / WhatsApp al paciente
ALTER TABLE citas ADD COLUMN IF NOT EXISTS recordatorio_estado VARCHAR(20) DEFAULT 'pendiente'
  CHECK (recordatorio_estado IN ('pendiente','llamado','whatsapp','confirmado','no_contacto'));

ALTER TABLE citas ADD COLUMN IF NOT EXISTS recordatorio_at  TIMESTAMPTZ;
ALTER TABLE citas ADD COLUMN IF NOT EXISTS recordatorio_nota TEXT;

COMMENT ON COLUMN citas.recordatorio_estado IS 'Seguimiento: pendiente → llamado/whatsapp → confirmado';
COMMENT ON COLUMN citas.recordatorio_at IS 'Última vez que se contactó al paciente';
