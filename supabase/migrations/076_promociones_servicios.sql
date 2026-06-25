-- ═══════════════════════════════════════════════════════════════
-- 076_promociones_servicios.sql
-- Promociones vinculadas a servicios (consulta, lab, ultrasonido, etc.)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE promociones
    ADD COLUMN IF NOT EXISTS categoria_servicio VARCHAR(30) NOT NULL DEFAULT 'general'
        CHECK (categoria_servicio IN (
            'general', 'consulta', 'laboratorio', 'ultrasonido',
            'procedimiento', 'medicamentos'
        )),
    ADD COLUMN IF NOT EXISTS servicio_id INTEGER REFERENCES servicios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS descuento_pct NUMERIC(5,2),
    ADD COLUMN IF NOT EXISTS precio_promocional NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_promociones_categoria ON promociones(categoria_servicio, activa);
CREATE INDEX IF NOT EXISTS idx_promociones_servicio ON promociones(servicio_id);

COMMENT ON COLUMN promociones.categoria_servicio IS 'Área clínica de la promoción: consulta, laboratorio, ultrasonido, etc.';
COMMENT ON COLUMN promociones.servicio_id IS 'Servicio específico del catálogo (opcional)';
COMMENT ON COLUMN promociones.descuento_pct IS 'Porcentaje de descuento ofrecido (informativo en el mensaje)';
COMMENT ON COLUMN promociones.precio_promocional IS 'Precio promocional fijo (informativo en el mensaje)';
