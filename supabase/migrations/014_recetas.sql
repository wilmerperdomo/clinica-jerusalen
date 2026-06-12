-- ════════════════════════════════════════════════════════════════
--  RECETAS MÉDICAS — Tabla consulta_detalle
--  Almacena los medicamentos prescritos en cada consulta
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS consulta_detalle (
  id              SERIAL PRIMARY KEY,
  consulta_id     INTEGER       NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
  paciente_id     INTEGER,
  producto_id     INTEGER,
  no_producto     VARCHAR(300)  NOT NULL,   -- nombre del medicamento
  indicacion      TEXT,                     -- instrucciones / dosis
  cant            NUMERIC(8,2)  DEFAULT 1,  -- cantidad prescrita
  via             VARCHAR(100),             -- vía de administración
  usuario         UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consulta_det_consulta  ON consulta_detalle(consulta_id);
CREATE INDEX IF NOT EXISTS idx_consulta_det_paciente  ON consulta_detalle(paciente_id);
CREATE INDEX IF NOT EXISTS idx_consulta_det_producto  ON consulta_detalle(producto_id);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE consulta_detalle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_consulta_det_all" ON consulta_detalle;
CREATE POLICY "auth_consulta_det_all"
  ON consulta_detalle FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
