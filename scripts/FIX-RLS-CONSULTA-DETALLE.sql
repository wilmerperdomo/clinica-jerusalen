-- ═══════════════════════════════════════════════════════════════
--  FIX — Error al guardar medicamentos:
--   "new row violates row-level security policy for table consulta_detalle"
--  Ejecutar en: Supabase → SQL Editor → New query → Run
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.consulta_detalle') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE consulta_detalle ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "auth_consulta_det_all" ON consulta_detalle';
    EXECUTE 'DROP POLICY IF EXISTS "consulta_detalle_all" ON consulta_detalle';
    EXECUTE 'CREATE POLICY "auth_consulta_det_all" ON consulta_detalle '
         || 'FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Verificar que la política quedó creada:
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'consulta_detalle';
