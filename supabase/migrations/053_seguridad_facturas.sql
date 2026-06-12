-- ═══════════════════════════════════════════════════════════════
--  053 — Seguridad de facturas (defensa en profundidad)
--   - Emitir (INSERT) y consultar (SELECT): cualquier usuario de caja.
--   - Anular (UPDATE) y eliminar (DELETE): SOLO administradores.
--   - La vista de auditoría respeta la RLS del usuario (security_invoker).
--  Requiere fn_usuario_es_admin() (046_fix_perfiles_rls).
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Reemplazar política única FOR ALL por políticas por comando ──
DROP POLICY IF EXISTS "auth_facturas" ON facturas;

CREATE POLICY "facturas_select" ON facturas
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "facturas_insert" ON facturas
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Anular factura (cambia estado / motivo): solo administradores
CREATE POLICY "facturas_update_admin" ON facturas
  FOR UPDATE TO authenticated
  USING (fn_usuario_es_admin())
  WITH CHECK (fn_usuario_es_admin());

-- Eliminar factura: solo administradores
CREATE POLICY "facturas_delete_admin" ON facturas
  FOR DELETE TO authenticated
  USING (fn_usuario_es_admin());

-- factura_correlativos se deja con acceso completo: la reserva de número
-- la realiza cualquier caja al emitir (INSERT/UPDATE del contador).

-- ── 2. La vista de auditoría respeta la RLS de quien consulta ──
-- Evita que un usuario sin privilegios lea snapshots de facturas anuladas
-- a través de la vista (antes corría con permisos del owner).
ALTER VIEW v_facturas_auditoria SET (security_invoker = on);

-- ── 3. Endurecer INSERT manual de auditoría ──
-- Los triggers (SECURITY DEFINER) siguen insertando sin problema porque
-- corren como owner y omiten RLS; esto solo bloquea inserciones directas.
DROP POLICY IF EXISTS "sistema_inserta_auditoria" ON facturas_auditoria;
CREATE POLICY "auditoria_insert_admin" ON facturas_auditoria
  FOR INSERT TO authenticated
  WITH CHECK (fn_usuario_es_admin());
