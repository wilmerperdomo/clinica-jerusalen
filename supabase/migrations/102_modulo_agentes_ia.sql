-- ═══════════════════════════════════════════════════════════════
-- 102 — Módulo Agentes IA (WhatsApp / Messenger)
-- Conversaciones, memoria, canales multi-número y auditoría
-- ═══════════════════════════════════════════════════════════════

INSERT INTO modulos (clave, nombre, icono, orden, activo)
VALUES ('agentes_ia', 'Agentes IA', 'Bot', 95, true)
ON CONFLICT (clave) DO NOTHING;

-- ── Canales (3 WhatsApp + Messenger) ─────────────────────────────
CREATE TABLE IF NOT EXISTS agente_canales (
  id              SERIAL PRIMARY KEY,
  clave           VARCHAR(50) NOT NULL UNIQUE,
  nombre          VARCHAR(120) NOT NULL,
  tipo            VARCHAR(20) NOT NULL CHECK (tipo IN ('whatsapp_meta','whatsapp_evolution','messenger')),
  sucursal_id     INTEGER REFERENCES sucursales(id),
  phone_number_id VARCHAR(80),
  evolution_instance VARCHAR(80),
  page_id         VARCHAR(80),
  activo          BOOLEAN NOT NULL DEFAULT true,
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN agente_canales.config IS
  'Horarios, ubicación, servicios, tono, FAQs locales. Ver lib/agentes/config/canales.ts';

-- ── Conversaciones (memoria por contacto/canal) ────────────────
CREATE TABLE IF NOT EXISTS agente_conversaciones (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canal_id        INTEGER NOT NULL REFERENCES agente_canales(id),
  paciente_id     INTEGER REFERENCES pacientes(id),
  contacto_externo VARCHAR(40) NOT NULL,
  contacto_nombre  VARCHAR(200),
  estado          VARCHAR(20) NOT NULL DEFAULT 'activa'
                  CHECK (estado IN ('activa','escalada','cerrada','bloqueada')),
  ultimo_agente   VARCHAR(40),
  contexto        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ultimo_mensaje_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canal_id, contacto_externo)
);

CREATE INDEX IF NOT EXISTS idx_agente_conv_canal ON agente_conversaciones(canal_id);
CREATE INDEX IF NOT EXISTS idx_agente_conv_paciente ON agente_conversaciones(paciente_id);
CREATE INDEX IF NOT EXISTS idx_agente_conv_estado ON agente_conversaciones(estado);

-- ── Mensajes (historial completo) ─────────────────────────────
CREATE TABLE IF NOT EXISTS agente_mensajes (
  id              BIGSERIAL PRIMARY KEY,
  conversacion_id UUID NOT NULL REFERENCES agente_conversaciones(id) ON DELETE CASCADE,
  rol             VARCHAR(15) NOT NULL CHECK (rol IN ('usuario','asistente','sistema','humano')),
  contenido       TEXT NOT NULL,
  agente          VARCHAR(40),
  intencion       VARCHAR(40),
  confianza       NUMERIC(4,3),
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agente_msg_conv ON agente_mensajes(conversacion_id, created_at);

-- ── Escalamiento a humano ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS agente_escalamientos (
  id              BIGSERIAL PRIMARY KEY,
  conversacion_id UUID NOT NULL REFERENCES agente_conversaciones(id) ON DELETE CASCADE,
  motivo          TEXT NOT NULL,
  prioridad       VARCHAR(10) NOT NULL DEFAULT 'normal'
                  CHECK (prioridad IN ('baja','normal','alta','urgente')),
  asignado_a      UUID REFERENCES auth.users(id),
  resuelto_at     TIMESTAMPTZ,
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Auditoría de decisiones del orquestador ─────────────────────
CREATE TABLE IF NOT EXISTS agente_auditoria (
  id              BIGSERIAL PRIMARY KEY,
  conversacion_id UUID REFERENCES agente_conversaciones(id) ON DELETE SET NULL,
  accion          VARCHAR(60) NOT NULL,
  agente          VARCHAR(40),
  detalle         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agente_audit_conv ON agente_auditoria(conversacion_id, created_at DESC);

-- Canales semilla (config detallada en app; aquí solo identidad)
INSERT INTO agente_canales (clave, nombre, tipo, config) VALUES
  ('whatsapp_principal', 'Clínica Principal', 'whatsapp_meta', '{"tono":"cálido y profesional","rol":"sucursal principal"}'::jsonb),
  ('whatsapp_sucursal', 'Sucursal', 'whatsapp_meta', '{"tono":"cercano y práctico","rol":"sucursal secundaria"}'::jsonb),
  ('whatsapp_corporativo', 'Atención Corporativa', 'whatsapp_meta', '{"tono":"formal y ejecutivo","rol":"atención general y derivación"}'::jsonb),
  ('messenger_pagina', 'Facebook Messenger', 'messenger', '{"tono":"amable y breve"}'::jsonb)
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE agente_canales ENABLE ROW LEVEL SECURITY;
ALTER TABLE agente_conversaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE agente_mensajes ENABLE ROW LEVEL SECURITY;
ALTER TABLE agente_escalamientos ENABLE ROW LEVEL SECURITY;
ALTER TABLE agente_auditoria ENABLE ROW LEVEL SECURITY;

-- Solo service role / RPCs del backend tocan estas tablas
CREATE POLICY "agente_canales_select_auth" ON agente_canales
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "agente_conv_select_admin" ON agente_conversaciones
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM perfiles p
      JOIN perfil_roles pr ON pr.perfil_id = p.id
      JOIN roles r ON r.id = pr.rol_id
      WHERE p.id = auth.uid() AND r.nombre IN ('Administrador', 'Super Administrador')
    )
  );
