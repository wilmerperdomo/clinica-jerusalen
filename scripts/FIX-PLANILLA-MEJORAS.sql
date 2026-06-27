-- Ejecutar en Supabase → SQL Editor (migrations/092_planilla_mejoras.sql)

CREATE TABLE IF NOT EXISTS planilla_sueldo_historial (
  id                    SERIAL PRIMARY KEY,
  perfil_id             UUID NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  sueldo_anterior       NUMERIC(12,2),
  sueldo_nuevo          NUMERIC(12,2),
  tipo_nomina_anterior  VARCHAR(30),
  tipo_nomina_nuevo     VARCHAR(30),
  usuario_id            UUID REFERENCES auth.users(id),
  nota                  TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_psh_perfil ON planilla_sueldo_historial(perfil_id);
CREATE INDEX IF NOT EXISTS idx_psh_fecha  ON planilla_sueldo_historial(created_at DESC);

CREATE TABLE IF NOT EXISTS planilla_liquidacion_ajustes (
  id              SERIAL PRIMARY KEY,
  liquidacion_id  INTEGER NOT NULL REFERENCES planilla_liquidaciones(id) ON DELETE CASCADE,
  tipo            VARCHAR(30) NOT NULL
                    CHECK (tipo IN ('BONO','ADELANTO','PRESTAMO','AUSENCIA','TARDANZA','DEDUCCION','MANUAL')),
  descripcion     VARCHAR(250) NOT NULL,
  monto           NUMERIC(12,2) NOT NULL,
  usuario_id      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pla_liq ON planilla_liquidacion_ajustes(liquidacion_id);

ALTER TABLE planilla_liquidaciones DROP CONSTRAINT IF EXISTS planilla_liquidaciones_estado_check;
ALTER TABLE planilla_liquidaciones ADD CONSTRAINT planilla_liquidaciones_estado_check
  CHECK (estado IN ('PENDIENTE','APROBADO','PAGADO','RETENIDO','ANULADO'));

ALTER TABLE planilla_sueldo_historial ENABLE ROW LEVEL SECURITY;
ALTER TABLE planilla_liquidacion_ajustes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_planilla_sueldo_hist" ON planilla_sueldo_historial;
CREATE POLICY "auth_planilla_sueldo_hist" ON planilla_sueldo_historial
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_planilla_liq_ajustes" ON planilla_liquidacion_ajustes;
CREATE POLICY "auth_planilla_liq_ajustes" ON planilla_liquidacion_ajustes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION fn_log_cambio_sueldo_planilla()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sueldo_fijo IS DISTINCT FROM OLD.sueldo_fijo
     OR NEW.tipo_nomina IS DISTINCT FROM OLD.tipo_nomina THEN
    INSERT INTO planilla_sueldo_historial (
      perfil_id, sueldo_anterior, sueldo_nuevo,
      tipo_nomina_anterior, tipo_nomina_nuevo, usuario_id
    ) VALUES (
      NEW.id, OLD.sueldo_fijo, NEW.sueldo_fijo,
      OLD.tipo_nomina, NEW.tipo_nomina, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_sueldo_planilla ON perfiles;
CREATE TRIGGER trg_log_sueldo_planilla
  AFTER UPDATE OF sueldo_fijo, tipo_nomina ON perfiles
  FOR EACH ROW
  EXECUTE FUNCTION fn_log_cambio_sueldo_planilla();
