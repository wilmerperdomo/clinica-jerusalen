-- ============================================================
--  MÓDULO LABORATORIO v2.0
--  Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- ---- Adaptar laboratorio_info (tabla existente) ----
ALTER TABLE laboratorio_info ADD COLUMN IF NOT EXISTS activo  BOOLEAN DEFAULT TRUE;
ALTER TABLE laboratorio_info ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE laboratorio_info ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Normalizar tipos de costo
ALTER TABLE laboratorio_info ALTER COLUMN costo     TYPE NUMERIC(10,2) USING NULLIF(costo,'')::NUMERIC;
ALTER TABLE laboratorio_info ALTER COLUMN comision  TYPE NUMERIC(5,2)  USING NULLIF(comision::text,'')::NUMERIC;

-- ---- Adaptar laboratorio_valor (tabla existente) ----
ALTER TABLE laboratorio_valor ALTER COLUMN valor    TYPE NUMERIC(10,2) USING NULLIF(valor,'')::NUMERIC;
ALTER TABLE laboratorio_valor ALTER COLUMN id_prueba TYPE INTEGER      USING NULLIF(id_prueba,'')::INTEGER;
ALTER TABLE laboratorio_valor ALTER COLUMN id_lista  TYPE INTEGER      USING NULLIF(id_lista,'')::INTEGER;

-- ---- Adaptar consulta_analisis (tabla existente) ----
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS pagado       BOOLEAN DEFAULT FALSE;
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS entregado    BOOLEAN DEFAULT FALSE;
ALTER TABLE consulta_analisis ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE consulta_analisis ALTER COLUMN valor   TYPE NUMERIC(10,2) USING NULLIF(valor,'')::NUMERIC;
ALTER TABLE consulta_analisis ALTER COLUMN importe TYPE NUMERIC(10,2) USING NULLIF(importe,'')::NUMERIC;
ALTER TABLE consulta_analisis ALTER COLUMN cant    TYPE INTEGER        USING NULLIF(cant,'')::INTEGER;

-- ---- RESULTADOS DE LABORATORIO ----
-- Tabla para almacenar los valores obtenidos de cada prueba
CREATE TABLE IF NOT EXISTS lab_resultados (
    id              SERIAL PRIMARY KEY,
    orden_id        INTEGER NOT NULL REFERENCES consulta_analisis(id) ON DELETE CASCADE,
    paciente_id     INTEGER REFERENCES pacientes(id),
    prueba_id       INTEGER REFERENCES laboratorio_info(id),
    nombre_prueba   VARCHAR(255),
    -- resultado
    valor_resultado TEXT,
    unidad          VARCHAR(50),
    -- rangos de referencia
    rango_min       NUMERIC(12,4),
    rango_max       NUMERIC(12,4),
    rango_texto     VARCHAR(200),   -- ej: "Negativo", "A / B / AB / O"
    -- estado
    anormal         BOOLEAN DEFAULT FALSE,
    observacion     TEXT,
    -- auditoría
    registrado_por  UUID REFERENCES auth.users(id),
    fecha           DATE DEFAULT CURRENT_DATE,
    hora            TIME DEFAULT CURRENT_TIME,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ---- RANGOS DE REFERENCIA (catálogo) ----
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

-- ---- ÍNDICES ----
CREATE INDEX IF NOT EXISTS idx_lab_ordenes_fecha     ON consulta_analisis(fecha);
CREATE INDEX IF NOT EXISTS idx_lab_ordenes_paciente  ON consulta_analisis(id_cliente);
CREATE INDEX IF NOT EXISTS idx_lab_resultados_orden  ON lab_resultados(orden_id);
CREATE INDEX IF NOT EXISTS idx_lab_resultados_fecha  ON lab_resultados(fecha);

-- ---- RLS ----
ALTER TABLE lab_resultados  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_rangos      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_lab_resultados_all" ON lab_resultados FOR ALL TO authenticated USING (true);
CREATE POLICY "auth_lab_rangos_sel"     ON lab_rangos     FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_lab_rangos_all"     ON lab_rangos     FOR ALL TO authenticated USING (true);

-- También habilitar RLS en tablas existentes si no están habilitadas
ALTER TABLE laboratorio_info   ENABLE ROW LEVEL SECURITY;
ALTER TABLE laboratorio_valor  ENABLE ROW LEVEL SECURITY;
ALTER TABLE consulta_analisis  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='laboratorio_info' AND policyname='auth_lab_info_all') THEN
        CREATE POLICY "auth_lab_info_all"  ON laboratorio_info  FOR ALL TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='laboratorio_valor' AND policyname='auth_lab_valor_all') THEN
        CREATE POLICY "auth_lab_valor_all" ON laboratorio_valor FOR ALL TO authenticated USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='consulta_analisis' AND policyname='auth_lab_ordenes_all') THEN
        CREATE POLICY "auth_lab_ordenes_all" ON consulta_analisis FOR ALL TO authenticated USING (true);
    END IF;
END $$;

-- ---- Pruebas de ejemplo en laboratorio_info (si no hay datos) ----
INSERT INTO laboratorio_info (nombre, description, color, dias, costo, comision, activo)
SELECT nombre, description, color, dias, costo, comision, TRUE
FROM (VALUES
    ('Hemograma Completo',       'BHC - sangre completa',         'Lila',      1, 150.00, 10.00),
    ('Glicemia',                 'Glucosa en sangre',             'Gris',      1, 80.00,  10.00),
    ('Perfil Lipídico',          'Colesterol / TG / HDL / LDL',  'Rojo',      1, 250.00, 10.00),
    ('Creatinina',               'Función renal',                 'Rojo',      1, 100.00, 10.00),
    ('Transaminasas (TGO/TGP)',  'Función hepática',              'Rojo',      1, 150.00, 10.00),
    ('Examen General de Orina',  'EGO',                           'Amarillo',  1, 100.00, 10.00),
    ('Tipo y Rh',                'Grupo sanguíneo',               'Rosado',    1, 80.00,  5.00),
    ('Prueba de Embarazo',       'B-HCG cualitativa',             'Rosado',    1, 100.00, 10.00),
    ('VIH (ELISA)',              'Prueba rápida VIH',             'Rojo',      1, 150.00, 10.00),
    ('Cultivo y Antibiograma',   'Urocultivo / hemocultivo',      'Amarillo',  3, 300.00, 10.00)
) AS v(nombre, description, color, dias, costo, comision)
WHERE NOT EXISTS (SELECT 1 FROM laboratorio_info LIMIT 1);
