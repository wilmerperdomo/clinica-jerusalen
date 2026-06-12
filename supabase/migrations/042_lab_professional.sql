-- Laboratorio profesional: paneles, insumos, agrupación, auditoría, SLA
-- Compatible con tablas legacy (laboratorio_insumo con id_laboratorio / id_producto / cant)

-- Agrupación de órdenes del mismo paciente / lote
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS lab_grupo_id VARCHAR(64);
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS validado_por UUID REFERENCES auth.users(id);
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS validado_at TIMESTAMPTZ;
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS notificado_at TIMESTAMPTZ;
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS tecnico_id UUID REFERENCES auth.users(id);
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS fecha_prometida DATE;

-- Prueba simple vs panel multiparamétrico
ALTER TABLE laboratorio_info ADD COLUMN IF NOT EXISTS es_panel BOOLEAN DEFAULT FALSE;

-- Rangos de referencia (por si no corrió 004_laboratorio.sql)
CREATE TABLE IF NOT EXISTS lab_rangos (
  id          SERIAL PRIMARY KEY,
  prueba_id   INTEGER NOT NULL REFERENCES laboratorio_info(id) ON DELETE CASCADE,
  genero      VARCHAR(1) DEFAULT NULL CHECK (genero IN ('M','F') OR genero IS NULL),
  edad_min    INTEGER DEFAULT 0,
  edad_max    INTEGER DEFAULT 999,
  rango_min   NUMERIC(12,4),
  rango_max   NUMERIC(12,4),
  rango_texto VARCHAR(200),
  unidad      VARCHAR(50),
  UNIQUE(prueba_id, genero, edad_min, edad_max)
);

-- Campos de panel (hemograma, perfil lipídico, etc.)
CREATE TABLE IF NOT EXISTS lab_panel_campos (
  id          SERIAL PRIMARY KEY,
  prueba_id   INTEGER NOT NULL REFERENCES laboratorio_info(id) ON DELETE CASCADE,
  codigo      VARCHAR(50),
  nombre      VARCHAR(200) NOT NULL,
  unidad      VARCHAR(50),
  orden       INTEGER DEFAULT 0,
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Resultado por campo de panel
ALTER TABLE lab_resultados ADD COLUMN IF NOT EXISTS campo_id INTEGER REFERENCES lab_panel_campos(id) ON DELETE SET NULL;

-- ── laboratorio_insumo: crear nueva O adaptar legacy ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'laboratorio_insumo'
  ) THEN
    CREATE TABLE laboratorio_insumo (
      id          SERIAL PRIMARY KEY,
      prueba_id   INTEGER NOT NULL REFERENCES laboratorio_info(id) ON DELETE CASCADE,
      producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
      cantidad    NUMERIC(10,3) NOT NULL DEFAULT 1,
      UNIQUE(prueba_id, producto_id)
    );
  ELSE
    -- Esquema viejo: id_laboratorio, id_producto, cant
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'laboratorio_insumo' AND column_name = 'id_laboratorio'
    ) THEN
      ALTER TABLE laboratorio_insumo ADD COLUMN IF NOT EXISTS prueba_id INTEGER;
      ALTER TABLE laboratorio_insumo ADD COLUMN IF NOT EXISTS producto_id INTEGER;
      ALTER TABLE laboratorio_insumo ADD COLUMN IF NOT EXISTS cantidad NUMERIC(10,3) DEFAULT 1;

      UPDATE laboratorio_insumo SET
        prueba_id   = COALESCE(prueba_id, NULLIF(TRIM(id_laboratorio::text), '')::INTEGER),
        producto_id = COALESCE(producto_id, NULLIF(TRIM(id_producto::text), '')::INTEGER),
        cantidad    = COALESCE(cantidad, NULLIF(TRIM(cant::text), '')::NUMERIC, 1)
      WHERE prueba_id IS NULL OR producto_id IS NULL OR cantidad IS NULL;
    END IF;

    -- Si existe pero sin columnas nuevas (otro formato)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'laboratorio_insumo' AND column_name = 'prueba_id'
    ) THEN
      ALTER TABLE laboratorio_insumo ADD COLUMN IF NOT EXISTS prueba_id INTEGER REFERENCES laboratorio_info(id) ON DELETE CASCADE;
      ALTER TABLE laboratorio_insumo ADD COLUMN IF NOT EXISTS producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE;
      ALTER TABLE laboratorio_insumo ADD COLUMN IF NOT EXISTS cantidad NUMERIC(10,3) NOT NULL DEFAULT 1;
    END IF;
  END IF;
END $$;

-- Auditoría de cambios en resultados
CREATE TABLE IF NOT EXISTS lab_auditoria (
  id          SERIAL PRIMARY KEY,
  orden_id    INTEGER NOT NULL REFERENCES consulta_analisis(id) ON DELETE CASCADE,
  accion      VARCHAR(50) NOT NULL,
  detalle     TEXT,
  usuario_id  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lab_grupo ON consulta_analisis(lab_grupo_id);
CREATE INDEX IF NOT EXISTS idx_lab_panel_campos_prueba ON lab_panel_campos(prueba_id);
CREATE INDEX IF NOT EXISTS idx_lab_auditoria_orden ON lab_auditoria(orden_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'laboratorio_insumo' AND column_name = 'prueba_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_lab_insumo_prueba ON laboratorio_insumo(prueba_id);
  END IF;
END $$;

ALTER TABLE lab_panel_campos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_rangos ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_auditoria ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  ALTER TABLE laboratorio_insumo ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lab_panel_campos' AND policyname='auth_lab_panel_all') THEN
    CREATE POLICY "auth_lab_panel_all" ON lab_panel_campos FOR ALL TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lab_rangos' AND policyname='auth_lab_rangos_all') THEN
    CREATE POLICY "auth_lab_rangos_all" ON lab_rangos FOR ALL TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='laboratorio_insumo' AND policyname='auth_lab_insumo_all') THEN
    CREATE POLICY "auth_lab_insumo_all" ON laboratorio_insumo FOR ALL TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='lab_auditoria' AND policyname='auth_lab_audit_all') THEN
    CREATE POLICY "auth_lab_audit_all" ON lab_auditoria FOR ALL TO authenticated USING (true);
  END IF;
END $$;

-- Backfill lab_grupo_id para órdenes existentes
UPDATE consulta_analisis
SET lab_grupo_id = 'legacy-' || COALESCE(paciente_id::text, id_cliente, '0') || '-' || fecha || '-' || COALESCE(id_consulta, 'direct')
WHERE lab_grupo_id IS NULL;

-- Fecha prometida desde días de entrega del catálogo
UPDATE consulta_analisis ca
SET fecha_prometida = ca.fecha + COALESCE(NULLIF(TRIM(li.dias::text), '')::INTEGER, 1)
FROM laboratorio_info li
WHERE ca.id_analisis::text = li.id::text AND ca.fecha_prometida IS NULL;

-- Rangos de referencia ejemplo (solo si lab_rangos tiene prueba_id)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lab_rangos' AND column_name = 'prueba_id'
  ) THEN
    INSERT INTO lab_rangos (prueba_id, genero, edad_min, edad_max, rango_min, rango_max, rango_texto, unidad)
    SELECT li.id, NULL, 0, 999, 70, 100, '70 – 100', 'mg/dL'
    FROM laboratorio_info li WHERE li.nombre ILIKE '%glicemia%'
      AND NOT EXISTS (SELECT 1 FROM lab_rangos r WHERE r.prueba_id = li.id);

    INSERT INTO lab_rangos (prueba_id, genero, edad_min, edad_max, rango_min, rango_max, rango_texto, unidad)
    SELECT li.id, NULL, 0, 999, 0.6, 1.2, '0.6 – 1.2', 'mg/dL'
    FROM laboratorio_info li WHERE li.nombre ILIKE '%creatinina%'
      AND NOT EXISTS (SELECT 1 FROM lab_rangos r WHERE r.prueba_id = li.id AND r.rango_texto LIKE '0.6%');
  END IF;
END $$;

-- Panel Hemograma (si existe la prueba)
DO $$
DECLARE pid INTEGER;
BEGIN
  SELECT id INTO pid FROM laboratorio_info WHERE nombre ILIKE '%hemograma%' LIMIT 1;
  IF pid IS NOT NULL THEN
    UPDATE laboratorio_info SET es_panel = TRUE WHERE id = pid;
    INSERT INTO lab_panel_campos (prueba_id, codigo, nombre, unidad, orden)
    SELECT pid, v.codigo, v.nombre, v.unidad, v.orden
    FROM (VALUES
      ('WBC', 'Leucocitos', 'x10³/µL', 1),
      ('RBC', 'Eritrocitos', 'x10⁶/µL', 2),
      ('HGB', 'Hemoglobina', 'g/dL', 3),
      ('HCT', 'Hematocrito', '%', 4),
      ('PLT', 'Plaquetas', 'x10³/µL', 5),
      ('MCV', 'VCM', 'fL', 6),
      ('MCH', 'HCM', 'pg', 7)
    ) AS v(codigo, nombre, unidad, orden)
    WHERE NOT EXISTS (
      SELECT 1 FROM lab_panel_campos c WHERE c.prueba_id = pid AND c.codigo = v.codigo
    );
  END IF;
END $$;
