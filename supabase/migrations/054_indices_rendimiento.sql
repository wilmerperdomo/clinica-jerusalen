-- ═══════════════════════════════════════════════════════════════
--  054 — Índices de rendimiento (robusto)
--  Crea cada índice SOLO si la tabla y la columna existen, para no
--  fallar en bases de datos legacy donde alguna columna no está.
--  Seguro de re-ejecutar.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  d_str  TEXT;
  parts  TEXT[];
  defs   TEXT[] := ARRAY[
    'idx_caja_sesiones_sucursal|caja_sesiones|sucursal_id',
    'idx_caja_sesiones_estado|caja_sesiones|estado',
    'idx_citas_sucursal|citas|sucursal_id',
    'idx_citas_estado|citas|estado',
    'idx_cxc_paciente|cxc|paciente_id',
    'idx_cotizaciones_paciente|cotizaciones|paciente_id',
    'idx_consulta_documentos_paciente|consulta_documentos|paciente_id',
    'idx_facturas_sucursal|facturas|sucursal_id',
    'idx_facturas_paciente|facturas|paciente_id',
    'idx_facturas_fecha|facturas|fecha',
    'idx_caja_movimientos_sesion|caja_movimientos|sesion_id'
  ];
BEGIN
  FOREACH d_str IN ARRAY defs LOOP
    parts := string_to_array(d_str, '|');
    IF to_regclass('public.' || parts[2]) IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = parts[2]
           AND column_name  = parts[3]
       ) THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (%I)', parts[1], parts[2], parts[3]);
    END IF;
  END LOOP;
END $$;
