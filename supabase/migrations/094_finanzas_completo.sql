-- ═══════════════════════════════════════════════════════════════
--  094 — Control financiero completo: ámbito, tarjetas, deudas
-- ═══════════════════════════════════════════════════════════════

-- Ámbito y forma de pago en movimientos
ALTER TABLE finanzas_movimientos
  ADD COLUMN IF NOT EXISTS ambito VARCHAR(20) NOT NULL DEFAULT 'PERSONAL'
    CHECK (ambito IN ('CLINICA', 'CASA', 'PERSONAL'));

ALTER TABLE finanzas_movimientos
  ADD COLUMN IF NOT EXISTS forma_pago VARCHAR(20) NOT NULL DEFAULT 'EFECTIVO'
    CHECK (forma_pago IN ('EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE', 'OTRO'));

ALTER TABLE finanzas_movimientos
  ADD COLUMN IF NOT EXISTS tarjeta_id INTEGER;

-- Categorías adicionales (casa, clínica manual, tarjeta)
INSERT INTO finanzas_categorias (tipo, clave, nombre, icono, orden, es_sistema) VALUES
  ('EGRESO', 'CASA_ARRIENDO',     'Arriendo / hipoteca casa',    'home',         9, TRUE),
  ('EGRESO', 'CASA_ALIMENTOS',    'Supermercado / alimentos',    'shopping-cart',10, TRUE),
  ('EGRESO', 'CASA_EDUCACION',    'Colegiatura / educación',      'graduation-cap',11, TRUE),
  ('EGRESO', 'CASA_SALUD',        'Salud familiar',              'heart',        12, TRUE),
  ('EGRESO', 'TARJETA_CREDITO',   'Pago tarjeta de crédito',     'credit-card',  9, TRUE),
  ('EGRESO', 'CLINICA_EXTRA',     'Gasto clínica sin factura',   'building',     9, TRUE),
  ('INGRESO', 'RENTAS',           'Rentas / inmuebles',          'key',          6, TRUE)
ON CONFLICT (clave) DO UPDATE SET nombre = EXCLUDED.nombre, orden = EXCLUDED.orden;

-- Tarjetas de crédito
CREATE TABLE IF NOT EXISTS finanzas_tarjetas (
  id               SERIAL PRIMARY KEY,
  alias            VARCHAR(80) NOT NULL,
  banco            VARCHAR(120),
  ultimos_digitos  VARCHAR(4),
  limite_credito   NUMERIC(12,2),
  saldo_actual     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (saldo_actual >= 0),
  pago_minimo      NUMERIC(12,2),
  dia_corte        INTEGER CHECK (dia_corte IS NULL OR (dia_corte BETWEEN 1 AND 31)),
  dia_pago         INTEGER CHECK (dia_pago IS NULL OR (dia_pago BETWEEN 1 AND 31)),
  tasa_interes     NUMERIC(5,2),
  color            VARCHAR(20) NOT NULL DEFAULT '#6366f1',
  ambito           VARCHAR(20) NOT NULL DEFAULT 'PERSONAL'
    CHECK (ambito IN ('CLINICA', 'CASA', 'PERSONAL', 'MIXTO')),
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  notas            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FK tarjeta en movimientos (después de crear tabla)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'finanzas_movimientos_tarjeta_id_fkey'
  ) THEN
    ALTER TABLE finanzas_movimientos
      ADD CONSTRAINT finanzas_movimientos_tarjeta_id_fkey
      FOREIGN KEY (tarjeta_id) REFERENCES finanzas_tarjetas(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fin_mov_ambito ON finanzas_movimientos(ambito);
CREATE INDEX IF NOT EXISTS idx_fin_mov_tarjeta ON finanzas_movimientos(tarjeta_id);

-- Pagos a tarjeta (abono que baja saldo)
CREATE TABLE IF NOT EXISTS finanzas_tarjeta_pagos (
  id            SERIAL PRIMARY KEY,
  tarjeta_id    INTEGER NOT NULL REFERENCES finanzas_tarjetas(id) ON DELETE CASCADE,
  monto         NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  notas         TEXT,
  movimiento_id INTEGER REFERENCES finanzas_movimientos(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fin_tarj_pagos ON finanzas_tarjeta_pagos(tarjeta_id);

-- Tipo y ámbito en préstamos
ALTER TABLE finanzas_prestamos
  ADD COLUMN IF NOT EXISTS tipo VARCHAR(30) NOT NULL DEFAULT 'PRESTAMO'
    CHECK (tipo IN ('PRESTAMO', 'VEHICULO', 'HIPOTECA', 'PERSONAL', 'NEGOCIO', 'TARJETA', 'OTRO'));

ALTER TABLE finanzas_prestamos
  ADD COLUMN IF NOT EXISTS ambito VARCHAR(20) NOT NULL DEFAULT 'PERSONAL'
    CHECK (ambito IN ('CLINICA', 'CASA', 'PERSONAL'));

-- Deudas manuales adicionales (personas, proveedores informales)
CREATE TABLE IF NOT EXISTS finanzas_deudas (
  id               SERIAL PRIMARY KEY,
  nombre           VARCHAR(200) NOT NULL,
  acreedor         VARCHAR(200),
  tipo             VARCHAR(30) NOT NULL DEFAULT 'OTRO'
    CHECK (tipo IN ('PERSONA', 'PROVEEDOR', 'BANCO', 'FISCAL', 'SERVICIO', 'OTRO')),
  ambito           VARCHAR(20) NOT NULL DEFAULT 'PERSONAL'
    CHECK (ambito IN ('CLINICA', 'CASA', 'PERSONAL')),
  monto_original   NUMERIC(12,2) NOT NULL,
  saldo_pendiente  NUMERIC(12,2) NOT NULL,
  fecha_vencimiento DATE,
  activo           BOOLEAN NOT NULL DEFAULT TRUE,
  notas            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finanzas_deuda_pagos (
  id            SERIAL PRIMARY KEY,
  deuda_id      INTEGER NOT NULL REFERENCES finanzas_deudas(id) ON DELETE CASCADE,
  monto         NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
  notas         TEXT,
  movimiento_id INTEGER REFERENCES finanzas_movimientos(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE finanzas_tarjetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas_tarjeta_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas_deudas ENABLE ROW LEVEL SECURITY;
ALTER TABLE finanzas_deuda_pagos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fin_tarj_all" ON finanzas_tarjetas;
CREATE POLICY "fin_tarj_all" ON finanzas_tarjetas FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fin_tarj_pagos_all" ON finanzas_tarjeta_pagos;
CREATE POLICY "fin_tarj_pagos_all" ON finanzas_tarjeta_pagos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fin_deudas_all" ON finanzas_deudas;
CREATE POLICY "fin_deudas_all" ON finanzas_deudas FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "fin_deuda_pagos_all" ON finanzas_deuda_pagos;
CREATE POLICY "fin_deuda_pagos_all" ON finanzas_deuda_pagos FOR ALL TO authenticated USING (true) WITH CHECK (true);
