-- ═══════════════════════════════════════════════════════════════
--  067 — Reparar RLS de las tablas de laboratorio
--   Síntoma: "new row violates row-level security policy for
--   table consulta_analisis" al generar una orden de laboratorio.
--   Causa: la tabla (heredada) tiene RLS activo pero la política
--   permisiva no incluye WITH CHECK, por lo que rechaza los INSERT.
--   Solución: recrear políticas FOR ALL ... USING(true) WITH CHECK(true)
--   para usuarios autenticados (mismo patrón que la migración 057).
-- ═══════════════════════════════════════════════════════════════

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

      -- Eliminar políticas previas (cualquier nombre) que pudieran bloquear el INSERT
      FOR pol IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, t);
      END LOOP;

      -- Acceso completo para usuarios autenticados (lectura + escritura)
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
        'auth_' || t || '_all', t
      );
    END IF;
  END LOOP;
END $$;
