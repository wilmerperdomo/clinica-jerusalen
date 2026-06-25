-- ═══════════════════════════════════════════════════════════════
-- 075_promocion_contactos.sql
-- Agenda de contactos para promociones + envíos a contactos externos
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS promocion_contactos (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(200) NOT NULL,
    celular         VARCHAR(30),
    correo          VARCHAR(150),
    notas           TEXT,
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    sucursal_id     INTEGER REFERENCES sucursales(id) ON DELETE SET NULL,
    creado_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_contactos_activo ON promocion_contactos(activo);
CREATE INDEX IF NOT EXISTS idx_promo_contactos_sucursal ON promocion_contactos(sucursal_id);

DROP TRIGGER IF EXISTS trg_promo_contactos_upd ON promocion_contactos;
CREATE TRIGGER trg_promo_contactos_upd
    BEFORE UPDATE ON promocion_contactos FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE promocion_contactos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_promocion_contactos ON promocion_contactos;
CREATE POLICY auth_promocion_contactos ON promocion_contactos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Envíos: permitir paciente O contacto externo
ALTER TABLE promocion_envios
    ALTER COLUMN paciente_id DROP NOT NULL;

ALTER TABLE promocion_envios
    ADD COLUMN IF NOT EXISTS contacto_id INTEGER REFERENCES promocion_contactos(id) ON DELETE CASCADE;

ALTER TABLE promocion_envios DROP CONSTRAINT IF EXISTS promocion_envios_campana_id_paciente_id_canal_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_envios_campana_paciente_canal
    ON promocion_envios (campana_id, paciente_id, canal)
    WHERE paciente_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_envios_campana_contacto_canal
    ON promocion_envios (campana_id, contacto_id, canal)
    WHERE contacto_id IS NOT NULL;

ALTER TABLE promocion_envios DROP CONSTRAINT IF EXISTS promocion_envios_destino_check;
ALTER TABLE promocion_envios ADD CONSTRAINT promocion_envios_destino_check
    CHECK (
        (paciente_id IS NOT NULL AND contacto_id IS NULL)
        OR (paciente_id IS NULL AND contacto_id IS NOT NULL)
    );

COMMENT ON TABLE promocion_contactos IS 'Contactos manuales (WhatsApp/correo) para campañas de promociones';
