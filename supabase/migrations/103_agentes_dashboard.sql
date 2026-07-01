-- Permisos y lectura para panel Agentes IA en dashboard

INSERT INTO permisos (modulo_id, accion)
SELECT m.id, a.accion
FROM modulos m
CROSS JOIN (VALUES ('ver'), ('editar')) AS a(accion)
WHERE m.clave = 'agentes_ia'
  AND NOT EXISTS (
    SELECT 1 FROM permisos p2
    WHERE p2.modulo_id = m.id AND p2.accion = a.accion
  );

INSERT INTO rol_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r
JOIN permisos p ON p.modulo_id = (SELECT id FROM modulos WHERE clave = 'agentes_ia')
WHERE r.nombre IN ('Administrador', 'Super Administrador')
ON CONFLICT DO NOTHING;

-- Lectura para personal con permiso ver en módulo agentes_ia
CREATE OR REPLACE FUNCTION usuario_puede_ver_agentes_ia()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM perfiles pf
    JOIN perfil_roles pr ON pr.perfil_id = pf.id
    JOIN roles r ON r.id = pr.rol_id
    WHERE pf.id = auth.uid()
      AND r.nombre IN ('Administrador', 'Super Administrador')
  )
  OR EXISTS (
    SELECT 1
    FROM perfiles pf
    JOIN perfil_roles pr ON pr.perfil_id = pf.id
    JOIN rol_permisos rp ON rp.rol_id = pr.rol_id
    JOIN permisos p ON p.id = rp.permiso_id
    JOIN modulos m ON m.id = p.modulo_id
    WHERE pf.id = auth.uid()
      AND m.clave = 'agentes_ia'
      AND p.accion = 'ver'
  );
$$;

DROP POLICY IF EXISTS agente_msg_select_panel ON agente_mensajes;
CREATE POLICY agente_msg_select_panel ON agente_mensajes
  FOR SELECT TO authenticated
  USING (usuario_puede_ver_agentes_ia());

DROP POLICY IF EXISTS agente_esc_select_panel ON agente_escalamientos;
CREATE POLICY agente_esc_select_panel ON agente_escalamientos
  FOR SELECT TO authenticated
  USING (usuario_puede_ver_agentes_ia());

DROP POLICY IF EXISTS agente_audit_select_panel ON agente_auditoria;
CREATE POLICY agente_audit_select_panel ON agente_auditoria
  FOR SELECT TO authenticated
  USING (usuario_puede_ver_agentes_ia());

DROP POLICY IF EXISTS agente_esc_update_panel ON agente_escalamientos;
CREATE POLICY agente_esc_update_panel ON agente_escalamientos
  FOR UPDATE TO authenticated
  USING (usuario_puede_ver_agentes_ia())
  WITH CHECK (usuario_puede_ver_agentes_ia());

DROP POLICY IF EXISTS agente_conv_update_panel ON agente_conversaciones;
CREATE POLICY agente_conv_update_panel ON agente_conversaciones
  FOR UPDATE TO authenticated
  USING (usuario_puede_ver_agentes_ia())
  WITH CHECK (usuario_puede_ver_agentes_ia());

DROP POLICY IF EXISTS agente_conv_select_admin ON agente_conversaciones;
CREATE POLICY agente_conv_select_panel ON agente_conversaciones
  FOR SELECT TO authenticated
  USING (usuario_puede_ver_agentes_ia());
