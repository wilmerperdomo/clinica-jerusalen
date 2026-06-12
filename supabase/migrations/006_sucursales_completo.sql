-- ============================================================
--  SUCURSALES — campos completos (Honduras SAR / CAI)
--  Ejecutar en: Supabase → SQL Editor
-- ============================================================

-- Cambiar num_min / num_max de INTEGER a VARCHAR para guardar
-- el formato SAR completo: 001-001-01-00064901
ALTER TABLE sucursales
  ALTER COLUMN num_min TYPE VARCHAR(30) USING COALESCE(NULLIF(TRIM(num_min::text),''), ''),
  ALTER COLUMN num_max TYPE VARCHAR(30) USING COALESCE(NULLIF(TRIM(num_max::text),''), '');

-- Resetear defaults de num_min / num_max (ya no son enteros)
ALTER TABLE sucursales
  ALTER COLUMN num_min SET DEFAULT '',
  ALTER COLUMN num_max SET DEFAULT '';

-- ── Campos faltantes ──────────────────────────────────────

-- Nombre corto / código visible en tickets
ALTER TABLE sucursales
  ADD COLUMN IF NOT EXISTS nombre_corto    VARCHAR(60)    DEFAULT '';

-- Lema o nombre largo para encabezado de facturas
ALTER TABLE sucursales
  ADD COLUMN IF NOT EXISTS lema            VARCHAR(200)   DEFAULT '';

-- Número inicial de correlativo de facturación (semilla)
ALTER TABLE sucursales
  ADD COLUMN IF NOT EXISTS numero_inicial  INTEGER        DEFAULT 1;

-- Fecha límite de emisión del CAI
ALTER TABLE sucursales
  ADD COLUMN IF NOT EXISTS fecha_limite    DATE;

-- Descuentos por edad (tercera / cuarta edad)
-- tercera_edad ya existe; agregar cuarta_edad
ALTER TABLE sucursales
  ADD COLUMN IF NOT EXISTS cuarta_edad          INTEGER       DEFAULT 0;

-- Renombrar / agregar columnas de descuento correctas
ALTER TABLE sucursales
  ADD COLUMN IF NOT EXISTS por_descuento_tercera NUMERIC(5,2) DEFAULT 0;

ALTER TABLE sucursales
  ADD COLUMN IF NOT EXISTS por_descuento_cuarta  NUMERIC(5,2) DEFAULT 0;

-- Copiar valor existente de por_descuento → por_descuento_tercera si aplica
UPDATE sucursales
  SET por_descuento_tercera = por_descuento
  WHERE por_descuento > 0 AND por_descuento_tercera = 0;

-- Tamaño de recibo (px) y tamaño de fuente
ALTER TABLE sucursales
  ADD COLUMN IF NOT EXISTS tama  VARCHAR(10) DEFAULT '340';

ALTER TABLE sucursales
  ADD COLUMN IF NOT EXISTS letra VARCHAR(10) DEFAULT '12';

-- ── Comentarios descriptivos ────────────────────────────
COMMENT ON COLUMN sucursales.cai              IS 'Código de Autorización de Impresión (Honduras SAR)';
COMMENT ON COLUMN sucursales.fecha_limite     IS 'Fecha límite de emisión del CAI';
COMMENT ON COLUMN sucursales.num_min          IS 'Rango inicial autorizado SAR, ej: 001-001-01-00064901';
COMMENT ON COLUMN sucursales.num_max          IS 'Rango final autorizado SAR, ej: 001-001-01-00069900';
COMMENT ON COLUMN sucursales.numero_inicial   IS 'Número inicial del correlativo de facturación';
COMMENT ON COLUMN sucursales.tercera_edad     IS 'Edad mínima (años) para descuento tercera edad';
COMMENT ON COLUMN sucursales.cuarta_edad      IS 'Edad mínima (años) para descuento cuarta edad';
COMMENT ON COLUMN sucursales.por_descuento_tercera IS 'Porcentaje de descuento tercera edad';
COMMENT ON COLUMN sucursales.por_descuento_cuarta  IS 'Porcentaje de descuento cuarta edad';
