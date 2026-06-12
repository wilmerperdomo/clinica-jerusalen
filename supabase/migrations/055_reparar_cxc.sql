-- ═══════════════════════════════════════════════════════════════
--  055 — Reparar esquema de cxc (cuentas por cobrar)
--  En bases legacy la tabla cxc se creó sin paciente_id / sucursal_id,
--  por lo que los cobros a CRÉDITO fallaban al crear la cuenta.
--  Se agregan las columnas que la aplicación usa (seguro de re-ejecutar).
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE cxc ADD COLUMN IF NOT EXISTS paciente_id INTEGER;
ALTER TABLE cxc ADD COLUMN IF NOT EXISTS sucursal_id INTEGER;

-- Índice de búsqueda por paciente (ahora que la columna existe)
CREATE INDEX IF NOT EXISTS idx_cxc_paciente ON cxc(paciente_id);
