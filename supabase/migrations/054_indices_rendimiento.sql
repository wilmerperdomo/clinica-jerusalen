-- ═══════════════════════════════════════════════════════════════
--  054 — Índices de rendimiento
--  Columnas usadas frecuentemente para filtrar y que aún no tenían
--  índice. Todo con IF NOT EXISTS (seguro de re-ejecutar).
-- ═══════════════════════════════════════════════════════════════

-- Caja: filtros por sucursal y estado (usados en RLS y listados)
CREATE INDEX IF NOT EXISTS idx_caja_sesiones_sucursal ON caja_sesiones(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_caja_sesiones_estado   ON caja_sesiones(estado);

-- Citas: filtros por sucursal y estado
CREATE INDEX IF NOT EXISTS idx_citas_sucursal ON citas(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_citas_estado   ON citas(estado);

-- Cuentas por cobrar: búsqueda por paciente
CREATE INDEX IF NOT EXISTS idx_cxc_paciente ON cxc(paciente_id);

-- Cotizaciones: búsqueda por paciente
CREATE INDEX IF NOT EXISTS idx_cotizaciones_paciente ON cotizaciones(paciente_id);

-- Documentos de consulta: filtros por paciente
CREATE INDEX IF NOT EXISTS idx_consulta_documentos_paciente ON consulta_documentos(paciente_id);

-- Facturas: listados por sucursal y por paciente
CREATE INDEX IF NOT EXISTS idx_facturas_sucursal ON facturas(sucursal_id);
CREATE INDEX IF NOT EXISTS idx_facturas_paciente ON facturas(paciente_id);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha    ON facturas(fecha);

-- Movimientos de caja: agregación por sesión (cierre/arqueo)
CREATE INDEX IF NOT EXISTS idx_caja_movimientos_sesion ON caja_movimientos(sesion_id);
