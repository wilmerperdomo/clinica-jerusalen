-- ═══════════════════════════════════════════════════════════════
--  093 — Finanzas personales / control total del negocio
--  Movimientos manuales, categorías, préstamos (sin afectar caja)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS finanzas_categorias (
  id          SERIAL PRIMARY KEY,
  tipo        VARCHAR(10) NOT NULL CHECK (tipo IN ('INGRESO', 'EGRESO')),
  clave       VARCHAR(40) NOT NULL UNIQUE,
  nombre      VARCHAR(120) NOT NULL,
  icono       VARCHAR(40) DEFAULT 'circle',
  orden       INTEGER NOT NULL DEFAULT 0,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  es_sistema  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO finanzas_categorias (tipo, clave, nombre, icono, orden, es_sistema) VALUES
  ('INGRESO', 'AMBULANCIA',       'Servicios de ambulancia',     'ambulance',    1, TRUE),
  ('INGRESO', 'ATAUDES',          'Venta de ataúdes',            'box',          2, TRUE),
  ('INGRESO', 'SERVICIOS_EXT',    'Servicios externos',          'briefcase',    3, TRUE),
  ('INGRESO', 'ALQUILERES',       'Alquileres / arrendamientos', 'building',     4, TRUE),
  ('INGRESO', 'OTROS_INGRESO',    'Otros ingresos',              'trending-up',  5, TRUE),
  ('EGRESO',  'MEDICAMENTOS_SF',  'Medicamentos sin factura',    'pill',         1, TRUE),
  ('EGRESO',  'COMBUSTIBLE',      'Combustible / transporte',    'fuel',         2, TRUE),
  ('EGRESO',  'PRESTAMOS',        'Pago de préstamos',           'landmark',     3, TRUE),
  ('EGRESO',  'PERSONAL',         'Gastos personales',           'user',         4, TRUE),
  ('EGRESO',  'MANTENIMIENTO',    'Mantenimiento',               'wrench',       5, TRUE),
  ('EGRESO',  'SUMINISTROS',      'Suministros varios',          'package',      6, TRUE),
  ('EGRESO',  'SERVICIOS_BASIC',  'Luz, agua, internet, etc.',   'zap',          7, TRUE),
  ('EGRESO',  'OTROS_EGRESO',     'Otros gastos',                'trending-down',8, TRUE)
ON CONFLICT (clave) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  orden = EXCLUDED.orden;

CREATE TABLE IF NOT EXISTS finanzas_movimientos (
  id            SERIAL PRIMARY KEY,
  tipo          VARCHAR(10) NOT NULL CHECK (tipo IN ('INGRESO', 'EGRESO')),
  categoria_id  INTEGER REFERENCES finanzas_categorias(id) ON DELETE SET NULL,
  monto         NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  descripcion   VARCHAR(300) NOT NULL,
  referencia    VARCHAR(120),
  sucursal_id   INTEGER REFERENCES sucursales(id) ON DELETE SET NULL,
  con_factura   BOOLEAN NOT NULL DEFAULT FALSE,
  notas         TEXT,
  usuario_id    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_mov_fecha ON finanzas_movimientos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_fin_mov_tipo  ON finanzas_movimientos(tipo);
CREATE INDEX IF NOT EXISTS idx_fin_mov_cat  ON finanzas_movimientos(categoria_id);

CREATE TABLE IF NOT EXISTS finanzas_prestamos (
  id               SERIAL PRIMARY KEY,
  nombre           VARCHAR(200) NOT NULL,
  acreedor         VARCHAR(200),
  monto_original   NUMERIC(12,2) NOT NULL,
  saldo_pendiente  NUMERIC(12,2) NOT NULL,
  cuota_mensual    NUMERIC(12,2),
  tasa_interes     NUMERIC(5,2),
  fecha_inicio     DATE,
  fecha_fin        DATE,
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  notas            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finanzas_prestamo_pagos (
  id            SERIAL PRIMARY KEY,
  prestamo_id   INTEGER NOT NULL REFERENCES finanzas_prestamos(id) ON DELETE CASCADE,
  monto         NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  notas         TEXT,
  movimiento_id INTEGER REFERENCES finanzas_movimientos(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_prest_pagos ON finanzas_prestamo_pagos(prestamo_id);

ALTER TABLE finanzas_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas_prestamos ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas_prestamo_pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fin_cat_all" ON finanzas_categorias;
CREATE POLICY "fin_cat_all" ON finanzas_categorias FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fin_mov_all" ON finanzas_movimientos;
CREATE POLICY "fin_mov_all" ON finanzas_movimientos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fin_prest_all" ON finanzas_prestamos;
CREATE POLICY "fin_prest_all" ON finanzas_prestamos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fin_prest_pagos_all" ON finanzas_prestamo_pagos;
CREATE POLICY "fin_prest_pagos_all" ON finanzas_prestamo_pagos FOR ALL TO authenticated USING (true) WITH CHECK (true);
