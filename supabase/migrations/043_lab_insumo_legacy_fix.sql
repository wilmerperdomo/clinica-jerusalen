-- Reparación puntual si 042 falló a medias por columnas legacy en laboratorio_insumo
-- Ejecutar solo si sigue el error de prueba_id

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'laboratorio_insumo'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'laboratorio_insumo' AND column_name = 'prueba_id'
  ) THEN
    ALTER TABLE laboratorio_insumo ADD COLUMN prueba_id INTEGER;
    ALTER TABLE laboratorio_insumo ADD COLUMN producto_id INTEGER;
    ALTER TABLE laboratorio_insumo ADD COLUMN cantidad NUMERIC(10,3) DEFAULT 1;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'laboratorio_insumo' AND column_name = 'id_laboratorio'
  ) THEN
    UPDATE laboratorio_insumo SET
      prueba_id   = COALESCE(prueba_id, NULLIF(TRIM(id_laboratorio::text), '')::INTEGER),
      producto_id = COALESCE(producto_id, NULLIF(TRIM(id_producto::text), '')::INTEGER),
      cantidad    = COALESCE(cantidad, NULLIF(TRIM(cant::text), '')::NUMERIC, 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_lab_insumo_prueba ON laboratorio_insumo(prueba_id);
