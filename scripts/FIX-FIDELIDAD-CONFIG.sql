-- Ejecutar en Supabase → SQL Editor (copia de migrations/091_fidelidad_config.sql)

CREATE TABLE IF NOT EXISTS fidelidad_config (
  id                      INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  lempiras_por_punto      NUMERIC(10,2) NOT NULL DEFAULT 26,
  valor_lempira_por_punto NUMERIC(10,2) NOT NULL DEFAULT 1,
  porcentaje_max_canje    NUMERIC(5,2)  NOT NULL DEFAULT 25,
  monto_minimo_cobro      NUMERIC(10,2) NOT NULL DEFAULT 1,
  activo                  BOOLEAN       NOT NULL DEFAULT TRUE,
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_by              UUID REFERENCES auth.users(id)
);

INSERT INTO fidelidad_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE fidelidad_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fidelidad_config_select" ON fidelidad_config;
DROP POLICY IF EXISTS "fidelidad_config_update" ON fidelidad_config;

CREATE POLICY "fidelidad_config_select"
  ON fidelidad_config FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "fidelidad_config_update"
  ON fidelidad_config FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- (incluye fn_acumular_puntos_factura actualizada — ver migration completa)
