-- ════════════════════════════════════════════════════════════
--  MÓDULO MEMBRESÍAS / PLANES MÉDICOS
-- ════════════════════════════════════════════════════════════

-- ── 1. Tipos de plan ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS membresia_tipos (
  id             SERIAL PRIMARY KEY,
  nombre         VARCHAR(120) NOT NULL,
  precio         NUMERIC(12,2) NOT NULL DEFAULT 0,
  duracion_dias  INTEGER      NOT NULL DEFAULT 30,
  descripcion    TEXT,
  activo         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 2. Beneficios por tipo ────────────────────────────────
CREATE TABLE IF NOT EXISTS membresia_beneficios (
  id          SERIAL PRIMARY KEY,
  tipo_id     INTEGER NOT NULL REFERENCES membresia_tipos(id) ON DELETE CASCADE,
  descripcion TEXT    NOT NULL,
  activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── 3. Membresías de pacientes ────────────────────────────
CREATE TABLE IF NOT EXISTS membresias (
  id              SERIAL PRIMARY KEY,
  paciente_id     INTEGER NOT NULL,   -- FK lógica a pacientes
  tipo_id         INTEGER NOT NULL REFERENCES membresia_tipos(id),
  fecha_inicio    DATE    NOT NULL,
  fecha_fin       DATE    NOT NULL,
  cuotas_pagadas  INTEGER NOT NULL DEFAULT 0,
  estado          VARCHAR(20) NOT NULL DEFAULT 'activo'
                    CHECK (estado IN ('activo','inactivo','vencido')),
  comentarios     TEXT,
  usuario_id      UUID,               -- FK lógica a auth.users
  sucursal_id     INTEGER,            -- FK lógica a sucursales
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membresias_paciente ON membresias(paciente_id);
CREATE INDEX IF NOT EXISTS idx_membresias_estado   ON membresias(estado);
CREATE INDEX IF NOT EXISTS idx_membresias_fin       ON membresias(fecha_fin);

-- ── 4. Beneficiarios por membresía ───────────────────────
CREATE TABLE IF NOT EXISTS membresia_beneficiarios (
  id           SERIAL PRIMARY KEY,
  membresia_id INTEGER NOT NULL REFERENCES membresias(id) ON DELETE CASCADE,
  nombre       VARCHAR(150) NOT NULL,
  parentesco   VARCHAR(80),
  activo       BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── 5. Datos iniciales de ejemplo ────────────────────────
INSERT INTO membresia_tipos (nombre, precio, duracion_dias, descripcion) VALUES
  ('Plan Básico',     300.00,  30, 'Consultas generales ilimitadas por 30 días'),
  ('Plan Familiar',   700.00,  90, 'Hasta 4 beneficiarios, consultas + laboratorio'),
  ('Plan Premium',   1500.00, 365, 'Cobertura anual completa, descuentos en todo')
ON CONFLICT DO NOTHING;

INSERT INTO membresia_beneficios (tipo_id, descripcion) VALUES
  (1, 'Consultas generales ilimitadas'),
  (1, '10% de descuento en laboratorio'),
  (2, 'Consultas generales ilimitadas para titular y hasta 3 beneficiarios'),
  (2, '15% de descuento en laboratorio'),
  (2, '10% de descuento en medicamentos'),
  (3, 'Consultas generales y especializadas ilimitadas'),
  (3, '20% de descuento en laboratorio'),
  (3, '15% de descuento en medicamentos'),
  (3, 'Consultas de emergencia sin costo adicional')
ON CONFLICT DO NOTHING;

-- ── 6. RLS ───────────────────────────────────────────────
ALTER TABLE membresia_tipos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE membresia_beneficios    ENABLE ROW LEVEL SECURITY;
ALTER TABLE membresias              ENABLE ROW LEVEL SECURITY;
ALTER TABLE membresia_beneficiarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_membresia_tipos"         ON membresia_tipos         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_membresia_beneficios"    ON membresia_beneficios    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_membresias"              ON membresias              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_membresia_beneficiarios" ON membresia_beneficiarios FOR ALL TO authenticated USING (true) WITH CHECK (true);
