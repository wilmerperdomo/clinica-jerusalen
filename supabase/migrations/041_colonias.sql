-- Catálogo de colonias (sistema viejo: tabla colonia, paciente.dir = colonia_id)

CREATE TABLE IF NOT EXISTS colonias (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(200) NOT NULL,
    activo      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_colonias_nombre_unique ON colonias (nombre);

ALTER TABLE pacientes
    ADD COLUMN IF NOT EXISTS colonia_id INTEGER REFERENCES colonias(id);

CREATE INDEX IF NOT EXISTS idx_pacientes_colonia ON pacientes(colonia_id);

ALTER TABLE colonias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_ve_colonias"    ON colonias;
DROP POLICY IF EXISTS "auth_edita_colonias" ON colonias;

CREATE POLICY "auth_ve_colonias"    ON colonias FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_edita_colonias" ON colonias FOR ALL    TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_colonias_updated_at ON colonias;
CREATE TRIGGER trg_colonias_updated_at
    BEFORE UPDATE ON colonias
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Datos iniciales (colonias reales del sistema viejo, sin registros basura "1")
INSERT INTO colonias (nombre) VALUES
    ('Montes de Sinaí'),
    ('Res. La Cañada'),
    ('Monterey'),
    ('La Vega'),
    ('BABANATO'),
    ('Res. La Roma'),
    ('SANTA ANA'),
    ('Miraflores'),
    ('EL MANANTIAL'),
    ('Los Pinos'),
    ('Villa Nueva'),
    ('Villa Vieja'),
    ('Res. Honduras'),
    ('La Granja'),
    ('Los Llanos'),
    ('Res. La Nabu'),
    ('La Peña por Arriba'),
    ('San José de la Peña'),
    ('La Joya'),
    ('Las Brisas'),
    ('Otra Colonia'),
    ('San Angel'),
    ('LA BODEGA'),
    ('Res. La Vega'),
    ('San Isidro'),
    ('Oscar A. Flores'),
    ('Tizatillo'),
    ('San Buenaventura'),
    ('Prohinco'),
    ('Villa Foresta'),
    ('Santa Clara'),
    ('San Sebastian'),
    ('Maria Auxiliadora'),
    ('Reynel Funez'),
    ('Res. Lomas del Sur'),
    ('Ojojona'),
    ('Sabana Grande'),
    ('Los Alpes'),
    ('LAS QUEBRADITAS'),
    ('RES. SANTA CRISTINA'),
    ('CERRO DE HULA')
ON CONFLICT (nombre) DO NOTHING;
