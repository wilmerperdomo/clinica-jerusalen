-- ════════════════════════════════════════════════════════════════
--  MÓDULO COMPRAS — Órdenes de compra a proveedores
-- ════════════════════════════════════════════════════════════════

-- ── 1. Tabla principal de compras ────────────────────────────────
CREATE TABLE IF NOT EXISTS compras (
  id                      SERIAL PRIMARY KEY,
  numero                  VARCHAR(20)   NOT NULL,
  proveedor_id            INTEGER,
  proveedor_nombre        VARCHAR(200)  NOT NULL,
  sucursal_id             INTEGER       NOT NULL,
  fecha                   DATE          NOT NULL DEFAULT CURRENT_DATE,
  hora                    TIME          NOT NULL DEFAULT CURRENT_TIME,
  numero_factura_proveedor VARCHAR(50),
  nota                    TEXT,
  contado                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  credito                 NUMERIC(12,2) NOT NULL DEFAULT 0,
  total                   NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado                  VARCHAR(20)   NOT NULL DEFAULT 'completada'
                            CHECK (estado IN ('borrador','completada','anulada')),
  tipo_costo              VARCHAR(20)   NOT NULL DEFAULT 'proveedor'
                            CHECK (tipo_costo IN ('proveedor','defecto')),
  cajero_nombre           VARCHAR(120),
  usuario_id              UUID,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compras_fecha      ON compras(fecha);
CREATE INDEX IF NOT EXISTS idx_compras_proveedor  ON compras(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_compras_sucursal   ON compras(sucursal_id);

-- ── 2. Detalle de ítems por compra ───────────────────────────────
CREATE TABLE IF NOT EXISTS compra_detalles (
  id                  SERIAL PRIMARY KEY,
  compra_id           INTEGER       NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id         INTEGER       NOT NULL,
  codigo_producto     VARCHAR(50),
  nombre_producto     VARCHAR(200)  NOT NULL,
  lote                VARCHAR(80),
  fecha_vencimiento   DATE,
  precio_costo        NUMERIC(12,2) NOT NULL DEFAULT 0,
  cantidad            NUMERIC(10,2) NOT NULL DEFAULT 1,
  importe             NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- snapshot de stock al momento de la compra
  stock_antes         NUMERIC(10,2),
  stock_despues       NUMERIC(10,2)
);

CREATE INDEX IF NOT EXISTS idx_compra_det_compra   ON compra_detalles(compra_id);
CREATE INDEX IF NOT EXISTS idx_compra_det_producto ON compra_detalles(producto_id);

-- ── 3. CXP Proveedor (cuentas por pagar) ─────────────────────────
CREATE TABLE IF NOT EXISTS compra_cxp (
  id              SERIAL PRIMARY KEY,
  compra_id       INTEGER       NOT NULL REFERENCES compras(id),
  proveedor_id    INTEGER,
  proveedor_nombre VARCHAR(200) NOT NULL,
  fecha           DATE          NOT NULL DEFAULT CURRENT_DATE,
  monto_total     NUMERIC(12,2) NOT NULL,
  monto_pagado    NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo           NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado          VARCHAR(20)   NOT NULL DEFAULT 'PENDIENTE'
                    CHECK (estado IN ('PENDIENTE','PARCIAL','PAGADO')),
  notas           TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compra_cxp_estado ON compra_cxp(estado);

-- ── 4. Secuencia para número de compra ───────────────────────────
CREATE SEQUENCE IF NOT EXISTS compra_num_seq START 1;

CREATE OR REPLACE FUNCTION fn_numero_compra()
RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  RETURN 'OC-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('compra_num_seq')::text, 5, '0');
END;
$$;

-- ── 5. RLS ───────────────────────────────────────────────────────
ALTER TABLE compras          ENABLE ROW LEVEL SECURITY;
ALTER TABLE compra_detalles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE compra_cxp       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_compras"         ON compras;
DROP POLICY IF EXISTS "auth_compra_detalles" ON compra_detalles;
DROP POLICY IF EXISTS "auth_compra_cxp"      ON compra_cxp;

CREATE POLICY "auth_compras"         ON compras         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_compra_detalles" ON compra_detalles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_compra_cxp"      ON compra_cxp      FOR ALL TO authenticated USING (true) WITH CHECK (true);
