-- Tipos de consulta en el catálogo de servicios (categoría "Consulta")
-- Usado por: Agenda, Consultas → Nueva Consulta

INSERT INTO servicios (nombre, tipo, precio, activo)
SELECT ct.nombre, 'Consulta', ct.valor, TRUE
FROM consulta_tipo ct
WHERE ct.activo IS NOT FALSE
  AND NOT EXISTS (
    SELECT 1 FROM servicios s
    WHERE LOWER(TRIM(s.nombre)) = LOWER(TRIM(ct.nombre))
      AND LOWER(TRIM(s.tipo)) = 'consulta'
  );

-- Respaldo si consulta_tipo aún no tiene filas
INSERT INTO servicios (nombre, tipo, precio, activo)
SELECT v.nombre, 'Consulta', v.precio, TRUE
FROM (VALUES
  ('Consulta General',       300.00),
  ('Consulta Especialista',  500.00),
  ('Consulta Pediátrica',    350.00),
  ('Control Prenatal',       400.00),
  ('Urgencia',               600.00),
  ('Revisión / Seguimiento', 200.00)
) AS v(nombre, precio)
WHERE NOT EXISTS (
  SELECT 1 FROM servicios s
  WHERE LOWER(TRIM(s.nombre)) = LOWER(TRIM(v.nombre))
    AND LOWER(TRIM(s.tipo)) = 'consulta'
);
