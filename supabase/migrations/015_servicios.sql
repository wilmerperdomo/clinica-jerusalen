-- ════════════════════════════════════════════════════════════════
--  CATÁLOGO DE SERVICIOS
--  Equivalente a las tablas: servicio, servicio_precio, servicio_valor
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS servicios (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(200)  NOT NULL,
  tipo        VARCHAR(100)  DEFAULT 'General',  -- Inyectable, Curación, Procedimiento, etc.
  descripcion TEXT,
  precio      NUMERIC(12,2) NOT NULL DEFAULT 0,
  activo      BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_servicios_nombre ON servicios(nombre);
CREATE INDEX IF NOT EXISTS idx_servicios_activo ON servicios(activo);

-- ── Datos de ejemplo ─────────────────────────────────────────────
INSERT INTO servicios (nombre, tipo, precio) VALUES
  ('Inyección Intramuscular',     'Inyectable',    50.00),
  ('Inyección Intravenosa',       'Inyectable',    80.00),
  ('Nebulización',                'Procedimiento', 80.00),
  ('Electrocardiograma',          'Procedimiento', 200.00),
  ('Curación Simple',             'Curación',      80.00),
  ('Curación Compleja',           'Curación',      150.00),
  ('Toma de Presión Arterial',    'Control',       30.00),
  ('Control de Glucosa',          'Control',       50.00),
  ('Aplicación de Oxígeno',       'Procedimiento', 100.00),
  ('Sutura',                      'Cirugía Menor', 300.00),
  ('Extracción de Puntos',        'Cirugía Menor', 100.00),
  ('Ultrasonido',                 'Diagnóstico',   350.00),
  ('Hemograma',                   'Laboratorio',   150.00),
  ('Examen General de Orina',     'Laboratorio',   80.00),
  ('Prueba de Embarazo',          'Laboratorio',   60.00),
  ('Glicemia',                    'Laboratorio',   60.00),
  ('Terapia Respiratoria',        'Procedimiento', 120.00),
  ('Certificado Médico',          'Documento',     150.00),
  ('Desintoxicación Alcohólica',  'Procedimiento', 500.00),
  ('Control Prenatal',            'Control',       200.00)
ON CONFLICT DO NOTHING;

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE servicios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_servicios" ON servicios;
CREATE POLICY "auth_servicios"
  ON servicios FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
