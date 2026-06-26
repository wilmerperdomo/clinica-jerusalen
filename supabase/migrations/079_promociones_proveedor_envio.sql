-- ═══════════════════════════════════════════════════════════════
-- 079_promociones_proveedor_envio.sql
-- Proveedor de envío: asistido (gratis), meta (API oficial), evolution (WhatsApp Web)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE promocion_campanas
    ADD COLUMN IF NOT EXISTS proveedor_envio VARCHAR(20) NOT NULL DEFAULT 'asistido'
        CHECK (proveedor_envio IN ('asistido', 'meta', 'evolution'));

COMMENT ON COLUMN promocion_campanas.proveedor_envio IS
    'asistido=wa.me manual, meta=WhatsApp Cloud API, evolution=Evolution API / WhatsApp Web';

CREATE INDEX IF NOT EXISTS idx_campanas_proveedor_modo
    ON promocion_campanas(proveedor_envio, modo_envio, estado);
