-- 066 · Portal del paciente (acceso liviano para descargar resultados de laboratorio)
-- Acceso por identidad/código + contraseña generada. No usa Supabase Auth.
-- Todo el acceso a esta tabla se hace server-side con service role; RLS queda cerrada.

CREATE TABLE IF NOT EXISTS paciente_portal (
    id               SERIAL PRIMARY KEY,
    paciente_id      INTEGER NOT NULL UNIQUE REFERENCES pacientes(id) ON DELETE CASCADE,
    usuario          VARCHAR(40) NOT NULL UNIQUE,   -- código/identidad normalizado
    password_hash    TEXT NOT NULL,
    password_salt    TEXT NOT NULL,
    activo           BOOLEAN NOT NULL DEFAULT TRUE,
    intentos         INTEGER NOT NULL DEFAULT 0,
    bloqueado_hasta  TIMESTAMPTZ,
    creado_por       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    last_login       TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paciente_portal_usuario ON paciente_portal (usuario);
CREATE INDEX IF NOT EXISTS idx_paciente_portal_paciente ON paciente_portal (paciente_id);

-- RLS: bloqueada para anon/authenticated. El portal y la generación de credenciales
-- usan el service role (server-side), que omite RLS.
ALTER TABLE paciente_portal ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE paciente_portal IS 'Credenciales livianas del portal del paciente (identidad + contraseña hash). Acceso solo server-side con service role.';
COMMENT ON COLUMN paciente_portal.usuario IS 'Identidad/código del paciente normalizado (mismo criterio que pacientes.codigo)';
