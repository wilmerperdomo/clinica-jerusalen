-- Flujo laboratorio: cobro → procesamiento → resultado → entrega
-- Compatible con pagado/entregado como BOOLEAN o VARCHAR (datos legacy)

ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS estado_lab VARCHAR(30) DEFAULT 'PENDIENTE_COBRO';
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS resultado_resumen TEXT;
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS fecha_resultado DATE;
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS paciente_id INTEGER REFERENCES pacientes(id);

-- Normalizar paciente_id desde id_cliente
UPDATE consulta_analisis
SET paciente_id = NULLIF(regexp_replace(id_cliente, '[^0-9]', '', 'g'), '')::INTEGER
WHERE paciente_id IS NULL AND id_cliente ~ '^[0-9]+$';

-- Convertir pagado/entregado a BOOLEAN si aún son texto (esquema viejo)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'consulta_analisis'
      AND column_name = 'pagado' AND data_type IN ('character varying', 'text')
  ) THEN
    ALTER TABLE consulta_analisis ALTER COLUMN pagado DROP DEFAULT;
    ALTER TABLE consulta_analisis
      ALTER COLUMN pagado TYPE BOOLEAN
      USING (
        CASE WHEN COALESCE(TRIM(pagado::text), '') IN ('1','true','TRUE','t','yes','si','SI') THEN TRUE
        ELSE FALSE END
      );
    ALTER TABLE consulta_analisis ALTER COLUMN pagado SET DEFAULT FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'consulta_analisis'
      AND column_name = 'entregado' AND data_type IN ('character varying', 'text')
  ) THEN
    ALTER TABLE consulta_analisis ALTER COLUMN entregado DROP DEFAULT;
    ALTER TABLE consulta_analisis
      ALTER COLUMN entregado TYPE BOOLEAN
      USING (
        CASE WHEN COALESCE(TRIM(entregado::text), '') IN ('1','true','TRUE','t','yes','si','SI') THEN TRUE
        ELSE FALSE END
      );
    ALTER TABLE consulta_analisis ALTER COLUMN entregado SET DEFAULT FALSE;
  END IF;
END $$;

-- Sincronizar estado_lab con columnas existentes (solo comparación por texto, sin mezclar tipos)
UPDATE consulta_analisis SET estado_lab = 'ENTREGADO'
WHERE COALESCE(TRIM(entregado::text), '') IN ('1', 'true', 'TRUE', 't')
  AND (estado_lab IS NULL OR estado_lab = 'PENDIENTE_COBRO');

UPDATE consulta_analisis SET estado_lab = 'RESULTADO_LISTO'
WHERE estado_lab IS NULL
  AND id IN (SELECT DISTINCT orden_id FROM lab_resultados);

UPDATE consulta_analisis SET estado_lab = 'PAGADO'
WHERE COALESCE(TRIM(pagado::text), '') IN ('1', 'true', 'TRUE', 't')
  AND (estado_lab IS NULL OR estado_lab = 'PENDIENTE_COBRO');

UPDATE consulta_analisis SET estado_lab = 'PENDIENTE_COBRO' WHERE estado_lab IS NULL;

CREATE INDEX IF NOT EXISTS idx_consulta_analisis_estado_lab ON consulta_analisis(estado_lab);
CREATE INDEX IF NOT EXISTS idx_consulta_analisis_paciente_id ON consulta_analisis(paciente_id);
