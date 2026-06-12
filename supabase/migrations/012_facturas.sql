-- ════════════════════════════════════════════════════════════════
--  MÓDULO FACTURACIÓN FISCAL (Honduras — CAI / RTN / ISV)
-- ════════════════════════════════════════════════════════════════

-- ── 1. Tabla principal de facturas ───────────────────────────────
CREATE TABLE IF NOT EXISTS facturas (
  id                  SERIAL PRIMARY KEY,
  numero              VARCHAR(30)   NOT NULL,          -- correlativo 00000-0001-0001-000000001
  sucursal_id         INTEGER       NOT NULL,

  -- Fecha y hora
  fecha               DATE          NOT NULL DEFAULT CURRENT_DATE,
  hora                TIME          NOT NULL DEFAULT CURRENT_TIME,

  -- Datos del cliente
  cliente_nombre      VARCHAR(200)  NOT NULL DEFAULT 'CLIENTE GENERAL',
  cliente_rtn         VARCHAR(20),
  cliente_email       VARCHAR(150),

  -- Ítems (JSON array: [{descripcion, cantidad, precio_unitario, isv_pct, subtotal}])
  items               JSONB         NOT NULL DEFAULT '[]',

  -- Totales
  subtotal            NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento_monto     NUMERIC(12,2) NOT NULL DEFAULT 0,
  isv_monto           NUMERIC(12,2) NOT NULL DEFAULT 0,   -- ISV 15%
  total               NUMERIC(12,2) NOT NULL DEFAULT 0,
  exento_isv          BOOLEAN       NOT NULL DEFAULT FALSE,

  -- Estado
  estado              VARCHAR(20)   NOT NULL DEFAULT 'emitida'
                        CHECK (estado IN ('emitida','anulada')),
  motivo_anulacion    TEXT,
  anulada_por         UUID,
  fecha_anulacion     TIMESTAMPTZ,

  -- Vínculos
  caja_movimiento_id  INTEGER,
  paciente_id         INTEGER,
  usuario_id          UUID,
  cajero_nombre       VARCHAR(120),

  -- Snapshot fiscal al momento de emitir
  cai                 VARCHAR(100),
  rtn_emisor          VARCHAR(30),
  rango_inicio        VARCHAR(30),
  rango_fin           VARCHAR(30),
  fecha_limite_cai    DATE,

  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (numero, sucursal_id)
);

CREATE INDEX IF NOT EXISTS idx_facturas_sucursal ON facturas(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha    ON facturas(fecha);
CREATE INDEX IF NOT EXISTS idx_facturas_estado   ON facturas(estado);
CREATE INDEX IF NOT EXISTS idx_facturas_paciente ON facturas(paciente_id);

-- ── 2. Control de correlativos por sucursal ──────────────────────
--   Guarda el último número usado; si no existe, parte de numero_inicial de sucursales
CREATE TABLE IF NOT EXISTS factura_correlativos (
  sucursal_id     INTEGER PRIMARY KEY,
  ultimo_numero   BIGINT  NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. Función: obtener y reservar el siguiente correlativo ──────
CREATE OR REPLACE FUNCTION fn_siguiente_correlativo(p_sucursal_id INTEGER)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
  v_siguiente BIGINT;
  v_inicial   BIGINT;
BEGIN
  -- Obtener número inicial de la sucursal (si existe)
  SELECT COALESCE(NULLIF(TRIM(numero_inicial::text),''),'1')::BIGINT
  INTO v_inicial
  FROM sucursales WHERE id = p_sucursal_id;

  IF NOT FOUND THEN v_inicial := 1; END IF;

  -- Insertar o actualizar el correlativo
  INSERT INTO factura_correlativos (sucursal_id, ultimo_numero)
  VALUES (p_sucursal_id, v_inicial)
  ON CONFLICT (sucursal_id) DO UPDATE
    SET ultimo_numero = factura_correlativos.ultimo_numero + 1,
        updated_at    = NOW()
  RETURNING ultimo_numero INTO v_siguiente;

  -- Si es el primer registro, devolver el inicial
  IF v_siguiente = v_inicial AND NOT EXISTS (
    SELECT 1 FROM facturas WHERE sucursal_id = p_sucursal_id
  ) THEN
    RETURN v_inicial;
  END IF;

  RETURN v_siguiente;
END;
$$;

-- ── 4. Vista para reportes rápidos ──────────────────────────────
CREATE OR REPLACE VIEW v_facturas_detalle AS
SELECT
  f.*,
  s.nombre        AS sucursal_nombre,
  s.direccion     AS sucursal_direccion,
  s.telefono      AS sucursal_telefono,
  s.email         AS sucursal_email,
  p.nombre        AS paciente_nombre_rel,
  p.apellido1     AS paciente_apellido1
FROM facturas  f
LEFT JOIN sucursales s ON f.sucursal_id  = s.id
LEFT JOIN pacientes  p ON f.paciente_id  = p.id;

-- ── 5. RLS ──────────────────────────────────────────────────────
ALTER TABLE facturas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE factura_correlativos  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_facturas"             ON facturas;
DROP POLICY IF EXISTS "auth_factura_correlativos" ON factura_correlativos;

CREATE POLICY "auth_facturas"
  ON facturas FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_factura_correlativos"
  ON factura_correlativos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
