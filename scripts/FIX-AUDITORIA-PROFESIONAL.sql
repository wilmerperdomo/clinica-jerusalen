-- FIX: Auditoría profesional — pegar en Supabase SQL Editor
-- (mismo contenido que supabase/migrations/097_auditoria_profesional.sql)

ALTER TABLE auditoria_general
  ADD COLUMN IF NOT EXISTS ip_address  VARCHAR(45),
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS sucursal_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_audit_gen_sucursal ON auditoria_general(sucursal_id);

ALTER TABLE respaldos
  ADD COLUMN IF NOT EXISTS hash_sha256 VARCHAR(64),
  ADD COLUMN IF NOT EXISTS comprimido  BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS auditoria_accesos (
  id              SERIAL PRIMARY KEY,
  accion          VARCHAR(40)  NOT NULL,
  detalle         TEXT,
  usuario_id      UUID,
  usuario_nombre  VARCHAR(200),
  usuario_email   VARCHAR(200),
  ip_address      VARCHAR(45),
  user_agent      TEXT,
  fecha           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_acc_fecha ON auditoria_accesos(fecha DESC);

ALTER TABLE auditoria_accesos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_acc_super" ON auditoria_accesos;
CREATE POLICY "audit_acc_super" ON auditoria_accesos
  FOR ALL TO authenticated
  USING (fn_usuario_es_super_admin())
  WITH CHECK (fn_usuario_es_super_admin());

-- Ver migración 097 para fn_auditoria_enmascarar, fn_auditoria_generica y triggers completos.
