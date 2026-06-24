-- ═══════════════════════════════════════════════════════════════
-- 072_modulo_promociones.sql
-- Promociones y campañas de publicidad a pacientes
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS promociones (
    id              SERIAL PRIMARY KEY,
    titulo          VARCHAR(200) NOT NULL,
    subtitulo       VARCHAR(300),
    descripcion     TEXT,
    imagen_url      TEXT,
    tipo_contenido  VARCHAR(20) NOT NULL DEFAULT 'mixto'
        CHECK (tipo_contenido IN ('texto', 'imagen', 'mixto')),
    vigencia_desde  DATE,
    vigencia_hasta  DATE,
    activa          BOOLEAN NOT NULL DEFAULT TRUE,
    sucursal_id     INTEGER REFERENCES sucursales(id) ON DELETE SET NULL,
    creado_por      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promocion_campanas (
    id                  SERIAL PRIMARY KEY,
    promocion_id        INTEGER NOT NULL REFERENCES promociones(id) ON DELETE CASCADE,
    nombre              VARCHAR(200) NOT NULL,
    canal               VARCHAR(20) NOT NULL DEFAULT 'whatsapp'
        CHECK (canal IN ('whatsapp', 'email', 'ambos')),
    modo_envio          VARCHAR(20) NOT NULL DEFAULT 'asistido'
        CHECK (modo_envio IN ('inmediato', 'programado', 'asistido', 'automatico')),
    programado_para     TIMESTAMPTZ,
    estado              VARCHAR(20) NOT NULL DEFAULT 'borrador'
        CHECK (estado IN ('borrador', 'programada', 'lista_envio', 'en_proceso', 'completada', 'cancelada')),
    filtro_audiencia    JSONB NOT NULL DEFAULT '{"tipo":"whatsapp"}',
    mensaje_personalizado TEXT,
    total_destinatarios INTEGER NOT NULL DEFAULT 0,
    total_enviados      INTEGER NOT NULL DEFAULT 0,
    total_omitidos      INTEGER NOT NULL DEFAULT 0,
    total_fallidos      INTEGER NOT NULL DEFAULT 0,
    sucursal_id         INTEGER REFERENCES sucursales(id) ON DELETE SET NULL,
    iniciada_at         TIMESTAMPTZ,
    completada_at       TIMESTAMPTZ,
    creado_por          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promocion_envios (
    id              SERIAL PRIMARY KEY,
    campana_id      INTEGER NOT NULL REFERENCES promocion_campanas(id) ON DELETE CASCADE,
    paciente_id     INTEGER NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    canal           VARCHAR(20) NOT NULL CHECK (canal IN ('whatsapp', 'email')),
    estado          VARCHAR(20) NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'enviado', 'sin_contacto', 'omitido', 'fallido')),
    enviado_at      TIMESTAMPTZ,
    proveedor       VARCHAR(30),
    proveedor_id    TEXT,
    error           TEXT,
    nota            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (campana_id, paciente_id, canal)
);

CREATE INDEX IF NOT EXISTS idx_promociones_activa ON promociones(activa, vigencia_hasta);
CREATE INDEX IF NOT EXISTS idx_promociones_sucursal ON promociones(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_campanas_estado ON promocion_campanas(estado, programado_para);
CREATE INDEX IF NOT EXISTS idx_campanas_promocion ON promocion_campanas(promocion_id);
CREATE INDEX IF NOT EXISTS idx_envios_campana ON promocion_envios(campana_id, estado);

DROP TRIGGER IF EXISTS trg_promociones_upd ON promociones;
CREATE TRIGGER trg_promociones_upd
    BEFORE UPDATE ON promociones FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_campanas_upd ON promocion_campanas;
CREATE TRIGGER trg_campanas_upd
    BEFORE UPDATE ON promocion_campanas FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE promociones ENABLE ROW LEVEL SECURITY;
ALTER TABLE promocion_campanas ENABLE ROW LEVEL SECURITY;
ALTER TABLE promocion_envios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_promociones ON promociones;
CREATE POLICY auth_promociones ON promociones
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_promocion_campanas ON promocion_campanas;
CREATE POLICY auth_promocion_campanas ON promocion_campanas
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_promocion_envios ON promocion_envios;
CREATE POLICY auth_promocion_envios ON promocion_envios
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Bucket público para imágenes de promociones (enlaces en WhatsApp)
INSERT INTO storage.buckets (id, name, public)
VALUES ('promociones', 'promociones', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS auth_upload_promociones ON storage.objects;
DROP POLICY IF EXISTS auth_read_promociones ON storage.objects;
DROP POLICY IF EXISTS auth_delete_promociones ON storage.objects;

CREATE POLICY auth_upload_promociones ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'promociones');

CREATE POLICY auth_read_promociones ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'promociones');

CREATE POLICY auth_delete_promociones ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'promociones');

-- Módulo y permisos (solo Administrador por defecto)
INSERT INTO modulos (clave, nombre, icono, orden, activo)
VALUES ('promociones', 'Promociones', 'Megaphone', 25, true)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO permisos (modulo_id, accion)
SELECT m.id, a.accion
FROM modulos m
CROSS JOIN (VALUES ('ver'), ('crear'), ('editar'), ('eliminar')) AS a(accion)
WHERE m.clave = 'promociones'
  AND NOT EXISTS (
    SELECT 1 FROM permisos p2
    WHERE p2.modulo_id = m.id AND p2.accion = a.accion
  );

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON p.modulo_id = (SELECT id FROM modulos WHERE clave = 'promociones')
WHERE r.nombre = 'Administrador'
ON CONFLICT DO NOTHING;

COMMENT ON TABLE promociones IS 'Catálogo de promociones (texto e imagen) para campañas a pacientes';
COMMENT ON TABLE promocion_campanas IS 'Campañas de envío programado o asistido por WhatsApp/correo';
COMMENT ON TABLE promocion_envios IS 'Registro por paciente y canal de cada campaña';
