-- ════════════════════════════════════════════════════════════════
--  SERVICIOS DURANTE CONSULTA + ESTADO DE COBRO
--  Equivalente a: consulta_servicio, consulta.estado_pago
-- ════════════════════════════════════════════════════════════════

-- Servicios que el doctor agrega durante el examen médico
CREATE TABLE IF NOT EXISTS consulta_servicios (
  id          SERIAL PRIMARY KEY,
  consulta_id INTEGER       NOT NULL REFERENCES consultas(id) ON DELETE CASCADE,
  servicio_id INTEGER       REFERENCES servicios(id),
  nombre      VARCHAR(200)  NOT NULL,
  precio      NUMERIC(12,2) NOT NULL DEFAULT 0,
  cantidad    INTEGER       NOT NULL DEFAULT 1,
  usuario     VARCHAR(100),
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cons_serv_consulta ON consulta_servicios(consulta_id);

-- Campo para controlar si la consulta ya fue cobrada en Caja
ALTER TABLE consultas ADD COLUMN IF NOT EXISTS cobrado    BOOLEAN     NOT NULL DEFAULT FALSE;
ALTER TABLE consultas ADD COLUMN IF NOT EXISTS cobrado_en TIMESTAMPTZ;
ALTER TABLE consultas ADD COLUMN IF NOT EXISTS cobrado_por VARCHAR(100);

-- ── RLS ──────────────────────────────────────────────────────────
ALTER TABLE consulta_servicios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_consulta_servicios" ON consulta_servicios;
CREATE POLICY "auth_consulta_servicios"
  ON consulta_servicios FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
