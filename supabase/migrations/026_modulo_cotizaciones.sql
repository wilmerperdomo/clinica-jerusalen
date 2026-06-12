-- ════════════════════════════════════════════════════════════════
--  MÓDULO COTIZACIONES (presupuestos — sin stock ni comisión)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cotizaciones (
  id                  SERIAL PRIMARY KEY,
  numero              VARCHAR(30)   NOT NULL,
  sucursal_id         INTEGER       NOT NULL,

  fecha               DATE          NOT NULL DEFAULT CURRENT_DATE,
  hora                TIME          NOT NULL DEFAULT CURRENT_TIME,

  cliente_nombre      VARCHAR(200)  NOT NULL DEFAULT 'CLIENTE GENERAL',
  cliente_rtn         VARCHAR(20),
  cliente_email       VARCHAR(150),
  paciente_id         INTEGER,
  consulta_id         INTEGER,

  -- [{descripcion, cantidad, precio_unitario, isv_pct, subtotal, producto_id?}]
  items               JSONB         NOT NULL DEFAULT '[]',

  subtotal            NUMERIC(12,2) NOT NULL DEFAULT 0,
  por_descuento       NUMERIC(5,2)  NOT NULL DEFAULT 0,
  descuento_monto     NUMERIC(12,2) NOT NULL DEFAULT 0,
  isv_monto           NUMERIC(12,2) NOT NULL DEFAULT 0,
  total               NUMERIC(12,2) NOT NULL DEFAULT 0,
  exento_isv          BOOLEAN       NOT NULL DEFAULT FALSE,

  estado              VARCHAR(20)   NOT NULL DEFAULT 'PENDIENTE'
                        CHECK (estado IN ('PENDIENTE','ACEPTADA','VENCIDA','CONVERTIDA','ANULADA')),
  nota                TEXT,
  validez_dias        INTEGER       NOT NULL DEFAULT 15,
  fecha_vencimiento   DATE          NOT NULL,

  factura_id          INTEGER,
  usuario_id          UUID,
  cajero_nombre       VARCHAR(120),
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (numero, sucursal_id)
);

CREATE INDEX IF NOT EXISTS idx_cotizaciones_sucursal ON cotizaciones(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_fecha    ON cotizaciones(fecha);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado   ON cotizaciones(estado);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_vence    ON cotizaciones(fecha_vencimiento);

CREATE TABLE IF NOT EXISTS cotizacion_correlativos (
  sucursal_id     INTEGER PRIMARY KEY,
  ultimo_numero   BIGINT  NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vínculo opcional factura ← cotización
ALTER TABLE facturas ADD COLUMN IF NOT EXISTS cotizacion_id INTEGER;

-- RLS
ALTER TABLE cotizaciones            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotizacion_correlativos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_cotizaciones"            ON cotizaciones;
DROP POLICY IF EXISTS "auth_cotizacion_correlativos" ON cotizacion_correlativos;

CREATE POLICY "auth_cotizaciones"
  ON cotizaciones FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "auth_cotizacion_correlativos"
  ON cotizacion_correlativos FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Módulo y permisos
INSERT INTO modulos (clave, nombre, icono, orden) VALUES
  ('cotizaciones', 'Cotizaciones', 'ClipboardList', 11)
ON CONFLICT (clave) DO UPDATE SET nombre = EXCLUDED.nombre, orden = EXCLUDED.orden;

INSERT INTO permisos (modulo_id, accion, descripcion)
SELECT m.id, a.accion, m.nombre || ' — ' || a.accion
FROM modulos m
CROSS JOIN (VALUES ('ver'),('crear'),('editar'),('eliminar'),('imprimir'),('exportar')) AS a(accion)
WHERE m.clave = 'cotizaciones'
ON CONFLICT (modulo_id, accion) DO NOTHING;

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
JOIN modulos m ON m.id = p.modulo_id
WHERE r.nombre = 'Administrador' AND m.clave = 'cotizaciones'
ON CONFLICT DO NOTHING;

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON true
JOIN modulos m ON m.id = p.modulo_id
WHERE r.nombre = 'Enfermera'
  AND m.clave = 'cotizaciones'
  AND p.accion IN ('ver','crear','editar','imprimir')
ON CONFLICT DO NOTHING;
