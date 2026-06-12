-- ============================================================
--  MÓDULO CONSULTAS MÉDICAS v2.0
--  Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- ---- TIPOS DE CONSULTA ----
CREATE TABLE IF NOT EXISTS consulta_tipo (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(100) NOT NULL,
    valor       NUMERIC(10,2) DEFAULT 0,
    activo      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO consulta_tipo (nombre, valor) VALUES
    ('Consulta General',         300.00),
    ('Consulta Especialista',    500.00),
    ('Consulta Pediátrica',      350.00),
    ('Control Prenatal',         400.00),
    ('Urgencia',                 600.00),
    ('Revisión / Seguimiento',   200.00)
ON CONFLICT DO NOTHING;

-- ---- CITAS (AGENDA) ----
CREATE TABLE IF NOT EXISTS citas (
    id              SERIAL PRIMARY KEY,
    paciente_id     INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    sucursal_id     INTEGER REFERENCES sucursales(id),
    fecha           DATE NOT NULL,
    hora            TIME NOT NULL,
    nota            TEXT,
    estado          VARCHAR(20) DEFAULT 'ACTIVO'
                    CHECK (estado IN ('ACTIVO','CANCELADO','ASISTIÓ','NO ASISTIÓ','ATENDIDO')),
    created_by      UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ---- CONSULTAS MÉDICAS ----
CREATE TABLE IF NOT EXISTS consultas (
    id                      SERIAL PRIMARY KEY,
    paciente_id             INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE RESTRICT,
    tipo_id                 INTEGER REFERENCES consulta_tipo(id),
    tipo_nombre             VARCHAR(100),
    sucursal_id             INTEGER REFERENCES sucursales(id),
    doctor_id               UUID REFERENCES auth.users(id),
    fecha                   DATE NOT NULL DEFAULT CURRENT_DATE,
    hora                    TIME NOT NULL DEFAULT CURRENT_TIME,
    fecha_nac_paciente      DATE,

    -- Estado del flujo
    estado                  VARCHAR(20) DEFAULT 'REGISTRO'
                            CHECK (estado IN ('REGISTRO','SIGNOS','ATENDIENDO','FINALIZADO','PAGADO','CANCELADO')),
    estado_pago             VARCHAR(20) DEFAULT 'PENDIENTE'
                            CHECK (estado_pago IN ('PENDIENTE','PAGADO','EXONERADO')),

    -- Signos vitales
    presion                 VARCHAR(20),
    frecuencia              VARCHAR(20),
    pulso                   VARCHAR(20),
    temperatura             VARCHAR(10),
    peso                    NUMERIC(6,2),
    talla                   NUMERIC(6,2),
    perim_cefalico          NUMERIC(6,2),

    -- Examen físico (NL = Normal)
    cabeza                  VARCHAR(100) DEFAULT 'NL',
    cuello                  VARCHAR(100) DEFAULT 'NL',
    ojos                    VARCHAR(100) DEFAULT 'NL',
    orl                     VARCHAR(100) DEFAULT 'NL',
    pulmonar                VARCHAR(100) DEFAULT 'NL',
    abdomen                 VARCHAR(100) DEFAULT 'NL',
    genito                  VARCHAR(100) DEFAULT 'NL',
    extremidades            VARCHAR(100) DEFAULT 'NL',
    sistema                 VARCHAR(100) DEFAULT 'NL',
    oste                    VARCHAR(100) DEFAULT 'NL',
    piel                    VARCHAR(100) DEFAULT 'NL',

    -- Clínico
    sintoma                 TEXT,
    historia                TEXT,
    impresion               TEXT,
    tratamiento             TEXT,
    estudios_complementarios TEXT,
    dias_reposo             INTEGER DEFAULT 0,
    nota                    TEXT,

    -- Cobro
    consulta_valor          NUMERIC(10,2) DEFAULT 0,
    consulta_otros          NUMERIC(10,2) DEFAULT 0,
    consulta_nota           TEXT,

    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ---- SERVICIOS DE CONSULTA ----
CREATE TABLE IF NOT EXISTS consulta_servicios (
    id              SERIAL PRIMARY KEY,
    consulta_id     INTEGER NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
    servicio_id     INTEGER,
    nombre          VARCHAR(200) NOT NULL,
    valor           NUMERIC(10,2) DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ---- ÍNDICES ----
CREATE INDEX IF NOT EXISTS idx_citas_fecha        ON citas(fecha);
CREATE INDEX IF NOT EXISTS idx_citas_paciente     ON citas(paciente_id);
CREATE INDEX IF NOT EXISTS idx_consultas_fecha    ON consultas(fecha);
CREATE INDEX IF NOT EXISTS idx_consultas_paciente ON consultas(paciente_id);
CREATE INDEX IF NOT EXISTS idx_consultas_estado   ON consultas(estado);
CREATE INDEX IF NOT EXISTS idx_consultas_sucursal ON consultas(sucursal_id);

-- ---- TRIGGER updated_at ----
CREATE OR REPLACE TRIGGER trg_citas_upd
    BEFORE UPDATE ON citas FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_consultas_upd
    BEFORE UPDATE ON consultas FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---- RLS ----
ALTER TABLE consulta_tipo       ENABLE ROW LEVEL SECURITY;
ALTER TABLE citas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE consulta_servicios  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_consulta_tipo"      ON consulta_tipo      FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_citas_sel"          ON citas              FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_citas_ins"          ON citas              FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_citas_upd"          ON citas              FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_citas_del"          ON citas              FOR DELETE TO authenticated USING (true);
CREATE POLICY "auth_consultas_sel"      ON consultas          FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_consultas_ins"      ON consultas          FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_consultas_upd"      ON consultas          FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_consulta_serv_all"  ON consulta_servicios FOR ALL TO authenticated USING (true);
