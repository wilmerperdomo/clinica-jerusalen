-- ═══════════════════════════════════════════════════════════════
--  045 — Pacientes: evitar duplicados por cédula / RTN
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_normalizar_codigo_paciente(p_valor TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT upper(regexp_replace(trim(COALESCE(p_valor, '')), '[^A-Z0-9]', '', 'gi'));
$$;

CREATE OR REPLACE FUNCTION trg_pacientes_normalizar_identidad()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.codigo := fn_normalizar_codigo_paciente(NEW.codigo);
  IF NEW.rtn_empresa IS NOT NULL AND trim(NEW.rtn_empresa) <> '' THEN
    NEW.rtn_empresa := fn_normalizar_codigo_paciente(NEW.rtn_empresa);
  ELSE
    NEW.rtn_empresa := NULL;
  END IF;
  IF NEW.codigo IS NULL OR NEW.codigo = '' THEN
    RAISE EXCEPTION 'La cédula o código del paciente es obligatorio';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pacientes_normalizar_identidad ON pacientes;
CREATE TRIGGER trg_pacientes_normalizar_identidad
  BEFORE INSERT OR UPDATE OF codigo, rtn_empresa ON pacientes
  FOR EACH ROW
  EXECUTE FUNCTION trg_pacientes_normalizar_identidad();

-- Índice único por código normalizado (detecta 0801-1234 vs 08011234)
CREATE UNIQUE INDEX IF NOT EXISTS idx_pacientes_codigo_normalizado
  ON pacientes (fn_normalizar_codigo_paciente(codigo));

-- RTN único cuando se registra aparte
CREATE UNIQUE INDEX IF NOT EXISTS idx_pacientes_rtn_normalizado
  ON pacientes (fn_normalizar_codigo_paciente(rtn_empresa))
  WHERE rtn_empresa IS NOT NULL AND trim(rtn_empresa) <> '';

CREATE OR REPLACE FUNCTION fn_paciente_codigo_duplicado(
  p_codigo TEXT,
  p_rtn TEXT DEFAULT NULL,
  p_exclude_id INTEGER DEFAULT NULL
)
RETURNS TABLE (
  id INTEGER,
  codigo VARCHAR,
  nombre VARCHAR,
  apellido1 VARCHAR,
  apellido2 VARCHAR,
  nombre_empresa VARCHAR,
  rtn_empresa VARCHAR,
  tipo VARCHAR
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.codigo,
    p.nombre,
    p.apellido1,
    p.apellido2,
    p.nombre_empresa,
    p.rtn_empresa,
    p.tipo
  FROM pacientes p
  WHERE (p_exclude_id IS NULL OR p.id <> p_exclude_id)
    AND (
      fn_normalizar_codigo_paciente(p.codigo) = fn_normalizar_codigo_paciente(p_codigo)
      OR (
        p_rtn IS NOT NULL
        AND trim(p_rtn) <> ''
        AND p.rtn_empresa IS NOT NULL
        AND trim(p.rtn_empresa) <> ''
        AND fn_normalizar_codigo_paciente(p.rtn_empresa) = fn_normalizar_codigo_paciente(p_rtn)
      )
    )
  LIMIT 1;
$$;

COMMENT ON FUNCTION fn_paciente_codigo_duplicado(TEXT, TEXT, INTEGER) IS
  'Devuelve paciente existente con misma cédula/código o RTN normalizado';

GRANT EXECUTE ON FUNCTION fn_paciente_codigo_duplicado(TEXT, TEXT, INTEGER) TO authenticated;
