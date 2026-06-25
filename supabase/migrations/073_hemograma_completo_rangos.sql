-- ═══════════════════════════════════════════════════════════════
-- 073_hemograma_completo_rangos.sql
-- Rangos de referencia por parámetro de panel (hemograma completo)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE lab_rangos
  ADD COLUMN IF NOT EXISTS campo_id INTEGER REFERENCES lab_panel_campos(id) ON DELETE CASCADE;

-- Reemplazar unicidad global por índices parciales (prueba simple vs panel)
ALTER TABLE lab_rangos DROP CONSTRAINT IF EXISTS lab_rangos_prueba_id_genero_edad_min_edad_max_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_rangos_prueba_simple
  ON lab_rangos (prueba_id, COALESCE(genero, ''), edad_min, edad_max)
  WHERE campo_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lab_rangos_prueba_campo
  ON lab_rangos (prueba_id, campo_id, COALESCE(genero, ''), edad_min, edad_max)
  WHERE campo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lab_rangos_campo ON lab_rangos(campo_id);

-- Hemograma completo: parámetros + rangos de referencia
DO $$
DECLARE
  pid INTEGER;
  cid INTEGER;
  v RECORD;
BEGIN
  SELECT id INTO pid FROM laboratorio_info WHERE nombre ILIKE '%hemograma%' LIMIT 1;
  IF pid IS NULL THEN
    RAISE NOTICE 'No se encontró prueba Hemograma en laboratorio_info';
    RETURN;
  END IF;

  UPDATE laboratorio_info SET es_panel = TRUE WHERE id = pid;

  FOR v IN
    SELECT * FROM (VALUES
      ('HGB', 'Hemoglobina', 'g/dL', 1),
      ('HCT', 'Hematocrito', '%', 2),
      ('RBC', 'Eritrocitos', 'mill/mm³', 3),
      ('MCV', 'VCM', 'fL', 4),
      ('MCH', 'HCM', 'pg', 5),
      ('MCHC', 'CHCM', 'g/dL', 6),
      ('RDW', 'RDW-CV', '%', 7),
      ('WBC', 'Leucocitos', '/mm³', 10),
      ('NEU_PCT', 'Neutrófilos segmentados', '%', 11),
      ('LYM_PCT', 'Linfocitos', '%', 12),
      ('MON_PCT', 'Monocitos', '%', 13),
      ('EOS_PCT', 'Eosinófilos', '%', 14),
      ('BAS_PCT', 'Basófilos', '%', 15),
      ('NEU_ABS', 'Neutrófilos (absolutos)', '/mm³', 16),
      ('LYM_ABS', 'Linfocitos (absolutos)', '/mm³', 17),
      ('MON_ABS', 'Monocitos (absolutos)', '/mm³', 18),
      ('EOS_ABS', 'Eosinófilos (absolutos)', '/mm³', 19),
      ('BAS_ABS', 'Basófilos (absolutos)', '/mm³', 20),
      ('PLT', 'Plaquetas', '/mm³', 25),
      ('MPV', 'VPM', 'fL', 26),
      ('PDW', 'PDW', '%', 27)
    ) AS t(codigo, nombre, unidad, orden)
  LOOP
    INSERT INTO lab_panel_campos (prueba_id, codigo, nombre, unidad, orden, activo)
    SELECT pid, v.codigo, v.nombre, v.unidad, v.orden, TRUE
    WHERE NOT EXISTS (
      SELECT 1 FROM lab_panel_campos c WHERE c.prueba_id = pid AND c.codigo = v.codigo
    );

    UPDATE lab_panel_campos
    SET nombre = v.nombre, unidad = v.unidad, orden = v.orden, activo = TRUE
    WHERE prueba_id = pid AND codigo = v.codigo;

    SELECT id INTO cid FROM lab_panel_campos WHERE prueba_id = pid AND codigo = v.codigo LIMIT 1;
    IF cid IS NULL THEN CONTINUE; END IF;

    -- Rango masculino
    IF v.codigo = 'HGB' THEN
      INSERT INTO lab_rangos (prueba_id, campo_id, genero, edad_min, edad_max, rango_min, rango_max, rango_texto, unidad)
      SELECT pid, cid, 'M', 0, 120, 13.5, 17.5, '13.5 – 17.5', 'g/dL'
      WHERE NOT EXISTS (SELECT 1 FROM lab_rangos r WHERE r.campo_id = cid AND r.genero = 'M');
      INSERT INTO lab_rangos (prueba_id, campo_id, genero, edad_min, edad_max, rango_min, rango_max, rango_texto, unidad)
      SELECT pid, cid, 'F', 0, 120, 12.0, 15.5, '12.0 – 15.5', 'g/dL'
      WHERE NOT EXISTS (SELECT 1 FROM lab_rangos r WHERE r.campo_id = cid AND r.genero = 'F');
    ELSIF v.codigo = 'HCT' THEN
      INSERT INTO lab_rangos (prueba_id, campo_id, genero, edad_min, edad_max, rango_min, rango_max, rango_texto, unidad)
      SELECT pid, cid, 'M', 0, 120, 41, 53, '41 – 53', '%'
      WHERE NOT EXISTS (SELECT 1 FROM lab_rangos r WHERE r.campo_id = cid AND r.genero = 'M');
      INSERT INTO lab_rangos (prueba_id, campo_id, genero, edad_min, edad_max, rango_min, rango_max, rango_texto, unidad)
      SELECT pid, cid, 'F', 0, 120, 36, 46, '36 – 46', '%'
      WHERE NOT EXISTS (SELECT 1 FROM lab_rangos r WHERE r.campo_id = cid AND r.genero = 'F');
    ELSIF v.codigo = 'RBC' THEN
      INSERT INTO lab_rangos (prueba_id, campo_id, genero, edad_min, edad_max, rango_min, rango_max, rango_texto, unidad)
      SELECT pid, cid, 'M', 0, 120, 4.5, 5.9, '4.5 – 5.9', 'mill/mm³'
      WHERE NOT EXISTS (SELECT 1 FROM lab_rangos r WHERE r.campo_id = cid AND r.genero = 'M');
      INSERT INTO lab_rangos (prueba_id, campo_id, genero, edad_min, edad_max, rango_min, rango_max, rango_texto, unidad)
      SELECT pid, cid, 'F', 0, 120, 4.0, 5.2, '4.0 – 5.2', 'mill/mm³'
      WHERE NOT EXISTS (SELECT 1 FROM lab_rangos r WHERE r.campo_id = cid AND r.genero = 'F');
    ELSE
      INSERT INTO lab_rangos (prueba_id, campo_id, genero, edad_min, edad_max, rango_min, rango_max, rango_texto, unidad)
      SELECT pid, cid, NULL, 0, 120, d.min_v, d.max_v, d.txt, v.unidad
      FROM (VALUES
        ('MCV', 80::numeric, 100::numeric, '80 – 100'),
        ('MCH', 27, 33, '27 – 33'),
        ('MCHC', 32, 36, '32 – 36'),
        ('RDW', 11.5, 14.5, '11.5 – 14.5'),
        ('WBC', 4500, 11000, '4500 – 11000'),
        ('NEU_PCT', 40, 70, '40 – 70'),
        ('LYM_PCT', 20, 40, '20 – 40'),
        ('MON_PCT', 2, 8, '2 – 8'),
        ('EOS_PCT', 1, 4, '1 – 4'),
        ('BAS_PCT', 0, 1, '0 – 1'),
        ('NEU_ABS', 1800, 7700, '1800 – 7700'),
        ('LYM_ABS', 1000, 4400, '1000 – 4400'),
        ('MON_ABS', 200, 880, '200 – 880'),
        ('EOS_ABS', 45, 440, '45 – 440'),
        ('BAS_ABS', 0, 110, '0 – 110'),
        ('PLT', 150000, 450000, '150000 – 450000'),
        ('MPV', 7.5, 11.5, '7.5 – 11.5'),
        ('PDW', 10, 18, '10 – 18')
      ) AS d(cod, min_v, max_v, txt)
      WHERE d.cod = v.codigo
        AND NOT EXISTS (SELECT 1 FROM lab_rangos r WHERE r.campo_id = cid AND r.genero IS NULL);
    END IF;
  END LOOP;
END $$;
