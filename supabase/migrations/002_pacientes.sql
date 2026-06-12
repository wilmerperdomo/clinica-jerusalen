-- ============================================================
--  MÓDULO PACIENTES v2.0
--  Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- ---- LISTA DE PRECIOS (necesaria para paciente) ----
CREATE TABLE IF NOT EXISTS listas_precio (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL,
    descripcion TEXT,
    es_donacion BOOLEAN DEFAULT FALSE,
    activo      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO listas_precio (nombre, descripcion) VALUES
    ('General',    'Precio estándar'),
    ('VIP',        'Precio preferencial'),
    ('Donación',   'Precio especial donaciones')
ON CONFLICT DO NOTHING;

-- ---- PACIENTES / CLIENTES ----
CREATE TABLE IF NOT EXISTS pacientes (
    id              SERIAL PRIMARY KEY,
    codigo          VARCHAR(20) UNIQUE NOT NULL,   -- Cédula / DNI / Pasaporte
    tipo            VARCHAR(10) DEFAULT 'persona'  -- 'persona' | 'empresa'
                    CHECK (tipo IN ('persona', 'empresa')),

    -- Persona natural
    nombre          VARCHAR(100),
    apellido1       VARCHAR(100),
    apellido2       VARCHAR(100),
    genero          VARCHAR(1)  CHECK (genero IN ('M', 'F', 'O')),
    fecha_nac       DATE,

    -- Empresa
    nombre_empresa  VARCHAR(200),
    rtn_empresa     VARCHAR(20),
    contacto        VARCHAR(200),   -- Nombre del contacto en empresa

    -- Contacto
    telefono        VARCHAR(20),
    celular         VARCHAR(20),
    correo          VARCHAR(100),
    direccion       TEXT,

    -- Médico
    lista_id        INTEGER REFERENCES listas_precio(id) DEFAULT 1,
    grupo_sanguineo VARCHAR(5),
    nota            TEXT,

    -- Fidelización
    puntos          INTEGER DEFAULT 0,

    -- Sistema
    sucursal_id     INTEGER REFERENCES sucursales(id),
    activo          BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ---- ANTECEDENTES PERSONALES ----
CREATE TABLE IF NOT EXISTS paciente_antecedentes (
    id              SERIAL PRIMARY KEY,
    paciente_id     INTEGER REFERENCES pacientes(id) ON DELETE CASCADE UNIQUE,
    personal        TEXT,       -- Enfermedades crónicas, cirugías
    alergias        TEXT,       -- Alergias a medicamentos
    familiares      TEXT,       -- Antecedentes familiares
    hospitalario    TEXT,       -- Hospitalizaciones previas
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ---- ANTECEDENTES GINECO-OBSTÉTRICOS ----
CREATE TABLE IF NOT EXISTS paciente_antecedentes_go (
    id              SERIAL PRIMARY KEY,
    paciente_id     INTEGER REFERENCES pacientes(id) ON DELETE CASCADE UNIQUE,
    gestas          INTEGER DEFAULT 0,
    partos          INTEGER DEFAULT 0,
    cesareas        INTEGER DEFAULT 0,
    abortos         INTEGER DEFAULT 0,
    hijos_vivos     INTEGER DEFAULT 0,
    hijos_muertos   INTEGER DEFAULT 0,
    gemelares       INTEGER DEFAULT 0,
    ultima_regla    DATE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ---- ÍNDICES ----
CREATE INDEX IF NOT EXISTS idx_pacientes_codigo    ON pacientes(codigo);
CREATE INDEX IF NOT EXISTS idx_pacientes_nombre    ON pacientes(nombre, apellido1);
CREATE INDEX IF NOT EXISTS idx_pacientes_empresa   ON pacientes(nombre_empresa);
CREATE INDEX IF NOT EXISTS idx_pacientes_sucursal  ON pacientes(sucursal_id);

-- ---- RLS ----
ALTER TABLE pacientes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE listas_precio             ENABLE ROW LEVEL SECURITY;
ALTER TABLE paciente_antecedentes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE paciente_antecedentes_go  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_ve_pacientes"    ON pacientes             FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_crea_pacientes"  ON pacientes             FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_edita_pacientes" ON pacientes             FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_ve_listas"       ON listas_precio         FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_ve_antecedentes" ON paciente_antecedentes FOR ALL    TO authenticated USING (true);
CREATE POLICY "auth_ve_antec_go"     ON paciente_antecedentes_go FOR ALL TO authenticated USING (true);

-- ---- FUNCIÓN: actualizar updated_at automáticamente ----
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE TRIGGER trg_pacientes_updated_at
    BEFORE UPDATE ON pacientes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
