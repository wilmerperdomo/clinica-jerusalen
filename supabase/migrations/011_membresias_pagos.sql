-- ════════════════════════════════════════════════════════════════
--  MEMBRESÍAS — CODIFICACIÓN AUTO + CALENDARIO DE PAGOS
-- ════════════════════════════════════════════════════════════════

-- ── 1. Secuencia global para carnets ─────────────────────────────
CREATE SEQUENCE IF NOT EXISTS membresia_carnet_seq
  START 1 INCREMENT 1 MINVALUE 1 NO MAXVALUE CACHE 1;

-- ── 2. Función: genera código MEM-YYYY-NNNNNN ────────────────────
CREATE OR REPLACE FUNCTION fn_generar_numero_carnet()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  num  BIGINT;
  anio TEXT;
BEGIN
  num  := nextval('membresia_carnet_seq');
  anio := TO_CHAR(NOW() AT TIME ZONE 'America/Tegucigalpa', 'YYYY');
  RETURN 'MEM-' || anio || '-' || LPAD(num::text, 6, '0');
END;
$$;

-- ── 3. Trigger: asigna carnet antes de insertar ──────────────────
CREATE OR REPLACE FUNCTION trg_fn_asignar_carnet()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.numero_carnet IS NULL OR TRIM(NEW.numero_carnet) = '' THEN
    NEW.numero_carnet := fn_generar_numero_carnet();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_asignar_carnet ON membresias;
CREATE TRIGGER trg_asignar_carnet
  BEFORE INSERT ON membresias
  FOR EACH ROW EXECUTE FUNCTION trg_fn_asignar_carnet();

-- ── 4. Actualizar membresías existentes sin carnet ───────────────
UPDATE membresias
SET numero_carnet = fn_generar_numero_carnet()
WHERE numero_carnet IS NULL OR TRIM(numero_carnet) = '';

-- ── 5. Tabla de pagos / cuotas ────────────────────────────────────
CREATE TABLE IF NOT EXISTS membresia_pagos (
  id                SERIAL PRIMARY KEY,
  membresia_id      INTEGER      NOT NULL REFERENCES membresias(id) ON DELETE CASCADE,
  numero_cuota      SMALLINT     NOT NULL DEFAULT 1,
  fecha_vencimiento DATE         NOT NULL,
  monto             NUMERIC(12,2) NOT NULL,
  fecha_pago        DATE,
  estado            VARCHAR(20)  NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente','pagado','vencido')),
  forma_pago        VARCHAR(30),
  cajero_nombre     VARCHAR(120),
  notas             TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagos_membresia    ON membresia_pagos(membresia_id);
CREATE INDEX IF NOT EXISTS idx_pagos_vencimiento  ON membresia_pagos(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_pagos_estado       ON membresia_pagos(estado);

-- ── 6. Función: calcula cuántas cuotas según duración ────────────
CREATE OR REPLACE FUNCTION fn_num_cuotas(p_dias INTEGER)
RETURNS INTEGER LANGUAGE plpgsql AS $$
BEGIN
  IF    p_dias <= 31  THEN RETURN 1;
  ELSIF p_dias <= 62  THEN RETURN 2;
  ELSIF p_dias <= 93  THEN RETURN 3;
  ELSIF p_dias <= 186 THEN RETURN 6;
  ELSE                     RETURN 12;
  END IF;
END;
$$;

-- ── 7. Trigger: genera calendario de cuotas al crear membresía ───
CREATE OR REPLACE FUNCTION trg_fn_generar_cuotas()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tipo       RECORD;
  v_num_cuotas INTEGER;
  v_monto      NUMERIC(12,2);
  v_resto      NUMERIC(12,2);
  i            INTEGER;
BEGIN
  SELECT duracion_dias, precio INTO v_tipo
  FROM membresia_tipos WHERE id = NEW.tipo_id;

  IF NOT FOUND THEN RETURN NEW; END IF;

  v_num_cuotas := fn_num_cuotas(v_tipo.duracion_dias);
  v_monto      := ROUND(v_tipo.precio / v_num_cuotas, 2);
  -- el último pago absorbe diferencia de centavos
  v_resto      := v_tipo.precio - (v_monto * (v_num_cuotas - 1));

  FOR i IN 1..v_num_cuotas LOOP
    INSERT INTO membresia_pagos (
      membresia_id, numero_cuota, fecha_vencimiento, monto, estado
    ) VALUES (
      NEW.id,
      i,
      NEW.fecha_inicio + ((i - 1) * INTERVAL '1 month'),
      CASE WHEN i = v_num_cuotas THEN v_resto ELSE v_monto END,
      CASE WHEN i <= NEW.cuotas_pagadas THEN 'pagado' ELSE 'pendiente' END
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generar_cuotas ON membresias;
CREATE TRIGGER trg_generar_cuotas
  AFTER INSERT ON membresias
  FOR EACH ROW EXECUTE FUNCTION trg_fn_generar_cuotas();

-- ── 8. Función: marca cuotas vencidas automáticamente ────────────
--  Ejecutar diariamente con pg_cron o desde la app al cargar
CREATE OR REPLACE FUNCTION fn_actualizar_cuotas_vencidas()
RETURNS INTEGER LANGUAGE plpgsql AS $$
DECLARE v_count INTEGER;
BEGIN
  UPDATE membresia_pagos
  SET estado = 'vencido'
  WHERE estado = 'pendiente'
    AND fecha_vencimiento < CURRENT_DATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Ejecutar ahora para las membresías existentes
SELECT fn_actualizar_cuotas_vencidas();

-- ── 9. Vista: resumen de cobros ──────────────────────────────────
CREATE OR REPLACE VIEW v_cobros_membresias AS
SELECT
  mp.id,
  mp.membresia_id,
  mp.numero_cuota,
  mp.fecha_vencimiento,
  mp.monto,
  mp.estado,
  mp.fecha_pago,
  mp.forma_pago,
  mp.cajero_nombre,
  mp.notas,
  m.numero_carnet,
  m.tipo_id,
  m.paciente_id,
  m.sucursal_id,
  mt.nombre   AS tipo_nombre,
  mt.duracion_dias,
  fn_num_cuotas(mt.duracion_dias) AS total_cuotas,
  p.nombre    AS pac_nombre,
  p.apellido1 AS pac_apellido1,
  p.telefono  AS pac_telefono,
  p.foto_url  AS pac_foto_url
FROM membresia_pagos mp
JOIN membresias      m  ON mp.membresia_id = m.id
JOIN membresia_tipos mt ON m.tipo_id       = mt.id
JOIN pacientes       p  ON m.paciente_id   = p.id;

-- ── 10. RLS ──────────────────────────────────────────────────────
ALTER TABLE membresia_pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_membresia_pagos" ON membresia_pagos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
