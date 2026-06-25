-- ═══════════════════════════════════════════════════════════════
-- 074_lab_rentabilidad.sql
-- Control de costos, maquila y utilidad por orden de laboratorio
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE laboratorio_info
  ADD COLUMN IF NOT EXISTS procesamiento VARCHAR(20) DEFAULT 'INTERNA';

ALTER TABLE laboratorio_info DROP CONSTRAINT IF EXISTS laboratorio_info_procesamiento_check;
ALTER TABLE laboratorio_info
  ADD CONSTRAINT laboratorio_info_procesamiento_check
  CHECK (procesamiento IN ('INTERNA', 'MAQUILADA', 'MIXTA'));

ALTER TABLE laboratorio_info
  ADD COLUMN IF NOT EXISTS proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL;

ALTER TABLE laboratorio_info
  ADD COLUMN IF NOT EXISTS costo_maquila NUMERIC(12,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_lab_info_procesamiento ON laboratorio_info(procesamiento);
CREATE INDEX IF NOT EXISTS idx_lab_info_proveedor ON laboratorio_info(proveedor_id);

-- Costo histórico por orden (snapshot al procesar/validar)
CREATE TABLE IF NOT EXISTS lab_costos_orden (
  id              SERIAL PRIMARY KEY,
  orden_id        INTEGER NOT NULL REFERENCES consulta_analisis(id) ON DELETE CASCADE,
  prueba_id       INTEGER NOT NULL REFERENCES laboratorio_info(id),
  ingreso         NUMERIC(12,2) NOT NULL DEFAULT 0,
  costo_insumos   NUMERIC(12,2) NOT NULL DEFAULT 0,
  costo_maquila   NUMERIC(12,2) NOT NULL DEFAULT 0,
  comision        NUMERIC(12,2) NOT NULL DEFAULT 0,
  utilidad        NUMERIC(12,2) NOT NULL DEFAULT 0,
  margen_pct      NUMERIC(8,2),
  procesamiento   VARCHAR(20),
  proveedor_id    INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (orden_id)
);

CREATE INDEX IF NOT EXISTS idx_lab_costos_orden_prueba ON lab_costos_orden(prueba_id);
CREATE INDEX IF NOT EXISTS idx_lab_costos_orden_fecha ON lab_costos_orden(created_at);

-- Detalle de consumos de reactivos por orden
CREATE TABLE IF NOT EXISTS lab_consumos_orden (
  id              SERIAL PRIMARY KEY,
  orden_id        INTEGER NOT NULL REFERENCES consulta_analisis(id) ON DELETE CASCADE,
  prueba_id       INTEGER NOT NULL REFERENCES laboratorio_info(id),
  producto_id     INTEGER NOT NULL REFERENCES productos(id),
  cantidad        NUMERIC(12,4) NOT NULL DEFAULT 1,
  costo_unitario  NUMERIC(12,4) NOT NULL DEFAULT 0,
  costo_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  inventario_id   INTEGER REFERENCES inventario(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_consumos_orden ON lab_consumos_orden(orden_id);
CREATE INDEX IF NOT EXISTS idx_lab_consumos_producto ON lab_consumos_orden(producto_id);

ALTER TABLE lab_costos_orden ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_consumos_orden ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lab_costos_orden' AND policyname = 'auth_lab_costos_orden_all') THEN
    CREATE POLICY auth_lab_costos_orden_all ON lab_costos_orden FOR ALL TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lab_consumos_orden' AND policyname = 'auth_lab_consumos_orden_all') THEN
    CREATE POLICY auth_lab_consumos_orden_all ON lab_consumos_orden FOR ALL TO authenticated USING (true);
  END IF;
END $$;

-- Proveedor Masterlab por defecto (si no existe)
INSERT INTO proveedores (nombre, nota, activo)
SELECT 'Masterlab', 'Laboratorio de referencia / maquila externa', TRUE
WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE nombre ILIKE '%masterlab%');
