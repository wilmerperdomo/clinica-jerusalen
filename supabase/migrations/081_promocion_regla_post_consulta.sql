-- ═══════════════════════════════════════════════════════════════
-- 081_promocion_regla_post_consulta.sql
-- Encuesta automática X horas después de una consulta finalizada
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE promocion_reglas
    ADD COLUMN IF NOT EXISTS horas_post_consulta INTEGER NOT NULL DEFAULT 24;

ALTER TABLE promocion_reglas
    DROP CONSTRAINT IF EXISTS promocion_reglas_tipo_disparador_check;
ALTER TABLE promocion_reglas
    ADD CONSTRAINT promocion_reglas_tipo_disparador_check
    CHECK (tipo_disparador IN ('cumpleanos', 'inactivo', 'post_consulta'));

CREATE TABLE IF NOT EXISTS promocion_regla_consulta_envios (
    id              SERIAL PRIMARY KEY,
    regla_id        INTEGER NOT NULL REFERENCES promocion_reglas(id) ON DELETE CASCADE,
    consulta_id     INTEGER NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
    campana_id      INTEGER REFERENCES promocion_campanas(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (regla_id, consulta_id)
);

CREATE INDEX IF NOT EXISTS idx_regla_consulta_regla ON promocion_regla_consulta_envios(regla_id);
CREATE INDEX IF NOT EXISTS idx_regla_consulta_consulta ON promocion_regla_consulta_envios(consulta_id);

ALTER TABLE promocion_regla_consulta_envios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_promocion_regla_consulta ON promocion_regla_consulta_envios;
CREATE POLICY auth_promocion_regla_consulta ON promocion_regla_consulta_envios
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON COLUMN promocion_reglas.horas_post_consulta IS 'Horas después de finalizar consulta para enviar encuesta (post_consulta)';
COMMENT ON TABLE promocion_regla_consulta_envios IS 'Evita enviar la misma encuesta dos veces por consulta';
