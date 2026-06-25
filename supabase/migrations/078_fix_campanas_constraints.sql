-- ═══════════════════════════════════════════════════════════════
-- 078_fix_campanas_constraints.sql
-- Recrea las restricciones de modo_envio y estado en promocion_campanas
-- (bases creadas antes de agregar 'automatico' tenían un CHECK desactualizado)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE promocion_campanas
    DROP CONSTRAINT IF EXISTS promocion_campanas_modo_envio_check;
ALTER TABLE promocion_campanas
    ADD CONSTRAINT promocion_campanas_modo_envio_check
    CHECK (modo_envio IN ('inmediato', 'programado', 'asistido', 'automatico'));

ALTER TABLE promocion_campanas
    DROP CONSTRAINT IF EXISTS promocion_campanas_estado_check;
ALTER TABLE promocion_campanas
    ADD CONSTRAINT promocion_campanas_estado_check
    CHECK (estado IN ('borrador', 'programada', 'lista_envio', 'en_proceso', 'completada', 'cancelada'));
