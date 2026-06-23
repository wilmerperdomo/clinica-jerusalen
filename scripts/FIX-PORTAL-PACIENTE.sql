-- Ejecutar en Supabase → SQL Editor para habilitar el portal del paciente.

CREATE TABLE IF NOT EXISTS paciente_portal (
    id               SERIAL PRIMARY KEY,
    paciente_id      INTEGER NOT NULL UNIQUE REFERENCES pacientes(id) ON DELETE CASCADE,
    usuario          VARCHAR(40) NOT NULL UNIQUE,
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

ALTER TABLE paciente_portal ENABLE ROW LEVEL SECURITY;

SELECT id, paciente_id, usuario, activo, last_login FROM paciente_portal ORDER BY id DESC;
