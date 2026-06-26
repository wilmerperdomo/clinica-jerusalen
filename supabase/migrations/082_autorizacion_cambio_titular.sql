-- 082_autorizacion_cambio_titular.sql
-- Códigos de autorización para cambiar el nombre a facturar en caja
-- (obliga a registrar al cliente; cambio solo con código del super admin).

ALTER TABLE autorizaciones DROP CONSTRAINT IF EXISTS autorizaciones_proposito_check;
ALTER TABLE autorizaciones ADD CONSTRAINT autorizaciones_proposito_check
  CHECK (proposito IN ('DEVOLUCION', 'ANULACION', 'CAMBIO_TITULAR'));

COMMENT ON COLUMN autorizaciones.proposito IS
  'DEVOLUCION/ANULACION: factura emitida. CAMBIO_TITULAR: desbloquear nombre en caja.';

-- Generar código para caja (sin factura previa)
CREATE OR REPLACE FUNCTION fn_generar_autorizacion_caja(
  p_proposito   TEXT DEFAULT 'CAMBIO_TITULAR',
  p_sucursal_id INTEGER DEFAULT NULL,
  p_minutos     INTEGER DEFAULT 60
)
RETURNS TABLE(codigo TEXT, expira_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_codigo   TEXT;
  v_nombre   TEXT;
  v_intentos INTEGER := 0;
  v_prop     TEXT;
BEGIN
  IF NOT fn_usuario_es_super_admin() THEN
    RAISE EXCEPTION 'Solo el super administrador puede generar códigos de autorización';
  END IF;

  v_prop := UPPER(TRIM(COALESCE(p_proposito, 'CAMBIO_TITULAR')));
  IF v_prop NOT IN ('CAMBIO_TITULAR') THEN
    RAISE EXCEPTION 'Propósito no válido para autorización de caja';
  END IF;

  LOOP
    v_codigo := LPAD((FLOOR(RANDOM() * 1000000))::INTEGER::TEXT, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM autorizaciones a WHERE a.codigo = v_codigo AND a.estado = 'ACTIVO'
    );
    v_intentos := v_intentos + 1;
    IF v_intentos > 20 THEN RAISE EXCEPTION 'No se pudo generar un código único'; END IF;
  END LOOP;

  SELECT TRIM(COALESCE(nombre,'') || ' ' || COALESCE(apellido,'')) INTO v_nombre
  FROM perfiles WHERE id = auth.uid();

  INSERT INTO autorizaciones (
    codigo, proposito, factura_id, sucursal_id, monto_max,
    estado, expira_at, generado_por, generado_por_nombre,
    nota
  ) VALUES (
    v_codigo, v_prop, NULL, p_sucursal_id, NULL,
    'ACTIVO', NOW() + (p_minutos || ' minutes')::INTERVAL, auth.uid(), v_nombre,
    'Cambio de titular en factura fiscal — caja'
  );

  RETURN QUERY SELECT v_codigo, NOW() + (p_minutos || ' minutes')::INTERVAL;
END;
$$;

-- Validar y consumir código (desbloquea edición del nombre en caja)
CREATE OR REPLACE FUNCTION fn_validar_autorizacion_caja(
  p_codigo    TEXT,
  p_proposito TEXT DEFAULT 'CAMBIO_TITULAR'
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_auth autorizaciones%ROWTYPE;
  v_prop TEXT;
BEGIN
  IF p_codigo IS NULL OR LENGTH(TRIM(p_codigo)) < 6 THEN
    RAISE EXCEPTION 'Ingrese el código de autorización de 6 dígitos';
  END IF;

  v_prop := UPPER(TRIM(COALESCE(p_proposito, 'CAMBIO_TITULAR')));

  SELECT * INTO v_auth FROM autorizaciones
  WHERE codigo = TRIM(p_codigo)
    AND proposito = v_prop
    AND estado = 'ACTIVO'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Código inválido o ya utilizado';
  END IF;

  IF v_auth.expira_at IS NOT NULL AND v_auth.expira_at < NOW() THEN
    UPDATE autorizaciones SET estado = 'EXPIRADO' WHERE id = v_auth.id;
    RAISE EXCEPTION 'El código de autorización expiró. Solicite uno nuevo al administrador.';
  END IF;

  UPDATE autorizaciones
  SET estado = 'USADO', usado_por = auth.uid(), usado_en = NOW()
  WHERE id = v_auth.id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION fn_generar_autorizacion_caja(TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_validar_autorizacion_caja(TEXT, TEXT) TO authenticated;
