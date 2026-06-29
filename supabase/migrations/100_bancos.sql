-- Catálogo editable de bancos para transferencias en caja.
-- Permite administrar la lista desde la app sin tocar código.

CREATE TABLE IF NOT EXISTS bancos (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(150) NOT NULL,
    activo      BOOLEAN     DEFAULT TRUE,
    orden       INTEGER     DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bancos_nombre_unique ON bancos (nombre);
CREATE INDEX IF NOT EXISTS idx_bancos_activo ON bancos (activo);

ALTER TABLE bancos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_ve_bancos"    ON bancos;
DROP POLICY IF EXISTS "auth_edita_bancos" ON bancos;

CREATE POLICY "auth_ve_bancos"    ON bancos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_edita_bancos" ON bancos FOR ALL    TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_bancos_updated_at ON bancos;
CREATE TRIGGER trg_bancos_updated_at
    BEFORE UPDATE ON bancos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Datos iniciales (bancos de Honduras). 'Otro' permite registrar excepciones.
INSERT INTO bancos (nombre) VALUES
    ('BAC Honduras'),
    ('Banco Atlántida'),
    ('Banco Ficohsa'),
    ('Banco de Occidente'),
    ('BANPAÍS'),
    ('Banco Lafise'),
    ('Banco Promerica'),
    ('Banco Davivienda'),
    ('Banco Cuscatlán'),
    ('Banco Popular'),
    ('Banco Azteca'),
    ('BANHCAFE'),
    ('BANRURAL'),
    ('Banco de los Trabajadores (BANTRAB)'),
    ('Banco Nacional de Desarrollo Agrícola (BANADESA)'),
    ('Banco Central de Honduras'),
    ('Otro')
ON CONFLICT (nombre) DO NOTHING;
