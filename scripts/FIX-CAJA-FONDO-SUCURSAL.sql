-- Ejecutar en Supabase → SQL Editor para habilitar el fondo de caja por sucursal.

ALTER TABLE sucursales
  ADD COLUMN IF NOT EXISTS fondo_caja NUMERIC(12,2) NOT NULL DEFAULT 0;

SELECT id, nombre, fondo_caja FROM sucursales ORDER BY nombre;
