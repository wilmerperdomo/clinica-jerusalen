-- ════════════════════════════════════════════════════════════════
--  MÓDULO PLANILLA + CONTROL FINANCIERO
--  Producción médica, comisiones, sueldos fijos, períodos quincenales
-- ════════════════════════════════════════════════════════════════

-- Sueldo fijo en perfil (enfermeras, administrativos)
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS sueldo_fijo NUMERIC(12,2) DEFAULT 0;
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS tipo_nomina VARCHAR(30) DEFAULT 'NINGUNO'
  CHECK (tipo_nomina IN ('NINGUNO','MEDICO','ENFERMERA','ADMINISTRATIVO'));

-- Reglas de comisión (configurables)
CREATE TABLE IF NOT EXISTS planilla_comisiones (
  id          SERIAL PRIMARY KEY,
  clave       VARCHAR(40)  NOT NULL UNIQUE,
  nombre      VARCHAR(120) NOT NULL,
  porcentaje  NUMERIC(5,2) NOT NULL,
  activo      BOOLEAN      NOT NULL DEFAULT TRUE,
  orden       INTEGER      NOT NULL DEFAULT 0
);

INSERT INTO planilla_comisiones (clave, nombre, porcentaje, orden) VALUES
  ('CONSULTA',        'Consulta médica',           50.00,  1),
  ('MEDICAMENTO',     'Medicamentos',               8.00,  2),
  ('SERVICIO',        'Servicios (general)',       30.00,  3),
  ('ULTRASONIDO',     'Ultrasonidos',              40.00,  4),
  ('CITOLOGIA',       'Citologías',                20.00,  5),
  ('LABORATORIO',     'Laboratorio',               10.00,  6),
  ('HEMOGRAMA',       'Hemogramas',                10.00,  7),
  ('SUTURA',          'Suturas',                   30.00,  8),
  ('ENFERMERIA',      'Servicios de enfermería',   30.00,  9),
  ('OXIGENOTERAPIA',  'Oxigenoterapia',            30.00, 10),
  ('HOSPITALIZACION', 'Hospitalización',           40.00, 11)
ON CONFLICT (clave) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  porcentaje = EXCLUDED.porcentaje,
  orden = EXCLUDED.orden;

-- Períodos quincenales (1-15 y 16-fin de mes)
CREATE TABLE IF NOT EXISTS planilla_periodos (
  id            SERIAL PRIMARY KEY,
  sucursal_id   INTEGER,  -- NULL = consolidado ambas sucursales
  anio          INTEGER  NOT NULL,
  mes           INTEGER  NOT NULL CHECK (mes BETWEEN 1 AND 12),
  quincena      INTEGER  NOT NULL CHECK (quincena IN (1, 2)),
  fecha_inicio  DATE     NOT NULL,
  fecha_fin     DATE     NOT NULL,
  estado        VARCHAR(20) NOT NULL DEFAULT 'ABIERTO'
                  CHECK (estado IN ('ABIERTO','CERRADO','PAGADO')),
  cerrado_por   UUID,
  cerrado_en    TIMESTAMPTZ,
  notas         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sucursal_id, anio, mes, quincena)
);

-- Producción médica (registro al cobrar — base para comisiones)
CREATE TABLE IF NOT EXISTS produccion_medica (
  id                  SERIAL PRIMARY KEY,
  sucursal_id         INTEGER       NOT NULL,
  consulta_id         INTEGER,
  doctor_id           UUID          NOT NULL,
  categoria_comision  VARCHAR(40)   NOT NULL,
  descripcion         VARCHAR(250)  NOT NULL,
  monto_bruto         NUMERIC(12,2) NOT NULL DEFAULT 0,
  descuento           NUMERIC(12,2) NOT NULL DEFAULT 0,
  monto_neto          NUMERIC(12,2) NOT NULL DEFAULT 0,
  porcentaje_comision NUMERIC(5,2)  NOT NULL DEFAULT 0,
  comision_monto      NUMERIC(12,2) NOT NULL DEFAULT 0,
  caja_movimiento_id  INTEGER,
  factura_id          INTEGER,
  fecha               DATE          NOT NULL DEFAULT CURRENT_DATE,
  created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prod_med_doctor   ON produccion_medica(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prod_med_fecha    ON produccion_medica(fecha);
CREATE INDEX IF NOT EXISTS idx_prod_med_sucursal ON produccion_medica(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_prod_med_consulta ON produccion_medica(consulta_id);

-- Liquidación por empleado y período
CREATE TABLE IF NOT EXISTS planilla_liquidaciones (
  id                SERIAL PRIMARY KEY,
  periodo_id        INTEGER       NOT NULL REFERENCES planilla_periodos(id) ON DELETE CASCADE,
  perfil_id         UUID          NOT NULL,
  tipo_nomina       VARCHAR(30)   NOT NULL,
  sueldo_fijo       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_comisiones  NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonificaciones    NUMERIC(12,2) NOT NULL DEFAULT 0,
  deducciones       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_pagar       NUMERIC(12,2) NOT NULL DEFAULT 0,
  estado            VARCHAR(20)   NOT NULL DEFAULT 'PENDIENTE'
                      CHECK (estado IN ('PENDIENTE','APROBADO','PAGADO')),
  pagado_en         TIMESTAMPTZ,
  notas             TEXT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (periodo_id, perfil_id)
);

-- Detalle de liquidación (líneas de producción incluidas)
CREATE TABLE IF NOT EXISTS planilla_liquidacion_detalle (
  id                    SERIAL PRIMARY KEY,
  liquidacion_id        INTEGER NOT NULL REFERENCES planilla_liquidaciones(id) ON DELETE CASCADE,
  produccion_medica_id  INTEGER REFERENCES produccion_medica(id),
  categoria             VARCHAR(40),
  descripcion           VARCHAR(250),
  monto_base            NUMERIC(12,2) NOT NULL DEFAULT 0,
  porcentaje            NUMERIC(5,2)  NOT NULL DEFAULT 0,
  comision              NUMERIC(12,2) NOT NULL DEFAULT 0
);

-- RLS
ALTER TABLE planilla_comisiones         ENABLE ROW LEVEL SECURITY;
ALTER TABLE planilla_periodos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE produccion_medica           ENABLE ROW LEVEL SECURITY;
ALTER TABLE planilla_liquidaciones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE planilla_liquidacion_detalle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_planilla_comisiones" ON planilla_comisiones;
CREATE POLICY "auth_planilla_comisiones" ON planilla_comisiones FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_planilla_periodos" ON planilla_periodos;
CREATE POLICY "auth_planilla_periodos" ON planilla_periodos FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_produccion_medica" ON produccion_medica;
CREATE POLICY "auth_produccion_medica" ON produccion_medica FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_planilla_liquidaciones" ON planilla_liquidaciones;
CREATE POLICY "auth_planilla_liquidaciones" ON planilla_liquidaciones FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_planilla_liq_det" ON planilla_liquidacion_detalle;
CREATE POLICY "auth_planilla_liq_det" ON planilla_liquidacion_detalle FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Módulos en menú
INSERT INTO modulos (clave, nombre, icono, orden) VALUES
  ('planilla',           'Planilla',           'Wallet',       12),
  ('control-financiero', 'Control Financiero', 'PieChart',     13)
ON CONFLICT (clave) DO UPDATE SET nombre = EXCLUDED.nombre, icono = EXCLUDED.icono, orden = EXCLUDED.orden;

INSERT INTO permisos (modulo_id, accion, descripcion)
SELECT m.id, a.accion, m.nombre || ' — ' || a.accion
FROM modulos m
CROSS JOIN (VALUES ('ver'),('crear'),('editar'),('eliminar'),('imprimir'),('exportar')) AS a(accion)
WHERE m.clave IN ('planilla', 'control-financiero')
ON CONFLICT (modulo_id, accion) DO NOTHING;

-- Super Admin y Administrador: acceso total
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
JOIN modulos m ON m.id = p.modulo_id
WHERE r.nombre IN ('Super Administrador', 'Administrador')
  AND m.clave IN ('planilla', 'control-financiero')
ON CONFLICT DO NOTHING;

-- Sincronizar tipo_nomina desde rol
UPDATE perfiles p SET tipo_nomina = 'MEDICO'
FROM roles r WHERE p.rol_id = r.id AND r.nombre = 'Médico' AND (p.tipo_nomina IS NULL OR p.tipo_nomina = 'NINGUNO');

UPDATE perfiles p SET tipo_nomina = 'ENFERMERA'
FROM roles r WHERE p.rol_id = r.id AND r.nombre = 'Enfermera' AND (p.tipo_nomina IS NULL OR p.tipo_nomina = 'NINGUNO');

UPDATE perfiles p SET tipo_nomina = 'ADMINISTRATIVO'
FROM roles r WHERE p.rol_id = r.id AND r.nombre IN ('Administrador', 'Cajero', 'Farmacéutico')
  AND (p.tipo_nomina IS NULL OR p.tipo_nomina = 'NINGUNO');
