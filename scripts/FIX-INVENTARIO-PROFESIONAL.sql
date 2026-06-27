-- ═══════════════════════════════════════════════════════════════
--  096 — Inventario profesional: productos avanzados, conteos,
--        transferencias con estado, alertas, auditoría y reposición
-- ═══════════════════════════════════════════════════════════════

-- Campos profesionales de producto
ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo_barra VARCHAR(80);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS principio_activo VARCHAR(200);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS concentracion VARCHAR(80);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS presentacion VARCHAR(120);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS marca VARCHAR(120);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS requiere_receta BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS es_controlado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS gravado BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS isv_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 15;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS facturable BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS precio_minimo NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS proveedor_preferido_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS factor_conversion NUMERIC(12,4) NOT NULL DEFAULT 1;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS unidad_compra VARCHAR(30);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS unidad_venta VARCHAR(30);
ALTER TABLE productos ADD COLUMN IF NOT EXISTS dias_reposicion INTEGER NOT NULL DEFAULT 7;
ALTER TABLE productos ADD COLUMN IF NOT EXISTS imagen_url TEXT;

CREATE INDEX IF NOT EXISTS idx_productos_barra ON productos(codigo_barra);
CREATE INDEX IF NOT EXISTS idx_productos_prov_pref ON productos(proveedor_preferido_id);

-- Enriquecer inventario/lotes
ALTER TABLE inventario ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE inventario ADD COLUMN IF NOT EXISTS proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL;
ALTER TABLE inventario ADD COLUMN IF NOT EXISTS bloqueado BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE inventario ADD COLUMN IF NOT EXISTS motivo_bloqueo VARCHAR(200);

-- Auditoría de productos y movimientos sensibles
CREATE TABLE IF NOT EXISTS inventario_auditoria (
  id            SERIAL PRIMARY KEY,
  entidad       VARCHAR(40) NOT NULL,
  entidad_id    INTEGER,
  accion        VARCHAR(40) NOT NULL,
  antes         JSONB,
  despues       JSONB,
  motivo        TEXT,
  usuario_id    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_audit_entidad ON inventario_auditoria(entidad, entidad_id);

-- Conteos físicos
CREATE TABLE IF NOT EXISTS inventario_conteos (
  id              SERIAL PRIMARY KEY,
  sucursal_id     INTEGER NOT NULL REFERENCES sucursales(id),
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  estado          VARCHAR(20) NOT NULL DEFAULT 'BORRADOR'
    CHECK (estado IN ('BORRADOR','CERRADO','ANULADO')),
  responsable     VARCHAR(120),
  notas           TEXT,
  usuario_id      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cerrado_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS inventario_conteo_detalles (
  id                SERIAL PRIMARY KEY,
  conteo_id         INTEGER NOT NULL REFERENCES inventario_conteos(id) ON DELETE CASCADE,
  producto_id       INTEGER NOT NULL REFERENCES productos(id),
  inventario_id     INTEGER REFERENCES inventario(id) ON DELETE SET NULL,
  lote              VARCHAR(80),
  fecha_vencimiento DATE,
  cantidad_sistema  NUMERIC(12,2) NOT NULL DEFAULT 0,
  cantidad_contada  NUMERIC(12,2) NOT NULL DEFAULT 0,
  diferencia        NUMERIC(12,2) GENERATED ALWAYS AS (cantidad_contada - cantidad_sistema) STORED,
  motivo            VARCHAR(200)
);

CREATE INDEX IF NOT EXISTS idx_inv_conteo_suc ON inventario_conteos(sucursal_id, fecha);
CREATE INDEX IF NOT EXISTS idx_inv_conteo_det ON inventario_conteo_detalles(conteo_id);

-- Transferencias profesionales con confirmación
CREATE TABLE IF NOT EXISTS inventario_transferencias (
  id                SERIAL PRIMARY KEY,
  numero            VARCHAR(30) NOT NULL UNIQUE,
  producto_id       INTEGER NOT NULL REFERENCES productos(id),
  sucursal_origen   INTEGER NOT NULL REFERENCES sucursales(id),
  sucursal_destino  INTEGER NOT NULL REFERENCES sucursales(id),
  cantidad          NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  lote              VARCHAR(80),
  fecha_vencimiento DATE,
  estado            VARCHAR(20) NOT NULL DEFAULT 'ENVIADA'
    CHECK (estado IN ('ENVIADA','RECIBIDA','ANULADA')),
  nota              TEXT,
  enviado_por       UUID REFERENCES auth.users(id),
  recibido_por      UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recibido_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_inv_transf_estado ON inventario_transferencias(estado);
CREATE INDEX IF NOT EXISTS idx_inv_transf_origen ON inventario_transferencias(sucursal_origen);
CREATE INDEX IF NOT EXISTS idx_inv_transf_dest ON inventario_transferencias(sucursal_destino);

CREATE SEQUENCE IF NOT EXISTS inventario_transferencia_num_seq START 1;

-- Órdenes de compra sugeridas desde reposición
CREATE TABLE IF NOT EXISTS inventario_reposicion_sugerencias (
  id                SERIAL PRIMARY KEY,
  producto_id       INTEGER NOT NULL REFERENCES productos(id),
  sucursal_id       INTEGER REFERENCES sucursales(id),
  proveedor_id      INTEGER REFERENCES proveedores(id),
  stock_actual      NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_minimo      NUMERIC(12,2) NOT NULL DEFAULT 0,
  venta_promedio_30 NUMERIC(12,2) NOT NULL DEFAULT 0,
  cantidad_sugerida NUMERIC(12,2) NOT NULL DEFAULT 0,
  motivo            VARCHAR(200),
  estado            VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE'
    CHECK (estado IN ('PENDIENTE','ORDENADA','DESCARTADA')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Productos compuestos / kits
CREATE TABLE IF NOT EXISTS producto_kits (
  id               SERIAL PRIMARY KEY,
  producto_padre_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  producto_hijo_id  INTEGER NOT NULL REFERENCES productos(id),
  cantidad          NUMERIC(12,2) NOT NULL CHECK (cantidad > 0),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(producto_padre_id, producto_hijo_id)
);

-- Historial de precios
CREATE TABLE IF NOT EXISTS producto_precio_historial (
  id              SERIAL PRIMARY KEY,
  producto_id     INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  precio_anterior NUMERIC(12,2),
  precio_nuevo    NUMERIC(12,2) NOT NULL,
  costo_anterior  NUMERIC(12,2),
  costo_nuevo     NUMERIC(12,2),
  motivo          VARCHAR(200),
  usuario_id      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE inventario_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_conteos ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_conteo_detalles ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_transferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_reposicion_sugerencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE producto_precio_historial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inv_audit_all" ON inventario_auditoria;
CREATE POLICY "inv_audit_all" ON inventario_auditoria FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "inv_conteos_all" ON inventario_conteos;
CREATE POLICY "inv_conteos_all" ON inventario_conteos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "inv_conteo_det_all" ON inventario_conteo_detalles;
CREATE POLICY "inv_conteo_det_all" ON inventario_conteo_detalles FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "inv_transf_all" ON inventario_transferencias;
CREATE POLICY "inv_transf_all" ON inventario_transferencias FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "inv_repo_all" ON inventario_reposicion_sugerencias;
CREATE POLICY "inv_repo_all" ON inventario_reposicion_sugerencias FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "prod_kits_all" ON producto_kits;
CREATE POLICY "prod_kits_all" ON producto_kits FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "prod_prec_hist_all" ON producto_precio_historial;
CREATE POLICY "prod_prec_hist_all" ON producto_precio_historial FOR ALL TO authenticated USING (true) WITH CHECK (true);
