-- ============================================================
--  Datos fiscales Clínica Médica Jerusalén (ticket térmico)
--  Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- Sucursal principal (La Peña) — emite facturas con CAI compartido
UPDATE sucursales SET
  nombre              = 'Col. La Peña',
  nombre_corto        = 'La Peña',
  direccion           = 'Col. La Peña calle principal contiguo a Pollo Master casa 224',
  telefono            = '2246-3051',
  rtn                 = '06111987001162',
  cai                 = '48BFE5-3E70C9-174CE0-63BE03-09097A-2B',
  fecha_limite        = '2027-01-19',
  num_min             = '001-001-01-00064901',
  num_max             = '001-001-01-00069900',
  numero_inicial      = 64901,
  lema                = 'Atención médica a tu alcance',
  activo              = TRUE
WHERE id = (SELECT id FROM sucursales ORDER BY id LIMIT 1);

-- Casa Matriz
INSERT INTO sucursales (nombre, nombre_corto, ciudad, direccion, telefono, rtn, activo)
SELECT
  'Casa Matriz', 'Matriz', 'Tegucigalpa',
  'Barrio Caserío Suyapa, casa no.: n/a', '9522-7208',
  '06111987001162', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM sucursales
  WHERE nombre ILIKE '%matriz%' OR direccion ILIKE '%suyapa%'
);

-- Sucursal El Tizatillo
INSERT INTO sucursales (nombre, nombre_corto, ciudad, direccion, telefono, rtn, activo)
SELECT
  'El Tizatillo', 'Tizatillo', 'Tegucigalpa',
  'Calle principal carretera al sur km 7', '9522-7208',
  '06111987001162', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM sucursales WHERE nombre ILIKE '%tizatillo%'
);
