-- Referencia médica — nuevo tipo de documento clínico

ALTER TABLE documento_correlativos DROP CONSTRAINT IF EXISTS documento_correlativos_tipo_check;
ALTER TABLE documento_correlativos ADD CONSTRAINT documento_correlativos_tipo_check
  CHECK (tipo IN ('RECETA', 'CONSTANCIA', 'DEFUNCION', 'REFERENCIA'));

ALTER TABLE consulta_documentos DROP CONSTRAINT IF EXISTS consulta_documentos_tipo_check;
ALTER TABLE consulta_documentos ADD CONSTRAINT consulta_documentos_tipo_check
  CHECK (tipo IN ('RECETA', 'CONSTANCIA', 'DEFUNCION', 'REFERENCIA'));
