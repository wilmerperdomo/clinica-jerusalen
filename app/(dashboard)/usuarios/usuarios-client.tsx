'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Users, Shield, X, Save, RefreshCw, Edit2, CheckCircle2, XCircle,
  Crown, UserCheck, UserPlus, AlertCircle, KeyRound, Eye, EyeOff, Copy,
} from 'lucide-react'
import { cambiarPasswordUsuario, crearUsuario } from './actions'
import { useConfirm } from '@/components/confirm-dialog'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnGhost } from '@/components/module-layout'

/* ─── tipos ─────────────────────────────────────────────── */
interface Rol { id: number; nombre: string; color: string; descripcion?: string; es_admin: boolean; es_super_admin?: boolean }
interface Perfil {
  id: string; nombre?: string | null; apellido?: string | null
  cedula?: string | null; telefono?: string | null; activo: boolean
  sucursal_id?: number | null; rol_id?: number | null
  created_at: string; email?: string | null
  rol?: Rol | null
}
interface Sucursal { id: number; nombre: string; activo: boolean }
interface PerfilRol { perfil_id: string; rol_id: number }

function esSuperAdminPerfil(
  perfil: Perfil,
  perfilRoles: PerfilRol[],
  roles: Rol[],
): boolean {
  if (perfil.rol?.es_super_admin) return true
  const ids = perfilRoles.filter(pr => pr.perfil_id === perfil.id).map(pr => pr.rol_id)
  return roles.some(r => ids.includes(r.id) && r.es_super_admin)
}

function requiereSucursalAsignada(
  perfil: Perfil,
  perfilRoles: PerfilRol[],
  roles: Rol[],
): boolean {
  return perfil.activo && !esSuperAdminPerfil(perfil, perfilRoles, roles)
}

interface Props {
  perfiles:    Perfil[]
  roles:       Rol[]
  sucursales:  Sucursal[]
  perfilRoles: PerfilRol[]
  esSuperAdmin: boolean
}


/* ═══════════════════════════════════════════════════════ */
export default function UsuariosClient({
  perfiles: initPerfiles, roles, sucursales, perfilRoles: initPerfilRoles, esSuperAdmin,
}: Props) {
  const confirmDialog = useConfirm()
  const supabase = createClient()
  const [isPending, startTransition] = useTransition()

  const [perfiles,    setPerfiles]    = useState<Perfil[]>(initPerfiles)
  const [perfilRoles, setPerfilRoles] = useState<PerfilRol[]>(initPerfilRoles)

  /* modales */
  const [modalUsuario, setModalUsuario] = useState(false)
  const [modalNuevo,   setModalNuevo]   = useState(false)
  const [modalRoles,   setModalRoles]   = useState(false)
  const [perfilActual, setPerfilActual] = useState<Perfil | null>(null)
  const [usuarioRoles, setUsuarioRoles] = useState<Perfil | null>(null)
  const [rolesSeleccionados, setRolesSeleccionados] = useState<number[]>([])
  const [errorNuevo, setErrorNuevo] = useState('')
  const [okNuevo,    setOkNuevo]    = useState('')
  const [creando,    setCreando]    = useState(false)

  const [modalPassword, setModalPassword] = useState(false)
  const [perfilPassword, setPerfilPassword] = useState<Perfil | null>(null)
  const [formPassword, setFormPassword] = useState({ password: '', confirmar: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmar, setShowConfirmar] = useState(false)
  const [errorPassword, setErrorPassword] = useState('')
  const [passwordAsignada, setPasswordAsignada] = useState('')
  const [guardandoPassword, setGuardandoPassword] = useState(false)

  /* forms */
  const [formUsuario, setFormUsuario] = useState({
    nombre: '', apellido: '', cedula: '', telefono: '',
    rol_id: '', sucursal_id: '', activo: true,
  })
  const [formNuevo, setFormNuevo] = useState({
    email: '', password: '', nombre: '', apellido: '',
    cedula: '', telefono: '', rol_id: '', sucursal_id: '',
  })

  /* ── recargar ─ */
  async function recargar() {
    const [{ data: p }, { data: pr }] = await Promise.all([
      supabase.from('perfiles').select('*, rol:roles(id, nombre, color, es_admin)').order('created_at', { ascending: false }),
      supabase.from('perfil_roles').select('perfil_id, rol_id'),
    ])
    if (p)  setPerfiles(p as Perfil[])
    if (pr) setPerfilRoles(pr as PerfilRol[])
  }

  /* ── abrir modal roles ─ */
  function abrirModalRoles(perfil: Perfil) {
    setUsuarioRoles(perfil)
    setRolesSeleccionados(perfilRoles.filter(pr => pr.perfil_id === perfil.id).map(pr => pr.rol_id))
    setModalRoles(true)
  }

  async function guardarRoles() {
    if (!usuarioRoles) return
    const { confirmed } = await confirmDialog({
      title: 'Guardar roles',
      message: `¿Guardar los roles asignados a ${usuarioRoles.nombre} ${usuarioRoles.apellido}?`,
      variant: 'info',
      confirmLabel: 'Guardar',
    })
    if (!confirmed) return

    const { error: errDel } = await supabase.from('perfil_roles').delete().eq('perfil_id', usuarioRoles.id)
    if (errDel) return alert('Error al actualizar roles: ' + errDel.message)

    if (rolesSeleccionados.length > 0) {
      const { error: errIns } = await supabase.from('perfil_roles').insert(
        rolesSeleccionados.map(rol_id => ({ perfil_id: usuarioRoles.id, rol_id }))
      )
      if (errIns) return alert('Error al guardar roles: ' + errIns.message)

      const rolPrincipal = rolesSeleccionados.find(id => roles.find(r => r.id === id)?.es_admin)
        ?? rolesSeleccionados[0]
      const { error: errPerfil } = await supabase.from('perfiles').update({ rol_id: rolPrincipal }).eq('id', usuarioRoles.id)
      if (errPerfil) return alert('Error al actualizar perfil: ' + errPerfil.message)
    } else {
      const { error: errPerfil } = await supabase.from('perfiles').update({ rol_id: null }).eq('id', usuarioRoles.id)
      if (errPerfil) return alert('Error al actualizar perfil: ' + errPerfil.message)
    }
    setModalRoles(false)
    startTransition(() => { recargar() })
  }

  /* ── editar usuario ─ */
  function abrirEditar(perfil: Perfil) {
    setPerfilActual(perfil)
    setFormUsuario({
      nombre:      perfil.nombre      || '',
      apellido:    perfil.apellido    || '',
      cedula:      perfil.cedula      || '',
      telefono:    perfil.telefono    || '',
      rol_id:      String(perfil.rol_id      || ''),
      sucursal_id: String(perfil.sucursal_id || ''),
      activo:      perfil.activo,
    })
    setModalUsuario(true)
  }

  async function guardarUsuario() {
    if (!perfilActual) return
    const necesitaSucursal = requiereSucursalAsignada(perfilActual, perfilRoles, roles)
    if (necesitaSucursal && !formUsuario.sucursal_id) {
      alert('Los usuarios operativos deben tener una sucursal asignada.')
      return
    }
    const payload: Record<string, unknown> = {
      nombre:      formUsuario.nombre      || null,
      apellido:    formUsuario.apellido    || null,
      cedula:      formUsuario.cedula      || null,
      telefono:    formUsuario.telefono    || null,
      sucursal_id: formUsuario.sucursal_id ? Number(formUsuario.sucursal_id) : null,
      activo:      formUsuario.activo,
    }
    // Solo el super administrador puede cambiar el rol
    if (esSuperAdmin) {
      payload.rol_id = formUsuario.rol_id ? Number(formUsuario.rol_id) : null
    }
    const { error } = await supabase.from('perfiles').update(payload).eq('id', perfilActual.id)
    if (error) return alert('Error al guardar usuario: ' + error.message)
    setModalUsuario(false)
    startTransition(() => { recargar() })
  }

  async function toggleActivo(perfil: Perfil) {
    const nombre = `${perfil.nombre || ''} ${perfil.apellido || ''}`.trim()
    const { confirmed } = await confirmDialog({
      title: perfil.activo ? 'Desactivar usuario' : 'Activar usuario',
      message: perfil.activo
        ? `¿Está seguro que desea desactivar al usuario "${nombre}"?`
        : `¿Activar al usuario "${nombre}"?`,
      variant: perfil.activo ? 'warning' : 'success',
      confirmLabel: perfil.activo ? 'Desactivar' : 'Activar',
    })
    if (!confirmed) return
    const { error } = await supabase.from('perfiles').update({ activo: !perfil.activo }).eq('id', perfil.id)
    if (error) return alert('Error: ' + error.message)
    startTransition(() => { recargar() })
  }

  function generarPasswordTemporal(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let s = ''
    for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
    return s
  }

  function abrirModalPassword(perfil: Perfil) {
    setPerfilPassword(perfil)
    setFormPassword({ password: '', confirmar: '' })
    setErrorPassword('')
    setPasswordAsignada('')
    setShowPassword(false)
    setShowConfirmar(false)
    setModalPassword(true)
  }

  function cerrarModalPassword() {
    setModalPassword(false)
    setPerfilPassword(null)
    setFormPassword({ password: '', confirmar: '' })
    setErrorPassword('')
    setPasswordAsignada('')
  }

  async function guardarPasswordUsuario() {
    if (!perfilPassword) return
    setErrorPassword('')
    if (formPassword.password.length < 6) {
      setErrorPassword('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (formPassword.password !== formPassword.confirmar) {
      setErrorPassword('Las contraseñas no coinciden.')
      return
    }

    const { confirmed } = await confirmDialog({
      title: 'Restablecer contraseña',
      message: `¿Asignar una nueva contraseña a ${perfilPassword.nombre || ''} ${perfilPassword.apellido || ''}? El usuario podrá entrar de inmediato con la nueva clave.`,
      variant: 'warning',
      confirmLabel: 'Restablecer',
    })
    if (!confirmed) return

    setGuardandoPassword(true)
    const result = await cambiarPasswordUsuario({
      userId: perfilPassword.id,
      password: formPassword.password,
    })
    setGuardandoPassword(false)

    if (result.error) {
      setErrorPassword(result.error)
      return
    }

    setPasswordAsignada(formPassword.password)
    setFormPassword({ password: '', confirmar: '' })
  }

  /* ── crear nuevo usuario ─ */
  async function handleCrearUsuario() {
    setErrorNuevo('')
    setOkNuevo('')
    if (!formNuevo.email || !formNuevo.password || !formNuevo.nombre) {
      setErrorNuevo('Email, contraseña y nombre son obligatorios')
      return
    }
    if (formNuevo.password.length < 6) {
      setErrorNuevo('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (!formNuevo.sucursal_id) { setErrorNuevo('Debes asignar una sucursal al usuario'); return }
    if (esSuperAdmin && !formNuevo.rol_id) { setErrorNuevo('Debes asignar un rol al usuario'); return }

    setCreando(true)
    const result = await crearUsuario({
      email:       formNuevo.email,
      password:    formNuevo.password,
      nombre:      formNuevo.nombre,
      apellido:    formNuevo.apellido,
      cedula:      formNuevo.cedula      || undefined,
      telefono:    formNuevo.telefono    || undefined,
      rol_id:      formNuevo.rol_id      ? Number(formNuevo.rol_id)      : undefined,
      sucursal_id: formNuevo.sucursal_id ? Number(formNuevo.sucursal_id) : undefined,
    })
    setCreando(false)
    if (result.error) {
      setErrorNuevo(result.error)
    } else {
      setOkNuevo('aviso' in result && result.aviso ? `✓ Usuario creado. ${result.aviso}` : '✓ Usuario creado correctamente')
      setFormNuevo({ email: '', password: '', nombre: '', apellido: '', cedula: '', telefono: '', rol_id: '', sucursal_id: '' })
      startTransition(() => { recargar() })
      setTimeout(() => { setModalNuevo(false); setOkNuevo('') }, 'aviso' in result && result.aviso ? 8000 : 1500)
    }
  }

  /* stats */
  const activos   = perfiles.filter(p => p.activo).length
  const inactivos = perfiles.filter(p => !p.activo).length
  const sinSucursalOperativos = perfiles.filter(p => requiereSucursalAsignada(p, perfilRoles, roles) && !p.sucursal_id)

  /* ═══════════════ JSX ════════════════════════════════════ */
  return (
    <ModuleShell tint="violet">
      <ModuleHero
        title="Usuarios"
        subtitle="Gestión de usuarios, roles y accesos del personal"
        badge="Administración"
        icon={Users}
        gradient="violet"
        kpis={[
          { label: 'Usuarios', value: perfiles.length, icon: Users },
          { label: 'Activos', value: activos, icon: UserCheck },
          { label: 'Inactivos', value: inactivos, icon: XCircle },
          { label: 'Roles', value: roles.length, icon: Shield },
        ]}
        actions={
          <ModuleBtnGhost onClick={() => startTransition(() => { recargar() })}>
            <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
            Actualizar
          </ModuleBtnGhost>
        }
      />
      <ModuleContent>
        <div className="bg-white rounded-xl border p-4 space-y-3">
          {sinSucursalOperativos.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">{sinSucursalOperativos.length} usuario(s) operativo(s) sin sucursal</p>
                <p className="text-xs mt-0.5 text-amber-800">
                  Asigne sucursal en Editar para evitar que abran caja o trabajen en la sucursal equivocada.
                </p>
              </div>
            </div>
          )}
          <div className="flex justify-end">
            <button onClick={() => { setErrorNuevo(''); setOkNuevo(''); setModalNuevo(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <UserPlus className="w-4 h-4" /> Nuevo Usuario
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-xs uppercase">
                  <th className="px-4 py-3 text-left">Nombre</th>
                  <th className="px-4 py-3 text-left">Cédula</th>
                  <th className="px-4 py-3 text-left">Teléfono</th>
                  <th className="px-4 py-3 text-left">Rol</th>
                  <th className="px-4 py-3 text-left">Sucursal</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {perfiles.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-gray-400">No hay usuarios registrados aún</td></tr>
                )}
                {perfiles.map(p => {
                  const faltaSucursal = requiereSucursalAsignada(p, perfilRoles, roles) && !p.sucursal_id
                  return (
                  <tr key={p.id} className={`hover:bg-gray-50 ${!p.activo ? 'opacity-50' : ''} ${faltaSucursal ? 'bg-amber-50/60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                          {(p.nombre?.[0] || '?').toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{p.nombre || '—'} {p.apellido || ''}</p>
                          <p className="text-xs text-gray-400 font-mono">{p.id.slice(0, 8)}…</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{p.cedula || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{p.telefono || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap gap-1">
                          {perfilRoles.filter(pr => pr.perfil_id === p.id).map(pr => {
                            const r = roles.find(r => r.id === pr.rol_id)
                            if (!r) return null
                            return (
                              <span key={r.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                style={{ backgroundColor: r.color + '20', color: r.color }}>
                                {r.es_admin && <Crown className="w-2.5 h-2.5" />}{r.nombre}
                              </span>
                            )
                          })}
                          {perfilRoles.filter(pr => pr.perfil_id === p.id).length === 0 && (
                            <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Sin rol</span>
                          )}
                        </div>
                        {esSuperAdmin && (
                          <button onClick={() => abrirModalRoles(p)}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline">
                            <Shield className="w-3 h-3" /> Asignar roles
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {sucursales.find(s => s.id === p.sucursal_id)?.nombre || (
                        faltaSucursal
                          ? <span className="text-amber-700 font-semibold">Sin sucursal</span>
                          : '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.activo
                        ? <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">Activo</span>
                        : <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">Inactivo</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => abrirEditar(p)}
                          className="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100" title="Editar">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => abrirModalPassword(p)}
                          className="p-1.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100" title="Restablecer contraseña">
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => toggleActivo(p)}
                          className={`p-1.5 rounded ${p.activo ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                          title={p.activo ? 'Desactivar' : 'Activar'}>
                          {p.activo ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        </div>
      </ModuleContent>

      {/* ══════════ MODAL EDITAR USUARIO ══════════ */}
      {modalUsuario && perfilActual && (
        <Modal title="Editar Perfil de Usuario" onClose={() => setModalUsuario(false)}>
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 font-mono break-all">ID: {perfilActual.id}</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input value={formUsuario.nombre} onChange={e => setFormUsuario(p => ({ ...p, nombre: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Apellido</label>
                <input value={formUsuario.apellido} onChange={e => setFormUsuario(p => ({ ...p, apellido: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cédula / DNI</label>
                <input value={formUsuario.cedula} onChange={e => setFormUsuario(p => ({ ...p, cedula: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input value={formUsuario.telefono} onChange={e => setFormUsuario(p => ({ ...p, telefono: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            {esSuperAdmin ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol *</label>
                <select value={formUsuario.rol_id}
                  onChange={e => setFormUsuario(p => ({ ...p, rol_id: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                  <option value="">— Sin rol —</option>
                  {roles.map(r => (
                    <option key={r.id} value={r.id}>{r.es_admin ? '👑 ' : ''}{r.nombre}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                <div className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-600 flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-gray-400" />
                  {roles.find(r => r.id === Number(formUsuario.rol_id))?.nombre || 'Sin rol'}
                  <span className="ml-auto text-xs text-gray-400">Solo el super administrador asigna roles</span>
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sucursal{perfilActual && requiereSucursalAsignada(perfilActual, perfilRoles, roles) ? ' *' : ''}
              </label>
              <select value={formUsuario.sucursal_id} onChange={e => setFormUsuario(p => ({ ...p, sucursal_id: e.target.value }))}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none ${
                  perfilActual && requiereSucursalAsignada(perfilActual, perfilRoles, roles) && !formUsuario.sucursal_id
                    ? 'border-amber-300 bg-amber-50' : ''
                }`}>
                {!(perfilActual && requiereSucursalAsignada(perfilActual, perfilRoles, roles)) && (
                  <option value="">— Sin sucursal —</option>
                )}
                {sucursales.filter(s => s.activo).map(s => (<option key={s.id} value={s.id}>{s.nombre}</option>))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="activo" checked={formUsuario.activo}
                onChange={e => setFormUsuario(p => ({ ...p, activo: e.target.checked }))} className="rounded" />
              <label htmlFor="activo" className="text-sm text-gray-700">Usuario activo</label>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalUsuario(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={guardarUsuario} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
                <Save className="w-4 h-4 inline mr-1" /> Guardar Cambios
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════ MODAL ASIGNAR ROLES ══════════ */}
      {modalRoles && usuarioRoles && (
        <Modal title="Asignar Roles al Usuario" onClose={() => setModalRoles(false)}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold">
                {(usuarioRoles.nombre?.[0] || '?').toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-gray-900">{usuarioRoles.nombre} {usuarioRoles.apellido}</p>
                <p className="text-xs text-gray-400 font-mono">{usuarioRoles.id.slice(0, 16)}…</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Selecciona uno o varios roles. El usuario tendrá acceso a los módulos de <strong>todos</strong> los roles marcados.
            </p>
            <div className="space-y-2">
              {roles.filter(r => esSuperAdmin || !r.es_super_admin).map(r => {
                const seleccionado = rolesSeleccionados.includes(r.id)
                return (
                  <label key={r.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${seleccionado ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input type="checkbox" checked={seleccionado}
                      onChange={e => setRolesSeleccionados(prev => e.target.checked ? [...prev, r.id] : prev.filter(id => id !== r.id))}
                      className="w-4 h-4 rounded" />
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
                      <div>
                        <p className="font-medium text-sm text-gray-900 flex items-center gap-1">
                          {r.es_admin && <Crown className="w-3.5 h-3.5 text-amber-500" />}{r.nombre}
                        </p>
                        {r.descripcion && <p className="text-xs text-gray-400">{r.descripcion}</p>}
                      </div>
                    </div>
                    {seleccionado && <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />}
                  </label>
                )
              })}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalRoles(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={guardarRoles} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
                <Save className="w-4 h-4 inline mr-1" /> Guardar Roles
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════ MODAL RESTABLECER CONTRASEÑA ══════════ */}
      {modalPassword && perfilPassword && (
        <Modal title="Restablecer contraseña" onClose={cerrarModalPassword}>
          <div className="space-y-4">
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-bold">
                {(perfilPassword.nombre?.[0] || '?').toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-gray-900">
                  {perfilPassword.nombre || '—'} {perfilPassword.apellido || ''}
                </p>
                {perfilPassword.email && (
                  <p className="text-xs text-gray-500">{perfilPassword.email}</p>
                )}
              </div>
            </div>

            {passwordAsignada ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 bg-green-50 text-green-800 text-sm rounded-lg px-3 py-2 border border-green-200">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>Contraseña actualizada. Entregue esta clave al usuario; no se volverá a mostrar aquí.</p>
                </div>
                <div className="rounded-xl border border-green-200 bg-white p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Nueva contraseña</p>
                    <p className="font-mono font-bold text-xl tracking-widest text-green-700">{passwordAsignada}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(passwordAsignada)}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                    title="Copiar"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex justify-end">
                  <button onClick={cerrarModalPassword} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
                    Listo
                  </button>
                </div>
              </div>
            ) : (
              <>
                {errorPassword && (
                  <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 border border-red-200">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {errorPassword}
                  </div>
                )}
                <p className="text-sm text-gray-600">
                  Asigne una contraseña temporal. El usuario entrará con su correo y esta clave; puede cambiarla después desde el menú lateral.
                </p>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-gray-700">Nueva contraseña *</label>
                    <button
                      type="button"
                      onClick={() => {
                        const gen = generarPasswordTemporal()
                        setFormPassword({ password: gen, confirmar: gen })
                      }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Generar automática
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formPassword.password}
                      onChange={e => setFormPassword(p => ({ ...p, password: e.target.value }))}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full border rounded-lg px-3 py-2 pr-10 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar contraseña *</label>
                  <div className="relative">
                    <input
                      type={showConfirmar ? 'text' : 'password'}
                      value={formPassword.confirmar}
                      onChange={e => setFormPassword(p => ({ ...p, confirmar: e.target.value }))}
                      placeholder="Repite la contraseña"
                      className="w-full border rounded-lg px-3 py-2 pr-10 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <button type="button" onClick={() => setShowConfirmar(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showConfirmar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={cerrarModalPassword} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                  <button onClick={guardarPasswordUsuario} disabled={guardandoPassword}
                    className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                    <KeyRound className="w-4 h-4 inline mr-1" />
                    {guardandoPassword ? 'Guardando…' : 'Restablecer contraseña'}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* ══════════ MODAL NUEVO USUARIO ══════════ */}
      {modalNuevo && (
        <Modal title="Crear Nuevo Usuario" onClose={() => setModalNuevo(false)}>
          <div className="space-y-3">
            {errorNuevo && (
              <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 border border-red-200">
                <AlertCircle className="w-4 h-4 shrink-0" /> {errorNuevo}
              </div>
            )}
            {okNuevo && (
              <div className="flex items-center gap-2 bg-green-50 text-green-700 text-sm rounded-lg px-3 py-2 border border-green-200">
                <CheckCircle2 className="w-4 h-4 shrink-0" /> {okNuevo}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico *</label>
                <input type="email" value={formNuevo.email} onChange={e => setFormNuevo(p => ({ ...p, email: e.target.value }))}
                  placeholder="usuario@clinica.com"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña *</label>
                <input type="password" value={formNuevo.password} onChange={e => setFormNuevo(p => ({ ...p, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input value={formNuevo.nombre} onChange={e => setFormNuevo(p => ({ ...p, nombre: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Apellido</label>
                <input value={formNuevo.apellido} onChange={e => setFormNuevo(p => ({ ...p, apellido: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cédula / DNI</label>
                <input value={formNuevo.cedula} onChange={e => setFormNuevo(p => ({ ...p, cedula: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input value={formNuevo.telefono} onChange={e => setFormNuevo(p => ({ ...p, telefono: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            {esSuperAdmin ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rol <span className="text-red-500">*</span></label>
                <select value={formNuevo.rol_id} onChange={e => setFormNuevo(p => ({ ...p, rol_id: e.target.value }))}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none ${!formNuevo.rol_id ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}>
                  <option value="">— Selecciona rol —</option>
                  {roles.filter(r => !r.es_super_admin).map(r => (
                    <option key={r.id} value={r.id}>{r.es_admin ? '👑 ' : ''}{r.nombre}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="flex items-start gap-2 bg-amber-50 text-amber-800 text-xs rounded-lg px-3 py-2 border border-amber-200">
                <Shield className="w-4 h-4 shrink-0 mt-0.5" />
                <span>El usuario se creará <strong>sin rol</strong>. Un super administrador deberá asignarle el rol para que tenga acceso.</span>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sucursal <span className="text-red-500">*</span></label>
              <select value={formNuevo.sucursal_id} onChange={e => setFormNuevo(p => ({ ...p, sucursal_id: e.target.value }))}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none ${!formNuevo.sucursal_id ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}>
                <option value="">— Selecciona sucursal —</option>
                {sucursales.filter(s => s.activo).map(s => (<option key={s.id} value={s.id}>{s.nombre}</option>))}
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalNuevo(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={handleCrearUsuario} disabled={creando}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                <UserPlus className="w-4 h-4 inline mr-1" /> {creando ? 'Creando…' : 'Crear Usuario'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </ModuleShell>
  )
}

/* ── Modal genérico ─────────────────────────────────────── */
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-6 py-4 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
