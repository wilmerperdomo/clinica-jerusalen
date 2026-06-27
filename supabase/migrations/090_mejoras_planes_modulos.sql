-- Mejoras planes médicos y módulos (090)
-- Ejecutar en Supabase SQL Editor si no usa migraciones automáticas

-- Límite de beneficiarios por tipo de plan
ALTER TABLE membresia_tipos
  ADD COLUMN IF NOT EXISTS max_beneficiarios INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN membresia_tipos.max_beneficiarios IS '0 = sin límite';

-- Vigencia por beneficiario
ALTER TABLE membresia_beneficiarios
  ADD COLUMN IF NOT EXISTS fecha_inicio DATE,
  ADD COLUMN IF NOT EXISTS fecha_fin DATE;

-- Estado cancelado en membresías (si el CHECK lo permite, ampliar)
DO $$
BEGIN
  ALTER TABLE membresias DROP CONSTRAINT IF EXISTS membresias_estado_check;
  ALTER TABLE membresias ADD CONSTRAINT membresias_estado_check
    CHECK (estado IN ('activo','inactivo','vencido','cancelado'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
