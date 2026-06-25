-- ═══════════════════════════════════════════════════════════════
-- 077_promociones_plantillas_tracking_reglas.sql
-- Plantillas, seguimiento de apertura/respuesta y reglas automáticas
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS promocion_plantillas (
    id                  SERIAL PRIMARY KEY,
    nombre              VARCHAR(200) NOT NULL,
    contenido           TEXT NOT NULL,
    categoria_servicio  VARCHAR(30) NOT NULL DEFAULT 'general'
        CHECK (categoria_servicio IN (
            'general', 'consulta', 'laboratorio', 'ultrasonido',
            'procedimiento', 'medicamentos'
        )),
    activa              BOOLEAN NOT NULL DEFAULT TRUE,
    sucursal_id         INTEGER REFERENCES sucursales(id) ON DELETE SET NULL,
    creado_por          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_plantillas_activa ON promocion_plantillas(activa);

DROP TRIGGER IF EXISTS trg_promo_plantillas_upd ON promocion_plantillas;
CREATE TRIGGER trg_promo_plantillas_upd
    BEFORE UPDATE ON promocion_plantillas FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE promocion_plantillas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_promocion_plantillas ON promocion_plantillas;
CREATE POLICY auth_promocion_plantillas ON promocion_plantillas
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seguimiento por envío
ALTER TABLE promocion_envios
    ADD COLUMN IF NOT EXISTS tracking_token UUID DEFAULT gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS abierto_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS respondio_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS respondio BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_envios_tracking_token
    ON promocion_envios (tracking_token) WHERE tracking_token IS NOT NULL;

-- Plantilla en campaña
ALTER TABLE promocion_campanas
    ADD COLUMN IF NOT EXISTS plantilla_id INTEGER REFERENCES promocion_plantillas(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS regla_id INTEGER;

-- Reglas automáticas (cumpleaños, inactivos)
CREATE TABLE IF NOT EXISTS promocion_reglas (
    id                  SERIAL PRIMARY KEY,
    nombre              VARCHAR(200) NOT NULL,
    tipo_disparador     VARCHAR(30) NOT NULL
        CHECK (tipo_disparador IN ('cumpleanos', 'inactivo')),
    promocion_id        INTEGER NOT NULL REFERENCES promociones(id) ON DELETE CASCADE,
    plantilla_id        INTEGER REFERENCES promocion_plantillas(id) ON DELETE SET NULL,
    canal               VARCHAR(20) NOT NULL DEFAULT 'ambos'
        CHECK (canal IN ('whatsapp', 'email', 'ambos')),
    modo_envio          VARCHAR(20) NOT NULL DEFAULT 'automatico'
        CHECK (modo_envio IN ('asistido', 'automatico')),
    dias_anticipacion   INTEGER NOT NULL DEFAULT 0,
    meses_inactivo      INTEGER NOT NULL DEFAULT 6,
    activa              BOOLEAN NOT NULL DEFAULT TRUE,
    sucursal_id         INTEGER REFERENCES sucursales(id) ON DELETE SET NULL,
    creado_por          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promocion_regla_ejecuciones (
    id                      SERIAL PRIMARY KEY,
    regla_id                INTEGER NOT NULL REFERENCES promocion_reglas(id) ON DELETE CASCADE,
    campana_id              INTEGER REFERENCES promocion_campanas(id) ON DELETE SET NULL,
    fecha                   DATE NOT NULL DEFAULT CURRENT_DATE,
    total_destinatarios     INTEGER NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (regla_id, fecha)
);

ALTER TABLE promocion_campanas
    ADD CONSTRAINT promocion_campanas_regla_id_fkey
    FOREIGN KEY (regla_id) REFERENCES promocion_reglas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_promo_reglas_activa ON promocion_reglas(activa, tipo_disparador);
CREATE INDEX IF NOT EXISTS idx_regla_ejec_fecha ON promocion_regla_ejecuciones(regla_id, fecha);

DROP TRIGGER IF EXISTS trg_promo_reglas_upd ON promocion_reglas;
CREATE TRIGGER trg_promo_reglas_upd
    BEFORE UPDATE ON promocion_reglas FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE promocion_reglas ENABLE ROW LEVEL SECURITY;
ALTER TABLE promocion_regla_ejecuciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_promocion_reglas ON promocion_reglas;
CREATE POLICY auth_promocion_reglas ON promocion_reglas
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_promocion_regla_ejec ON promocion_regla_ejecuciones;
CREATE POLICY auth_promocion_regla_ejecuciones ON promocion_regla_ejecuciones
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE promocion_plantillas IS 'Plantillas de mensaje reutilizables para campañas';
COMMENT ON TABLE promocion_reglas IS 'Disparadores automáticos: cumpleaños e inactivos';
COMMENT ON COLUMN promocion_envios.tracking_token IS 'Token único para pixel de apertura en correo';
COMMENT ON COLUMN promocion_envios.abierto_at IS 'Primera apertura (correo o clic asistido WhatsApp)';
COMMENT ON COLUMN promocion_envios.respondio IS 'Marcado cuando el paciente respondió';
