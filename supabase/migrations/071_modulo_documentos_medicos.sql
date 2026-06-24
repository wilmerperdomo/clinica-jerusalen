-- ═══════════════════════════════════════════════════════════════
-- 071_modulo_documentos_medicos.sql
-- Módulo de historial / reimpresión de documentos clínicos
-- ═══════════════════════════════════════════════════════════════

INSERT INTO modulos (clave, nombre, icono, orden, activo)
VALUES ('documentos', 'Documentos Médicos', 'FileText', 6, true)
ON CONFLICT (clave) DO NOTHING;

INSERT INTO permisos (modulo_id, accion)
SELECT m.id, 'ver'
FROM   modulos m
WHERE  m.clave = 'documentos'
  AND  NOT EXISTS (
    SELECT 1 FROM permisos p2
    JOIN   modulos m2 ON m2.id = p2.modulo_id
    WHERE  m2.clave = 'documentos' AND p2.accion = 'ver'
  );

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM   roles r, permisos p
JOIN   modulos m ON m.id = p.modulo_id
WHERE  r.nombre IN ('Administrador', 'Enfermera', 'Médico')
  AND  m.clave  = 'documentos'
  AND  p.accion = 'ver'
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_consulta_documentos_paciente ON consulta_documentos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_consulta_documentos_tipo_fecha ON consulta_documentos(tipo, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_consulta_documentos_sucursal_fecha ON consulta_documentos(sucursal_id, created_at DESC);
