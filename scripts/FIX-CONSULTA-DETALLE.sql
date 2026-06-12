-- ════════════════════════════════════════════════════════════════
--  consulta_detalle — esquema legacy (MySQL → Supabase)
--
--  La tabla migrada usa id_consulta (TEXT), NO consulta_id.
--  La app ya consulta id_consulta. Este script solo documenta/verifica.
--  Ejecutar en Supabase → SQL Editor si hay dudas.
-- ════════════════════════════════════════════════════════════════

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'consulta_detalle'
ORDER BY ordinal_position;

-- Debe aparecer id_consulta. Si solo existe consulta_id (instalación nueva),
-- la app también funcionará tras migración 014.
