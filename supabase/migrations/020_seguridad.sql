-- ═══════════════════════════════════════════════════════════════
-- 020_seguridad.sql
-- Log de accesos al sistema
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS acceso_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID,
  email       TEXT,
  accion      TEXT NOT NULL,   -- 'login' | 'logout' | 'timeout'
  ip          TEXT,
  user_agent  TEXT,
  sucursal_id INTEGER REFERENCES sucursales(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acceso_logs_user    ON acceso_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_acceso_logs_created ON acceso_logs(created_at DESC);

-- RLS: solo admin puede leer, cualquier usuario autenticado puede insertar
ALTER TABLE acceso_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "acceso_logs_insert"       ON acceso_logs;
DROP POLICY IF EXISTS "acceso_logs_admin_select" ON acceso_logs;

CREATE POLICY "acceso_logs_insert" ON acceso_logs
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "acceso_logs_admin_select" ON acceso_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM perfiles p
      JOIN   roles r ON r.id = p.rol_id
      WHERE  p.id = auth.uid() AND r.es_admin = true
    )
  );
