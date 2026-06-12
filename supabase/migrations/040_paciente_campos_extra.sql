-- Campos adicionales del sistema viejo (responsable / parentesco)

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS responsable VARCHAR(200);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS parentesco VARCHAR(80);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS telefono_responsable VARCHAR(20);
