-- ═══════════════════════════════════════════════════════════════
--  095 — Presupuestos, cuentas de efectivo, pagos programados
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE finanzas_movimientos
  ADD COLUMN IF NOT EXISTS es_deducible BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE finanzas_movimientos
  ADD COLUMN IF NOT EXISTS es_gasto_fijo BOOLEAN NOT NULL DEFAULT FALSE;

-- Presupuestos mensuales por área/categoría
CREATE TABLE IF NOT EXISTS finanzas_presupuestos (
  id            SERIAL PRIMARY KEY,
  anio          INTEGER NOT NULL,
  mes           INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  clave         VARCHAR(40) NOT NULL,
  etiqueta      VARCHAR(120) NOT NULL,
  ambito        VARCHAR(20) CHECK (ambito IS NULL OR ambito IN ('CLINICA', 'CASA', 'PERSONAL')),
  categoria_clave VARCHAR(40),
  monto_limite  NUMERIC(12,2) NOT NULL CHECK (monto_limite >= 0),
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (anio, mes, clave)
);

CREATE INDEX IF NOT EXISTS idx_fin_pres_anio_mes ON finanzas_presupuestos(anio, mes);

-- Cuentas de efectivo / banco
CREATE TABLE IF NOT EXISTS finanzas_cuentas (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(120) NOT NULL,
  tipo          VARCHAR(20) NOT NULL DEFAULT 'EFECTIVO'
    CHECK (tipo IN ('EFECTIVO', 'BANCO', 'CAJA_CLINICA')),
  ambito        VARCHAR(20) NOT NULL DEFAULT 'PERSONAL'
    CHECK (ambito IN ('CLINICA', 'CASA', 'PERSONAL')),
  banco         VARCHAR(120),
  saldo_actual  NUMERIC(12,2) NOT NULL DEFAULT 0,
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  notas         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finanzas_cuenta_movimientos (
  id              SERIAL PRIMARY KEY,
  cuenta_id       INTEGER NOT NULL REFERENCES finanzas_cuentas(id) ON DELETE CASCADE,
  tipo            VARCHAR(20) NOT NULL CHECK (tipo IN ('INGRESO', 'EGRESO', 'AJUSTE', 'TRANSFERENCIA')),
  monto           NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  descripcion     VARCHAR(300) NOT NULL,
  cuenta_destino_id INTEGER REFERENCES finanzas_cuentas(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_cuenta_mov ON finanzas_cuenta_movimientos(cuenta_id, fecha DESC);

-- Pagos programados / calendario
CREATE TABLE IF NOT EXISTS finanzas_pagos_programados (
  id              SERIAL PRIMARY KEY,
  titulo          VARCHAR(200) NOT NULL,
  monto           NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  dia_mes         INTEGER CHECK (dia_mes IS NULL OR (dia_mes BETWEEN 1 AND 31)),
  fecha_especifica DATE,
  recurrente      BOOLEAN NOT NULL DEFAULT TRUE,
  tipo            VARCHAR(30) NOT NULL DEFAULT 'OTRO'
    CHECK (tipo IN ('TARJETA', 'PRESTAMO', 'PLANILLA', 'CASA', 'CXP', 'SERVICIO', 'IMPUESTO', 'OTRO')),
  ambito          VARCHAR(20) NOT NULL DEFAULT 'PERSONAL'
    CHECK (ambito IN ('CLINICA', 'CASA', 'PERSONAL')),
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE finanzas_presupuestos ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas_cuentas ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas_cuenta_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas_pagos_programados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fin_pres_all" ON finanzas_presupuestos;
CREATE POLICY "fin_pres_all" ON finanzas_presupuestos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fin_cuentas_all" ON finanzas_cuentas;
CREATE POLICY "fin_cuentas_all" ON finanzas_cuentas FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fin_cuenta_mov_all" ON finanzas_cuenta_movimientos;
CREATE POLICY "fin_cuenta_mov_all" ON finanzas_cuenta_movimientos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fin_pagos_prog_all" ON finanzas_pagos_programados;
CREATE POLICY "fin_pagos_prog_all" ON finanzas_pagos_programados FOR ALL TO authenticated USING (true) WITH CHECK (true);
