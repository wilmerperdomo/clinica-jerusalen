-- ═══════════════════════════════════════════════════════════════
-- 021_proveedores_mejora.sql
-- Añade campos útiles a la tabla proveedores
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE proveedores
  ADD COLUMN IF NOT EXISTS ciudad          VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pais            VARCHAR(60)  DEFAULT 'Honduras',
  ADD COLUMN IF NOT EXISTS condicion_pago  VARCHAR(60),   -- 'Contado' | 'Crédito 30d' | etc.
  ADD COLUMN IF NOT EXISTS dias_credito    INTEGER       DEFAULT 0,
  ADD COLUMN IF NOT EXISTS banco           VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cuenta_banco    VARCHAR(60),
  ADD COLUMN IF NOT EXISTS tipo_proveedor  VARCHAR(60)   DEFAULT 'Medicamentos';
                                                          -- 'Medicamentos' | 'Insumos' | 'Equipos' | 'Servicios' | 'Otro'

CREATE INDEX IF NOT EXISTS idx_proveedores_nombre ON proveedores(nombre);
CREATE INDEX IF NOT EXISTS idx_proveedores_activo ON proveedores(activo);
