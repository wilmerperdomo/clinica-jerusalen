-- ============================================================
--  MÓDULO CAJA / VENTAS v3.0  (sin FK opcionales problemáticas)
--  Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- ---- CONCEPTOS DE CAJA (catálogo) ----
CREATE TABLE IF NOT EXISTS caja_conceptos (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(150) NOT NULL,
    tipo        VARCHAR(10)  NOT NULL CHECK (tipo IN ('INGRESO','EGRESO')),
    categoria   VARCHAR(50),
    activo      BOOLEAN DEFAULT TRUE
);

INSERT INTO caja_conceptos (nombre, tipo, categoria) VALUES
    ('Consulta Médica',              'INGRESO', 'Consultas'),
    ('Consulta Especialista',        'INGRESO', 'Consultas'),
    ('Control Prenatal',             'INGRESO', 'Consultas'),
    ('Aplicación de Inyección',      'INGRESO', 'Servicios'),
    ('Toma de Presión Arterial',     'INGRESO', 'Servicios'),
    ('Curación / Procedimiento',     'INGRESO', 'Servicios'),
    ('Examen de Laboratorio',        'INGRESO', 'Laboratorio'),
    ('Venta de Medicamentos',        'INGRESO', 'Farmacia'),
    ('Venta de Productos',           'INGRESO', 'Farmacia'),
    ('Membresía / Carnet',           'INGRESO', 'Membresía'),
    ('Otro Ingreso',                 'INGRESO', 'Otros'),
    -- EGRESOS
    ('Pago Laboratorio Externo',     'EGRESO',  'Laboratorio'),
    ('Compra de Medicamentos',       'EGRESO',  'Compras'),
    ('Compra de Insumos',            'EGRESO',  'Compras'),
    ('Adelanto de Sueldo',           'EGRESO',  'Nómina'),
    ('Pago de Servicios (agua/luz)', 'EGRESO',  'Gastos Fijos'),
    ('Gastos de Limpieza',           'EGRESO',  'Gastos Fijos'),
    ('Otros Gastos',                 'EGRESO',  'Otros')
ON CONFLICT DO NOTHING;

-- ---- SESIONES DE CAJA (apertura / cierre) ----
CREATE TABLE IF NOT EXISTS caja_sesiones (
    id                  SERIAL PRIMARY KEY,
    sucursal_id         INTEGER REFERENCES sucursales(id),
    cajero_id           UUID    REFERENCES auth.users(id),
    cajero_nombre       VARCHAR(150),
    fecha               DATE    NOT NULL DEFAULT CURRENT_DATE,
    hora_apertura       TIME    NOT NULL DEFAULT CURRENT_TIME,
    monto_inicial       NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- cierre
    hora_cierre         TIME,
    monto_efectivo_real NUMERIC(12,2),
    monto_tarjeta_real  NUMERIC(12,2),
    monto_transfer_real NUMERIC(12,2),
    total_ingresos      NUMERIC(12,2) DEFAULT 0,
    total_egresos       NUMERIC(12,2) DEFAULT 0,
    total_creditos      NUMERIC(12,2) DEFAULT 0,
    saldo_esperado      NUMERIC(12,2) DEFAULT 0,
    diferencia          NUMERIC(12,2) DEFAULT 0,
    observacion         TEXT,
    estado              VARCHAR(10) DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA','CERRADA')),
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Solo una sesión abierta por cajero por día
DROP INDEX IF EXISTS idx_sesion_unica;
CREATE UNIQUE INDEX idx_sesion_unica
    ON caja_sesiones(cajero_id, fecha)
    WHERE estado = 'ABIERTA';

-- ---- MOVIMIENTOS DE CAJA ----
CREATE TABLE IF NOT EXISTS caja_movimientos (
    id              SERIAL PRIMARY KEY,
    sesion_id       INTEGER NOT NULL REFERENCES caja_sesiones(id) ON DELETE CASCADE,
    sucursal_id     INTEGER,               -- sin FK por ahora
    tipo            VARCHAR(10)  NOT NULL CHECK (tipo IN ('INGRESO','EGRESO')),
    concepto_id     INTEGER REFERENCES caja_conceptos(id),
    concepto        VARCHAR(200) NOT NULL,
    -- referencias opcionales (sin FK para evitar errores de orden)
    paciente_id     INTEGER,
    paciente_nombre VARCHAR(200),
    consulta_id     INTEGER,
    -- cobro
    monto           NUMERIC(12,2) NOT NULL DEFAULT 0,
    forma_pago      VARCHAR(20)  NOT NULL DEFAULT 'EFECTIVO'
                    CHECK (forma_pago IN ('EFECTIVO','TARJETA','TRANSFERENCIA','CREDITO')),
    referencia_pago VARCHAR(100),
    nota            TEXT,
    cajero_id       UUID REFERENCES auth.users(id),
    fecha           DATE DEFAULT CURRENT_DATE,
    hora            TIME DEFAULT CURRENT_TIME,
    anulado         BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ---- CUENTAS POR COBRAR ----
CREATE TABLE IF NOT EXISTS cxc (
    id              SERIAL PRIMARY KEY,
    paciente_id     INTEGER,               -- sin FK obligatoria
    paciente_nombre VARCHAR(200),
    concepto        VARCHAR(200),
    monto_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
    monto_pagado    NUMERIC(12,2) NOT NULL DEFAULT 0,
    saldo           NUMERIC(12,2) NOT NULL DEFAULT 0,  -- se actualiza por trigger/app
    movimiento_id   INTEGER,               -- sin FK por ahora
    estado          VARCHAR(15) DEFAULT 'PENDIENTE'
                    CHECK (estado IN ('PENDIENTE','PARCIAL','PAGADO','CANCELADO')),
    fecha           DATE DEFAULT CURRENT_DATE,
    fecha_pago      DATE,
    nota            TEXT,
    cajero_id       UUID REFERENCES auth.users(id),
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ---- ABONOS A CXC ----
CREATE TABLE IF NOT EXISTS cxc_abonos (
    id          SERIAL PRIMARY KEY,
    cxc_id      INTEGER NOT NULL REFERENCES cxc(id) ON DELETE CASCADE,
    sesion_id   INTEGER REFERENCES caja_sesiones(id),
    monto       NUMERIC(12,2) NOT NULL,
    forma_pago  VARCHAR(20) DEFAULT 'EFECTIVO'
                CHECK (forma_pago IN ('EFECTIVO','TARJETA','TRANSFERENCIA')),
    nota        TEXT,
    cajero_id   UUID REFERENCES auth.users(id),
    fecha       DATE DEFAULT CURRENT_DATE,
    hora        TIME DEFAULT CURRENT_TIME,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ---- ÍNDICES ----
CREATE INDEX IF NOT EXISTS idx_sesiones_fecha      ON caja_sesiones(fecha);
CREATE INDEX IF NOT EXISTS idx_sesiones_cajero     ON caja_sesiones(cajero_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_sesion  ON caja_movimientos(sesion_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_fecha   ON caja_movimientos(fecha);
CREATE INDEX IF NOT EXISTS idx_cxc_estado          ON cxc(estado);

-- ---- TRIGGER updated_at para CXC ----
-- La función update_updated_at() debe existir (se crea en 001_initial.sql)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at'
  ) THEN
    CREATE OR REPLACE TRIGGER trg_cxc_upd
        BEFORE UPDATE ON cxc
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- ---- RLS ----
ALTER TABLE caja_conceptos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE caja_sesiones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE caja_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE cxc              ENABLE ROW LEVEL SECURITY;
ALTER TABLE cxc_abonos       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_conceptos_sel"   ON caja_conceptos;
DROP POLICY IF EXISTS "auth_sesiones_all"    ON caja_sesiones;
DROP POLICY IF EXISTS "auth_movimientos_all" ON caja_movimientos;
DROP POLICY IF EXISTS "auth_cxc_all"         ON cxc;
DROP POLICY IF EXISTS "auth_cxc_abonos_all"  ON cxc_abonos;

CREATE POLICY "auth_conceptos_sel"    ON caja_conceptos   FOR SELECT     TO authenticated USING (true);
CREATE POLICY "auth_sesiones_all"     ON caja_sesiones    FOR ALL        TO authenticated USING (true);
CREATE POLICY "auth_movimientos_all"  ON caja_movimientos FOR ALL        TO authenticated USING (true);
CREATE POLICY "auth_cxc_all"          ON cxc              FOR ALL        TO authenticated USING (true);
CREATE POLICY "auth_cxc_abonos_all"   ON cxc_abonos       FOR ALL        TO authenticated USING (true);
