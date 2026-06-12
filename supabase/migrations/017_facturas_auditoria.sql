-- ════════════════════════════════════════════════════════════════
--  AUDITORÍA DE FACTURAS + SUPER ADMIN
-- ════════════════════════════════════════════════════════════════

-- 1. Marcar qué roles son "super admin" (con más privilegios que admin normal)
ALTER TABLE roles ADD COLUMN IF NOT EXISTS es_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Marcar el primer rol admin como super admin (ajusta el nombre si es distinto)
-- Puedes cambiar esto manualmente desde Configuración → Roles
UPDATE roles SET es_super_admin = TRUE
WHERE id = (SELECT id FROM roles WHERE es_admin = TRUE ORDER BY id LIMIT 1);

-- 2. Tabla de auditoría de facturas
CREATE TABLE IF NOT EXISTS facturas_auditoria (
  id             SERIAL       PRIMARY KEY,
  factura_id     INTEGER      NOT NULL,           -- ID de la factura afectada
  numero         VARCHAR(50),                     -- número de la factura (por si se elimina)
  accion         VARCHAR(30)  NOT NULL,           -- 'ANULADA' | 'ELIMINADA' | 'EDITADA'
  motivo         TEXT         NOT NULL,           -- razón obligatoria
  datos_antes    JSONB,                           -- snapshot completo de la factura
  usuario_id     UUID         NOT NULL REFERENCES auth.users(id),
  usuario_nombre VARCHAR(200),
  ip_address     INET,
  fecha          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fact_aud_factura ON facturas_auditoria(factura_id);
CREATE INDEX IF NOT EXISTS idx_fact_aud_fecha   ON facturas_auditoria(fecha DESC);

-- 3. Trigger: registrar automáticamente cuando se cambia estado a 'anulada'
CREATE OR REPLACE FUNCTION fn_auditoria_factura_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Solo auditar si el estado cambió (ej. de 'emitida' a 'anulada')
  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO facturas_auditoria (
      factura_id, numero, accion, motivo, datos_antes, usuario_id, usuario_nombre
    ) VALUES (
      OLD.id,
      OLD.numero,
      UPPER(NEW.estado),                            -- 'ANULADA'
      COALESCE(NEW.motivo_anulacion, 'Sin motivo'),
      to_jsonb(OLD),                                -- snapshot completo antes del cambio
      auth.uid(),
      current_setting('app.usuario_nombre', TRUE)   -- nombre pasado desde el cliente
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auditoria_factura_update ON facturas;
CREATE TRIGGER trg_auditoria_factura_update
  AFTER UPDATE ON facturas
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_factura_update();

-- 4. Trigger: registrar antes de eliminar una factura
CREATE OR REPLACE FUNCTION fn_auditoria_factura_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO facturas_auditoria (
    factura_id, numero, accion, motivo, datos_antes, usuario_id, usuario_nombre
  ) VALUES (
    OLD.id,
    OLD.numero,
    'ELIMINADA',
    COALESCE(current_setting('app.motivo_eliminacion', TRUE), 'Sin motivo registrado'),
    to_jsonb(OLD),
    auth.uid(),
    current_setting('app.usuario_nombre', TRUE)
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_auditoria_factura_delete ON facturas;
CREATE TRIGGER trg_auditoria_factura_delete
  BEFORE DELETE ON facturas
  FOR EACH ROW EXECUTE FUNCTION fn_auditoria_factura_delete();

-- 5. Vista amigable del historial
CREATE OR REPLACE VIEW v_facturas_auditoria AS
SELECT
  fa.id,
  fa.factura_id,
  fa.numero,
  fa.accion,
  fa.motivo,
  fa.usuario_nombre,
  fa.fecha,
  fa.datos_antes->>'cliente_nombre' AS cliente,
  fa.datos_antes->>'total'          AS total_original,
  fa.datos_antes->>'estado'         AS estado_anterior
FROM facturas_auditoria fa
ORDER BY fa.fecha DESC;

-- 6. RLS
ALTER TABLE facturas_auditoria ENABLE ROW LEVEL SECURITY;

-- Solo super admins pueden ver la auditoría
DROP POLICY IF EXISTS "superadmin_lee_auditoria" ON facturas_auditoria;
CREATE POLICY "superadmin_lee_auditoria"
  ON facturas_auditoria FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM perfiles p
      JOIN perfil_roles pr ON pr.perfil_id = p.id
      JOIN roles r          ON r.id = pr.rol_id
      WHERE p.id = auth.uid() AND r.es_super_admin = TRUE
    )
    OR
    EXISTS (
      SELECT 1 FROM perfiles p
      JOIN roles r ON r.id = p.rol_id
      WHERE p.id = auth.uid() AND r.es_super_admin = TRUE
    )
  );

-- El sistema (triggers) puede insertar registros de auditoría
DROP POLICY IF EXISTS "sistema_inserta_auditoria" ON facturas_auditoria;
CREATE POLICY "sistema_inserta_auditoria"
  ON facturas_auditoria FOR INSERT TO authenticated
  WITH CHECK (true);
