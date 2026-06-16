-- ═══════════════════════════════════════════════════════════════
--  057 — Reparar RLS de consulta_detalle (recetas / medicamentos)
--   Síntoma: "new row violates row-level security policy for
--   table consulta_detalle" al guardar medicamentos.
--   Causa: en la BD legacy la tabla tiene RLS activo pero le falta
--   la política permisiva de la migración 014.
-- ═══════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF to_regclass('public.consulta_detalle') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE consulta_detalle ENABLE ROW LEVEL SECURITY';

    -- Limpiar cualquier política previa que pudiera estar bloqueando
    EXECUTE 'DROP POLICY IF EXISTS "auth_consulta_det_all" ON consulta_detalle';
    EXECUTE 'DROP POLICY IF EXISTS "consulta_detalle_all" ON consulta_detalle';

    -- Acceso completo para usuarios autenticados
    EXECUTE 'CREATE POLICY "auth_consulta_det_all" ON consulta_detalle '
         || 'FOR ALL TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;
