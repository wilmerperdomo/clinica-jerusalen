-- ═══════════════════════════════════════════════════════════════
-- 080_promociones_encuestas.sql
-- Encuestas de satisfacción enviables como campañas de promociones
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE promociones
    ADD COLUMN IF NOT EXISTS encuesta_url TEXT;

ALTER TABLE promociones
    DROP CONSTRAINT IF EXISTS promociones_tipo_contenido_check;
ALTER TABLE promociones
    ADD CONSTRAINT promociones_tipo_contenido_check
    CHECK (tipo_contenido IN ('texto', 'imagen', 'mixto', 'encuesta'));

COMMENT ON COLUMN promociones.encuesta_url IS 'Enlace a Google Forms u otra encuesta (tipo_contenido = encuesta)';
