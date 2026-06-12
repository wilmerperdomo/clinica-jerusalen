-- ============================================================
--  CLÍNICA JERUSALÉN v2.0 — Esquema Base
--  RBAC moderno + Supabase Auth + Sucursales
--  Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- ---- SUCURSALES ----
CREATE TABLE IF NOT EXISTS sucursales (
    id                      SERIAL PRIMARY KEY,
    nombre                  VARCHAR(150) NOT NULL,
    nombre_corto            VARCHAR(60)  DEFAULT '',
    lema                    VARCHAR(200) DEFAULT '',  -- encabezado en facturas
    ciudad                  VARCHAR(100) DEFAULT 'Tegucigalpa',
    direccion               TEXT,
    telefono                VARCHAR(30),
    email                   VARCHAR(100),
    -- Datos fiscales Honduras SAR
    rtn                     VARCHAR(20),
    cai                     VARCHAR(100),             -- Código Autorización Impresión
    fecha_limite            DATE,                     -- Fecha límite emisión CAI
    num_min                 VARCHAR(30) DEFAULT '',   -- Rango inicial SAR: 001-001-01-00064901
    num_max                 VARCHAR(30) DEFAULT '',   -- Rango final  SAR: 001-001-01-00069900
    numero_inicial          INTEGER DEFAULT 1,        -- Correlativo inicial de facturación
    -- Descuentos por edad
    tercera_edad            INTEGER DEFAULT 60,       -- Edad mínima 3ra edad
    cuarta_edad             INTEGER DEFAULT 80,       -- Edad mínima 4ta edad
    por_descuento_tercera   NUMERIC(5,2) DEFAULT 0,
    por_descuento_cuarta    NUMERIC(5,2) DEFAULT 0,
    -- Configuración de recibo/ticket
    tama                    VARCHAR(10) DEFAULT '340', -- ancho ticket px
    letra                   VARCHAR(10) DEFAULT '12',  -- fuente ticket px
    activo                  BOOLEAN DEFAULT TRUE,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ---- RBAC: MÓDULOS ----
CREATE TABLE IF NOT EXISTS modulos (
    id      SERIAL PRIMARY KEY,
    clave   VARCHAR(50) UNIQUE NOT NULL,
    nombre  VARCHAR(100) NOT NULL,
    icono   VARCHAR(50),
    orden   INTEGER DEFAULT 0,
    activo  BOOLEAN DEFAULT TRUE
);

-- ---- RBAC: ROLES ----
CREATE TABLE IF NOT EXISTS roles (
    id          SERIAL PRIMARY KEY,
    nombre      VARCHAR(50) UNIQUE NOT NULL,
    descripcion TEXT,
    es_admin    BOOLEAN DEFAULT FALSE,
    color       VARCHAR(7) DEFAULT '#6B7280',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ---- RBAC: PERMISOS (módulo + acción) ----
CREATE TABLE IF NOT EXISTS permisos (
    id          SERIAL PRIMARY KEY,
    modulo_id   INTEGER REFERENCES modulos(id) ON DELETE CASCADE,
    accion      VARCHAR(30) NOT NULL,   -- ver, crear, editar, eliminar, imprimir, exportar
    descripcion TEXT,
    UNIQUE(modulo_id, accion)
);

-- ---- RBAC: PERMISOS POR ROL ----
CREATE TABLE IF NOT EXISTS rol_permisos (
    rol_id      INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    permiso_id  INTEGER REFERENCES permisos(id) ON DELETE CASCADE,
    PRIMARY KEY (rol_id, permiso_id)
);

-- ---- PERFILES (extiende Supabase auth.users) ----
CREATE TABLE IF NOT EXISTS perfiles (
    id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    nombre      VARCHAR(100),
    apellido    VARCHAR(100),
    cedula      VARCHAR(20),
    telefono    VARCHAR(20),
    avatar_url  TEXT,
    sucursal_id INTEGER REFERENCES sucursales(id) ON DELETE SET NULL,
    rol_id      INTEGER REFERENCES roles(id) ON DELETE SET NULL,
    activo      BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ---- ÍNDICES ----
CREATE INDEX IF NOT EXISTS idx_perfiles_sucursal ON perfiles(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_perfiles_rol      ON perfiles(rol_id);
CREATE INDEX IF NOT EXISTS idx_permisos_modulo   ON permisos(modulo_id);

-- ============================================================
--  DATOS INICIALES
-- ============================================================

-- Sucursal principal
INSERT INTO sucursales (nombre, ciudad, direccion, telefono)
VALUES ('Sucursal Central', 'Tegucigalpa', 'Colonia Palmira, Blvd. Morazán', '')
ON CONFLICT DO NOTHING;

-- Módulos del sistema (los 9 del mapa funcional)
INSERT INTO modulos (clave, nombre, icono, orden) VALUES
    ('dashboard',     'Dashboard',          'LayoutDashboard', 0),
    ('consultas',     'Consultas Médicas',  'Stethoscope',     1),
    ('pacientes',     'Pacientes',          'Users',           2),
    ('laboratorio',   'Laboratorio',        'FlaskConical',    3),
    ('inventario',    'Inventario',         'Package',         4),
    ('productos',     'Productos',          'Pill',            5),
    ('compras',       'Compras',            'ShoppingCart',    6),
    ('ventas',        'Ventas',             'Receipt',         7),
    ('membresias',    'Membresías',         'CreditCard',      8),
    ('reportes',      'Reportes',           'BarChart3',       9),
    ('configuracion', 'Configuración',      'Settings',        10)
ON CONFLICT (clave) DO NOTHING;

-- Roles base
INSERT INTO roles (nombre, descripcion, es_admin, color) VALUES
    ('Administrador', 'Acceso total al sistema',               TRUE,  '#2563EB'),
    ('Médico',        'Consultas, pacientes y laboratorio',    FALSE, '#7C3AED'),
    ('Enfermera',     'Consultas y signos vitales',            FALSE, '#059669'),
    ('Cajero',        'Ventas, cobros y caja',                 FALSE, '#D97706'),
    ('Farmacéutico',  'Inventario y productos',                FALSE, '#DC2626')
ON CONFLICT (nombre) DO NOTHING;

-- Permisos para cada módulo
INSERT INTO permisos (modulo_id, accion, descripcion)
SELECT m.id,
       a.accion,
       m.nombre || ' — ' || a.accion
FROM   modulos m
CROSS JOIN (
    VALUES
        ('ver'),
        ('crear'),
        ('editar'),
        ('eliminar'),
        ('imprimir'),
        ('exportar')
) AS a(accion)
ON CONFLICT (modulo_id, accion) DO NOTHING;

-- Administrador tiene TODOS los permisos
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM   roles r, permisos p
WHERE  r.nombre = 'Administrador'
ON CONFLICT DO NOTHING;

-- Médico: ver/crear/editar en módulos clínicos
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permisos p ON true
JOIN   modulos m ON m.id = p.modulo_id
WHERE  r.nombre = 'Médico'
AND    m.clave IN ('dashboard', 'consultas', 'pacientes', 'laboratorio')
AND    p.accion IN ('ver', 'crear', 'editar', 'imprimir')
ON CONFLICT DO NOTHING;

-- Cajero: ventas, cobros, reportes
INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM   roles r
JOIN   permisos p ON true
JOIN   modulos m ON m.id = p.modulo_id
WHERE  r.nombre = 'Cajero'
AND    m.clave IN ('dashboard', 'ventas', 'pacientes', 'reportes')
AND    p.accion IN ('ver', 'crear', 'imprimir')
ON CONFLICT DO NOTHING;

-- ============================================================
--  ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE sucursales    ENABLE ROW LEVEL SECURITY;
ALTER TABLE modulos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE permisos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE rol_permisos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE perfiles      ENABLE ROW LEVEL SECURITY;

-- Usuarios autenticados ven catálogos
CREATE POLICY "auth_lee_sucursales"   ON sucursales   FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_lee_modulos"      ON modulos      FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_lee_roles"        ON roles        FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_lee_permisos"     ON permisos     FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_lee_rol_permisos" ON rol_permisos FOR SELECT TO authenticated USING (true);

-- Perfil propio
CREATE POLICY "perfil_propio_ver"    ON perfiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "perfil_propio_editar" ON perfiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "perfil_insertar"      ON perfiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Admin gestiona todo en sucursales, roles y perfiles
CREATE POLICY "admin_gestiona_sucursales" ON sucursales FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM perfiles p JOIN roles r ON r.id = p.rol_id
        WHERE p.id = auth.uid() AND r.es_admin = TRUE
    ));

CREATE POLICY "admin_gestiona_perfiles" ON perfiles FOR ALL TO authenticated
    USING (EXISTS (
        SELECT 1 FROM perfiles p JOIN roles r ON r.id = p.rol_id
        WHERE p.id = auth.uid() AND r.es_admin = TRUE
    ));

-- ============================================================
--  FUNCIÓN: crear perfil automáticamente al registrarse
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.perfiles (id, nombre, apellido, sucursal_id, rol_id)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'nombre',   split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'apellido', ''),
        1,   -- sucursal por defecto
        (SELECT id FROM roles WHERE nombre = 'Cajero' LIMIT 1)
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
--  VISTA: permisos del usuario actual
-- ============================================================

CREATE OR REPLACE VIEW mis_permisos AS
SELECT
    m.clave   AS modulo,
    p.accion
FROM   perfiles pf
JOIN   roles r         ON r.id = pf.rol_id
JOIN   rol_permisos rp ON rp.rol_id = r.id
JOIN   permisos p      ON p.id = rp.permiso_id
JOIN   modulos m       ON m.id = p.modulo_id
WHERE  pf.id = auth.uid()
AND    m.activo = TRUE;
