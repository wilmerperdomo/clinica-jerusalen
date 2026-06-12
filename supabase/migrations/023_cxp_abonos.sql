-- ═══════════════════════════════════════════════════════════════
-- 023_cxp_abonos.sql
-- Historial de pagos a proveedores (Cuentas por Pagar)
-- ═══════════════════════════════════════════════════════════════

-- Campos adicionales en compra_cxp (si la tabla existe)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'compra_cxp') THEN
    ALTER TABLE compra_cxp
      ADD COLUMN IF NOT EXISTS sucursal_id       INTEGER,
      ADD COLUMN IF NOT EXISTS numero_compra     VARCHAR(30),
      ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE,
      ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Tabla de abonos/pagos a proveedores
CREATE TABLE IF NOT EXISTS compra_cxp_abonos (
  id               SERIAL PRIMARY KEY,
  cxp_id           INTEGER       NOT NULL,
  compra_id        INTEGER,
  proveedor_id     INTEGER,
  proveedor_nombre VARCHAR(200)  NOT NULL,
  monto            NUMERIC(12,2) NOT NULL,
  forma_pago       VARCHAR(20)   NOT NULL DEFAULT 'EFECTIVO'
                     CHECK (forma_pago IN ('EFECTIVO','TRANSFERENCIA','CHEQUE','TARJETA')),
  nota             TEXT,
  cajero_id        UUID,
  cajero_nombre    VARCHAR(120),
  sucursal_id      INTEGER,
  sesion_id        INTEGER,
  fecha            DATE          NOT NULL DEFAULT CURRENT_DATE,
  hora             TIME          NOT NULL DEFAULT CURRENT_TIME,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cxp_abonos_cxp    ON compra_cxp_abonos(cxp_id);
CREATE INDEX IF NOT EXISTS idx_cxp_abonos_fecha  ON compra_cxp_abonos(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_cxp_abonos_prov   ON compra_cxp_abonos(proveedor_id);

ALTER TABLE compra_cxp_abonos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_cxp_abonos_all" ON compra_cxp_abonos;
CREATE POLICY "auth_cxp_abonos_all" ON compra_cxp_abonos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
