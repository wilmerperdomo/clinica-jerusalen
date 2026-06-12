-- ============================================================
--  MÓDULO INVENTARIO v1.0
--  Mejoras vs sistema viejo:
--  - Stock mínimo configurable por producto (no hardcoded 0/1)
--  - Kardex unificado (un solo registro de movimientos)
--  - Cantidades como INTEGER (no varchar)
--  - PEPS/FIFO correcto al vender
--  Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- ---- CATEGORÍAS DE PRODUCTOS ----
CREATE TABLE IF NOT EXISTS producto_categorias (
    id      SERIAL PRIMARY KEY,
    nombre  VARCHAR(80) NOT NULL,
    tabla   VARCHAR(20) NOT NULL DEFAULT 'categoria',  -- 'categoria' | 'unidad'
    activo  BOOLEAN DEFAULT TRUE
);

INSERT INTO producto_categorias (nombre, tabla) VALUES
  ('Medicamentos',    'categoria'),
  ('Insumos Médicos', 'categoria'),
  ('Reactivos Lab',   'categoria'),
  ('Productos OTC',   'categoria'),
  ('Otros',           'categoria'),
  ('Unidad',          'unidad'),
  ('Caja',            'unidad'),
  ('Frasco',          'unidad'),
  ('Ampolla',         'unidad'),
  ('Tableta',         'unidad'),
  ('Sobre',           'unidad'),
  ('Rollo',           'unidad'),
  ('Par',             'unidad')
ON CONFLICT DO NOTHING;

-- ---- PRODUCTOS (catálogo) ----
CREATE TABLE IF NOT EXISTS productos (
    id                SERIAL PRIMARY KEY,
    codigo            VARCHAR(50) UNIQUE NOT NULL,
    nombre            VARCHAR(200) NOT NULL,
    nombre_generico   VARCHAR(200),
    laboratorio       VARCHAR(100),
    categoria         VARCHAR(80)  DEFAULT 'Medicamentos',
    unidad            VARCHAR(30)  DEFAULT 'Unidad',
    tipo              VARCHAR(20)  DEFAULT 'Medicamento'
                      CHECK (tipo IN ('Medicamento','Producto','Insumo')),
    es_antibiotico    BOOLEAN      DEFAULT FALSE,
    costo             NUMERIC(12,2) DEFAULT 0,
    precio_venta      NUMERIC(12,2) DEFAULT 0,
    stock_minimo      INTEGER      DEFAULT 5,   -- umbral de alerta
    activo            BOOLEAN      DEFAULT TRUE,
    created_at        TIMESTAMPTZ  DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  DEFAULT NOW()
);

-- ---- INVENTARIO (stock por producto + sucursal + lote + vencimiento) ----
CREATE TABLE IF NOT EXISTS inventario (
    id                  SERIAL PRIMARY KEY,
    producto_id         INTEGER NOT NULL REFERENCES productos(id),
    sucursal_id         INTEGER NOT NULL REFERENCES sucursales(id),
    lote                VARCHAR(50)  DEFAULT '',
    fecha_vencimiento   DATE,
    cantidad            INTEGER      NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ  DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (producto_id, sucursal_id, lote, fecha_vencimiento)
);

-- ---- KARDEX — movimientos unificados ----
CREATE TABLE IF NOT EXISTS inventario_movimientos (
    id                SERIAL PRIMARY KEY,
    producto_id       INTEGER NOT NULL REFERENCES productos(id),
    sucursal_id       INTEGER NOT NULL REFERENCES sucursales(id),
    tipo              VARCHAR(20) NOT NULL
                      CHECK (tipo IN ('ENTRADA','SALIDA','AJUSTE','TRANSFERENCIA','VENTA','CONSUMO')),
    cantidad          INTEGER NOT NULL,           -- positivo = entrada, negativo = salida
    cantidad_antes    INTEGER,
    cantidad_despues  INTEGER,
    lote              VARCHAR(50),
    fecha_vencimiento DATE,
    motivo            VARCHAR(200),               -- descripción del movimiento
    referencia_tipo   VARCHAR(30),                -- 'compra','venta','ajuste',etc.
    referencia_id     INTEGER,                    -- ID de la factura/compra/etc.
    sucursal_destino  INTEGER,                    -- solo para TRANSFERENCIA
    usuario_id        UUID REFERENCES auth.users(id),
    fecha             DATE         DEFAULT CURRENT_DATE,
    hora              TIME         DEFAULT CURRENT_TIME,
    nota              TEXT,
    created_at        TIMESTAMPTZ  DEFAULT NOW()
);

-- ---- PROVEEDORES ----
CREATE TABLE IF NOT EXISTS proveedores (
    id          SERIAL PRIMARY KEY,
    codigo      VARCHAR(30),
    nombre      VARCHAR(150) NOT NULL,
    direccion   TEXT,
    telefono1   VARCHAR(30),
    telefono2   VARCHAR(30),
    correo      VARCHAR(100),
    vendedor    VARCHAR(100),
    rtn         VARCHAR(30),
    nota        TEXT,
    activo      BOOLEAN     DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ---- ÍNDICES ----
CREATE INDEX IF NOT EXISTS idx_inv_producto    ON inventario(producto_id);
CREATE INDEX IF NOT EXISTS idx_inv_sucursal    ON inventario(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_inv_venc        ON inventario(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_kardex_prod     ON inventario_movimientos(producto_id);
CREATE INDEX IF NOT EXISTS idx_kardex_suc      ON inventario_movimientos(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_kardex_fecha    ON inventario_movimientos(fecha);

-- ---- TRIGGERS updated_at ----
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    CREATE OR REPLACE TRIGGER trg_productos_upd
      BEFORE UPDATE ON productos
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    CREATE OR REPLACE TRIGGER trg_inventario_upd
      BEFORE UPDATE ON inventario
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

    CREATE OR REPLACE TRIGGER trg_proveedores_upd
      BEFORE UPDATE ON proveedores
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- ---- RLS ----
ALTER TABLE producto_categorias   ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario             ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario_movimientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores            ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_prod_cat_sel"   ON producto_categorias;
DROP POLICY IF EXISTS "auth_productos_all"  ON productos;
DROP POLICY IF EXISTS "auth_inventario_all" ON inventario;
DROP POLICY IF EXISTS "auth_kardex_all"     ON inventario_movimientos;
DROP POLICY IF EXISTS "auth_prov_all"       ON proveedores;

CREATE POLICY "auth_prod_cat_sel"   ON producto_categorias   FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_productos_all"  ON productos              FOR ALL    TO authenticated USING (true);
CREATE POLICY "auth_inventario_all" ON inventario             FOR ALL    TO authenticated USING (true);
CREATE POLICY "auth_kardex_all"     ON inventario_movimientos FOR ALL    TO authenticated USING (true);
CREATE POLICY "auth_prov_all"       ON proveedores            FOR ALL    TO authenticated USING (true);
