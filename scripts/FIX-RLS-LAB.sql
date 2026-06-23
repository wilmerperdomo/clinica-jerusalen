-- Ejecutar en Supabase → SQL Editor para reparar el error:
--   "new row violates row-level security policy for table consulta_analisis"
-- Recrea las políticas de laboratorio con WITH CHECK (true) para autenticados.

DO $$
DECLARE
  t TEXT;
  pol RECORD;
  tablas TEXT[] := ARRAY[
    'consulta_analisis',
    'lab_resultados',
    'lab_rangos',
    'lab_panel_campos',
    'laboratorio_insumo',
    'lab_auditoria',
    'laboratorio_info',
    'laboratorio_valor'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

      FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
      END LOOP;

      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        'auth_' || t || '_all', t
      );
    END IF;
  END LOOP;
END $$;

-- Verificación: deben aparecer las políticas auth_*_all con cmd = ALL
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('consulta_analisis','lab_resultados','lab_rangos','lab_panel_campos',
                    'laboratorio_insumo','lab_auditoria','laboratorio_info','laboratorio_valor')
ORDER BY tablename;
