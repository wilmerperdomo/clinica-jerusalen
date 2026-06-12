-- Médico en factura (consultas) y género en perfiles para Dr./Dra.

ALTER TABLE perfiles
  ADD COLUMN IF NOT EXISTS genero VARCHAR(1)
    CHECK (genero IS NULL OR genero IN ('M', 'F'));

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS medico_nombre VARCHAR(150);

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS consulta_id INTEGER REFERENCES consultas(id) ON DELETE SET NULL;

COMMENT ON COLUMN perfiles.genero       IS 'M = Dr., F = Dra. en facturas e impresiones';
COMMENT ON COLUMN facturas.medico_nombre IS 'Snapshot: Dr./Dra. + nombre del médico de la consulta';
COMMENT ON COLUMN facturas.consulta_id   IS 'Consulta vinculada al cobro/factura';
