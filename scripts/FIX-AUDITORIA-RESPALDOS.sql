-- ═══════════════════════════════════════════════════════════════
--  063 — Auditoría general + Respaldos (solo super admin)
--   - Bitácora genérica: quién creó/modificó/borró qué y cuándo,
--     vía triggers en las tablas de negocio importantes.
--   - Registro de respaldos (metadatos) + bucket de Storage privado.
--   - Módulo 'auditoria' visible solo para el super administrador.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Bitácora general ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auditoria_general (
  id                BIGSERIAL PRIMARY KEY,
  tabla             VARCHAR(60)  NOT NULL,
  registro_id       VARCHAR(64),
  operacion         VARCHAR(10)  NOT NULL,   -- INSERT / UPDATE / DELETE
  datos_antes       JSONB,
  datos_despues     JSONB,
  campos_cambiados  TEXT[],
  usuario_id        UUID,
  usuario_email     VARCHAR(200),
  usuario_nombre    VARCHAR(200),
  fecha             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_gen_tabla   ON auditoria_general(tabla);
CREATE INDEX IF NOT EXISTS idx_audit_gen_fecha   ON auditoria_general(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_audit_gen_usuario ON auditoria_general(usuario_id);
CREATE INDEX IF NOT EXISTS idx_audit_gen_op      ON auditoria_general(operacion);

COMMENT ON TABLE auditoria_general IS 'Bitácora: quién creó/modificó/borró qué y cuándo';

-- ── 2. Función de trigger genérica ─────────────────────────────
CREATE OR REPLACE FUNCTION fn_auditoria_generica()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_email   TEXT;
  v_nombre  TEXT;
  v_reg     TEXT;
  v_antes   JSONB;
  v_despues JSONB;
  v_cambios TEXT[];
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_antes   := to_jsonb(OLD);
    v_despues := NULL;
    v_reg     := v_antes ->> 'id';
  ELSIF TG_OP = 'INSERT' THEN
    v_antes   := NULL;
    v_despues := to_jsonb(NEW);
    v_reg     := v_despues ->> 'id';
  ELSE  -- UPDATE
    v_antes   := to_jsonb(OLD);
    v_despues := to_jsonb(NEW);
    v_reg     := v_despues ->> 'id';

    SELECT array_agg(e.key) INTO v_cambios
    FROM jsonb_each(v_despues) AS e(key, value)
    WHERE (v_despues -> e.key) IS DISTINCT FROM (v_antes -> e.key)
      AND e.key NOT IN ('updated_at', 'created_at');

    -- Si solo cambiaron timestamps internos, no registrar ruido
    IF v_cambios IS NULL OR array_length(v_cambios, 1) IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    SELECT NULLIF(TRIM(COALESCE(nombre,'') || ' ' || COALESCE(apellido,'')), '')
      INTO v_nombre FROM perfiles WHERE id = v_uid;
  END IF;
  v_nombre := COALESCE(v_nombre, NULLIF(current_setting('app.usuario_nombre', TRUE), ''));

  -- La auditoría es "best-effort": nunca debe bloquear la operación de negocio.
  BEGIN
    INSERT INTO auditoria_general (
      tabla, registro_id, operacion, datos_antes, datos_despues,
      campos_cambiados, usuario_id, usuario_email, usuario_nombre
    ) VALUES (
      TG_TABLE_NAME, v_reg, TG_OP, v_antes, v_despues,
      v_cambios, v_uid, v_email, v_nombre
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- ── 3. Adjuntar el trigger a las tablas importantes ────────────
CREATE OR REPLACE FUNCTION fn_attach_auditoria(p_tabla TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass('public.' || p_tabla) IS NULL THEN RETURN; END IF;
  EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria ON public.%I', p_tabla);
  EXECUTE format(
    'CREATE TRIGGER trg_auditoria AFTER INSERT OR UPDATE OR DELETE ON public.%I '
    || 'FOR EACH ROW EXECUTE FUNCTION fn_auditoria_generica()', p_tabla);
END;
$$;

SELECT fn_attach_auditoria(t) FROM (VALUES
  ('pacientes'), ('facturas'), ('devoluciones'), ('autorizaciones'),
  ('consultas'), ('consulta_detalle'),
  ('productos'), ('inventario'),
  ('caja_movimientos'), ('caja_sesiones'),
  ('cotizaciones'), ('membresias'),
  ('compras'), ('cxc'),
  ('perfiles'), ('roles'), ('rol_permisos'),
  ('paciente_puntos_movimientos')
) AS x(t);

-- ── 4. Registro de respaldos ───────────────────────────────────
CREATE TABLE IF NOT EXISTS respaldos (
  id                  SERIAL PRIMARY KEY,
  archivo             TEXT NOT NULL,
  bucket              VARCHAR(60) NOT NULL DEFAULT 'respaldos',
  tipo                VARCHAR(12) NOT NULL DEFAULT 'MANUAL'
                        CHECK (tipo IN ('MANUAL', 'AUTOMATICO')),
  tablas              INTEGER,
  registros           INTEGER,
  tamano_bytes        BIGINT,
  generado_por        UUID,
  generado_por_nombre VARCHAR(200),
  nota                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_respaldos_fecha ON respaldos(created_at DESC);

-- ── 5. Bucket privado de Storage para respaldos ────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('respaldos', 'respaldos', FALSE)
ON CONFLICT (id) DO NOTHING;

-- ── 6. RLS: solo super admin lee la bitácora y los respaldos ───
ALTER TABLE auditoria_general ENABLE ROW LEVEL SECURITY;
ALTER TABLE respaldos         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_gen_super_select" ON auditoria_general;
DROP POLICY IF EXISTS "audit_gen_insert"       ON auditoria_general;
DROP POLICY IF EXISTS "respaldos_super_all"    ON respaldos;

-- Lectura solo super admin
CREATE POLICY "audit_gen_super_select" ON auditoria_general
  FOR SELECT TO authenticated USING (fn_usuario_es_super_admin());
-- Inserción permitida (los triggers corren como SECURITY DEFINER, pero
-- dejamos la política para no bloquear escrituras de la app)
CREATE POLICY "audit_gen_insert" ON auditoria_general
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "respaldos_super_all" ON respaldos
  FOR ALL TO authenticated
  USING (fn_usuario_es_super_admin()) WITH CHECK (fn_usuario_es_super_admin());

-- ── 7. Módulo 'auditoria' — solo super admin ───────────────────
INSERT INTO modulos (clave, nombre, icono, orden, activo)
VALUES ('auditoria', 'Auditoría y Respaldos', 'ShieldCheck', 100, TRUE)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO permisos (modulo_id, accion, descripcion)
SELECT m.id, a.accion, m.nombre || ' — ' || a.accion
FROM modulos m
CROSS JOIN (VALUES ('ver'), ('exportar')) AS a(accion)
WHERE m.clave = 'auditoria'
ON CONFLICT (modulo_id, accion) DO NOTHING;

-- Conceder solo al rol Super Administrador (no a admins normales)
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON TRUE
JOIN modulos m ON m.id = p.modulo_id
WHERE m.clave = 'auditoria'
  AND COALESCE(r.es_super_admin, FALSE) = TRUE
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
