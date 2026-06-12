'use client'

import { useState, useTransition } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  Users, Shield, Building2, Settings, X, Save,
  RefreshCw, Edit2, CheckCircle2, XCircle, Plus,
  Crown, UserCheck, UserPlus, AlertCircle, Stethoscope, Trash2, Lock, Unlock, ShieldAlert, LogIn, LogOut, Clock,
} from 'lucide-react'
import { crearUsuario } from './actions'
import { useConfirm } from '@/components/confirm-dialog'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnGhost } from '@/components/module-layout'

/* ─── tipos ─────────────────────────────────────────────── */
interface Rol { id: number; nombre: string; color: string; descripcion?: string; es_admin: boolean; es_super_admin?: boolean }
interface Perfil {
  id: string; nombre?: string; apellido?: string
  cedula?: string; telefono?: string; activo: boolean
  sucursal_id?: number; rol_id?: number
  sueldo_fijo?: number; tipo_nomina?: string
  created_at: string; rol?: Rol
}
interface Sucursal {
  id: number
  nombre: string
  nombre_corto?: string
  lema?: string
  ciudad?: string
  direccion?: string
  telefono?: string
  email?: string
  rtn?: string
  cai?: string
  fecha_limite?: string
  num_min?: string
  num_max?: string
  numero_inicial?: number
  tercera_edad?: number
  cuarta_edad?: number
  por_descuento_tercera?: number
  por_descuento_cuarta?: number
  tama?: string
  letra?: string
  activo: boolean
}
interface Modulo    { id: number; clave: string; nombre: string; icono?: string; orden: number }
interface Servicio  { id: number; nombre: string; tipo: string; descripcion?: string; precio: number; activo: boolean }
interface Permiso   { id: number; modulo_id: number; accion: string }
interface RolPerm   { rol_id: number; permiso_id: number }
interface AccesoLog { id: number; email: string; accion: string; ip?: string; created_at: string; sucursal_id?: number }

interface PerfilRol { perfil_id: string; rol_id: number }

interface Props {
  perfiles:    Perfil[]
  roles:       Rol[]
  sucursales:  Sucursal[]
  modulos:     Modulo[]
  perfilRoles: PerfilRol[]
  servicios:   Servicio[]
  permisos:    Permiso[]
  rolPermisos: RolPerm[]
  accesoLogs:  AccesoLog[]
  esSuperAdmin: boolean
}

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

/* ═══════════════════════════════════════════════════════ */
export default function ConfigClient({ perfiles: initPerfiles, roles, sucursales: initSucs, modulos, perfilRoles: initPerfilRoles, servicios: initServicios, permisos, rolPermisos: initRolPermisos, accesoLogs, esSuperAdmin }: Props) {
  const confirmDialog = useConfirm()
  const [tab, setTab] = useState<'usuarios' | 'roles' | 'sucursales' | 'servicios' | 'permisos' | 'seguridad'>('usuarios')
  const [rolPermisos, setRolPermisos] = useState<RolPerm[]>(initRolPermisos)
  const [guardandoPerm, setGuardandoPerm] = useState(false)
  const [perfiles,    setPerfiles]    = useState<Perfil[]>(initPerfiles)
  const [sucursales,  setSucursales]  = useState<Sucursal[]>(initSucs)
  const [perfilRoles, setPerfilRoles] = useState<PerfilRol[]>(initPerfilRoles)
  const [servicios,   setServicios]   = useState<Servicio[]>(initServicios)
  const [modalServicio, setModalServicio] = useState(false)
  const [servicioActual, setServicioActual] = useState<Servicio | null>(null)
  const [formServicio, setFormServicio] = useState({ nombre: '', tipo: 'General', descripcion: '', precio: '' })
  const [guardandoServ, setGuardandoServ] = useState(false)
  const [modalRoles,  setModalRoles]  = useState(false)
  const [usuarioRoles, setUsuarioRoles] = useState<Perfil | null>(null)
  const [rolesSeleccionados, setRolesSeleccionados] = useState<number[]>([])
  const [isPending, startTransition] = useTransition()

  /* modales */
  const [modalUsuario,   setModalUsuario]   = useState(false)
  const [modalNuevo,     setModalNuevo]     = useState(false)
  const [modalSucursal,  setModalSucursal]  = useState(false)
  const [perfilActual,   setPerfilActual]   = useState<Perfil | null>(null)
  const [sucursalActual, setSucursalActual] = useState<Sucursal | null>(null)
  const [errorNuevo,     setErrorNuevo]     = useState('')
  const [okNuevo,        setOkNuevo]        = useState('')
  const [errorSuc,       setErrorSuc]       = useState('')
  const [loadingSuc,     setLoadingSuc]     = useState(false)

  /* forms */
  const [formUsuario, setFormUsuario] = useState({
    nombre: '', apellido: '', cedula: '', telefono: '',
    rol_id: '', sucursal_id: '', activo: true,
    sueldo_fijo: '', tipo_nomina: 'NINGUNO',
  })

  function inferirTipoNomina(rolId: string): string {
    const rol = roles.find(r => r.id === Number(rolId))
    if (!rol) return 'NINGUNO'
    if (rol.nombre === 'Médico') return 'MEDICO'
    if (rol.nombre === 'Enfermera') return 'ENFERMERA'
    if (['Administrador', 'Cajero', 'Farmacéutico'].includes(rol.nombre)) return 'ADMINISTRATIVO'
    return 'NINGUNO'
  }
  const [formNuevo, setFormNuevo] = useState({
    email: '', password: '', nombre: '', apellido: '',
    cedula: '', telefono: '', rol_id: '', sucursal_id: '',
  })
  const sucursalVacia = {
    nombre: '', nombre_corto: '', lema: '',
    ciudad: 'Tegucigalpa', direccion: '',
    telefono: '', email: '', rtn: '',
    cai: '', fecha_limite: '',
    num_min: '', num_max: '', numero_inicial: '1',
    tercera_edad: '60', cuarta_edad: '80',
    por_descuento_tercera: '0', por_descuento_cuarta: '0',
    tama: '340', letra: '12',
    activo: true,
  }
  const [formSucursal, setFormSucursal] = useState(sucursalVacia)

  const supabase = sb()

  /* ── recargar ─ */
  async function recargar() {
    const [{ data: p }, { data: pr }] = await Promise.all([
      supabase.from('perfiles').select('*, rol:roles(id, nombre, color, es_admin)').order('created_at', { ascending: false }),
      supabase.from('perfil_roles').select('perfil_id, rol_id'),
    ])
    if (p)  setPerfiles(p)
    if (pr) setPerfilRoles(pr)
  }

  /* ── abrir modal roles ─ */
  function abrirModalRoles(perfil: Perfil) {
    setUsuarioRoles(perfil)
    const actuales = perfilRoles.filter(pr => pr.perfil_id === perfil.id).map(pr => pr.rol_id)
    setRolesSeleccionados(actuales)
    setModalRoles(true)
  }

  /* ── guardar roles múltiples ─ */
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

  async function recargarSucs() {
    const { data } = await supabase.from('sucursales').select('*').order('nombre')
    if (data) setSucursales(data)
  }

  /* ── abrir modal editar usuario ─ */
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
      sueldo_fijo: String(perfil.sueldo_fijo ?? ''),
      tipo_nomina: perfil.tipo_nomina || inferirTipoNomina(String(perfil.rol_id || '')),
    })
    setModalUsuario(true)
  }

  /* ── guardar usuario ─ */
  async function guardarUsuario() {
    if (!perfilActual) return
    const { error } = await supabase.from('perfiles').update({
      nombre:      formUsuario.nombre      || null,
      apellido:    formUsuario.apellido    || null,
      cedula:      formUsuario.cedula      || null,
      telefono:    formUsuario.telefono    || null,
      rol_id:      formUsuario.rol_id      ? Number(formUsuario.rol_id)      : null,
      sucursal_id: formUsuario.sucursal_id ? Number(formUsuario.sucursal_id) : null,
      activo:      formUsuario.activo,
      sueldo_fijo: formUsuario.sueldo_fijo ? Number(formUsuario.sueldo_fijo) : 0,
      tipo_nomina: formUsuario.tipo_nomina || 'NINGUNO',
    }).eq('id', perfilActual.id)
    if (error) return alert('Error al guardar usuario: ' + error.message)
    setModalUsuario(false)
    startTransition(() => { recargar() })
  }

  /* ── toggle activo ─ */
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
    if (!formNuevo.sucursal_id) {
      setErrorNuevo('Debes asignar una sucursal al usuario')
      return
    }
    if (!formNuevo.rol_id) {
      setErrorNuevo('Debes asignar un rol al usuario')
      return
    }
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
    if (result.error) {
      setErrorNuevo(result.error)
    } else {
      setOkNuevo(
        'aviso' in result && result.aviso
          ? `✓ Usuario creado. ${result.aviso}`
          : '✓ Usuario creado correctamente'
      )
      setFormNuevo({ email: '', password: '', nombre: '', apellido: '', cedula: '', telefono: '', rol_id: '', sucursal_id: '' })
      startTransition(() => { recargar() })
      setTimeout(() => { setModalNuevo(false); setOkNuevo('') }, 'aviso' in result && result.aviso ? 8000 : 1500)
    }
  }

  /* ── guardar sucursal ─ */
  async function guardarSucursal() {
    setErrorSuc('')
    if (!formSucursal.nombre.trim()) {
      setErrorSuc('El nombre de la sucursal es obligatorio')
      return
    }
    setLoadingSuc(true)
    const payload = { ...formSucursal }
    let error
    if (sucursalActual) {
      const res = await supabase.from('sucursales').update(payload).eq('id', sucursalActual.id)
      error = res.error
    } else {
      const res = await supabase.from('sucursales').insert(payload)
      error = res.error
    }
    setLoadingSuc(false)
    if (error) {
      setErrorSuc(error.message)
      return
    }
    setModalSucursal(false)
    setSucursalActual(null)
    setFormSucursal(sucursalVacia)
    startTransition(() => { recargarSucs() })
  }

  /* ── CRUD Servicios ── */
  async function guardarServicio() {
    if (!formServicio.nombre.trim()) return
    setGuardandoServ(true)
    const supabase = sb()
    const payload = {
      nombre:      formServicio.nombre.trim(),
      tipo:        formServicio.tipo || 'General',
      descripcion: formServicio.descripcion || null,
      precio:      parseFloat(formServicio.precio) || 0,
    }
    if (servicioActual) {
      await supabase.from('servicios').update(payload).eq('id', servicioActual.id)
    } else {
      await supabase.from('servicios').insert({ ...payload, activo: true })
    }
    const { data } = await supabase.from('servicios').select('*').order('nombre')
    if (data) setServicios(data)
    setGuardandoServ(false)
    setModalServicio(false)
    setServicioActual(null)
    setFormServicio({ nombre: '', tipo: 'General', descripcion: '', precio: '' })
  }

  async function toggleServicio(id: number, activo: boolean) {
    const serv = servicios.find(s => s.id === id)
    if (!serv) return
    if (activo) {
      const { confirmed } = await confirmDialog({
        title: 'Desactivar servicio',
        message: `¿Está seguro que desea desactivar el servicio "${serv.nombre}"?`,
        variant: 'warning',
        confirmLabel: 'Desactivar',
      })
      if (!confirmed) return
    }
    const supabase = sb()
    const { error } = await supabase.from('servicios').update({ activo }).eq('id', id)
    if (error) return alert('Error: ' + error.message)
    setServicios(prev => prev.map(s => s.id === id ? { ...s, activo } : s))
  }

  /* stats */
  const activos   = perfiles.filter(p => p.activo).length
  const inactivos = perfiles.filter(p => !p.activo).length

  /* ═══════════════ JSX ════════════════════════════════════ */
  return (
    <ModuleShell tint="violet">
      <ModuleHero
        title="Configuración"
        subtitle="Usuarios, roles, sucursales y parámetros del sistema"
        badge="Administración"
        icon={Settings}
        gradient="violet"
        kpis={[
          { label: 'Usuarios', value: perfiles.length, icon: Users },
          { label: 'Activos', value: activos, icon: UserCheck },
          { label: 'Inactivos', value: inactivos, icon: XCircle },
          { label: 'Roles', value: roles.length, icon: Shield },
        ]}
        actions={
          <ModuleBtnGhost onClick={() => startTransition(() => { recargar(); recargarSucs() })}>
            <RefreshCw className={`w-4 h-4 ${isPending ? 'animate-spin' : ''}`} />
            Actualizar
          </ModuleBtnGhost>
        }
      />
      <ModuleContent>

      {/* tabs */}
      <div className="bg-white rounded-xl border">
        <div className="flex border-b overflow-x-auto">
          {([
            { key: 'usuarios',   label: `Usuarios (${perfiles.length})`,      icon: Users },
            { key: 'roles',      label: `Roles (${roles.length})`,            icon: Shield },
            { key: 'sucursales', label: `Sucursales (${sucursales.length})`,  icon: Building2 },
            { key: 'servicios',  label: `Servicios (${servicios.length})`,    icon: Stethoscope },
            { key: 'permisos',   label: 'Permisos por Rol',                   icon: Lock       },
            { key: 'seguridad',  label: `Accesos (${accesoLogs.length})`,     icon: ShieldAlert },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4">

          {/* ══ TAB USUARIOS ══ */}
          {tab === 'usuarios' && (
            <div className="space-y-3">
              {esSuperAdmin && (
                <div className="flex justify-end">
                  <button onClick={() => { setErrorNuevo(''); setOkNuevo(''); setModalNuevo(true) }}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                    <UserPlus className="w-4 h-4" /> Nuevo Usuario
                  </button>
                </div>
              )}
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
                      <tr>
                        <td colSpan={7} className="text-center py-10 text-gray-400">
                          No hay usuarios registrados aún
                        </td>
                      </tr>
                    )}
                    {perfiles.map(p => (
                      <tr key={p.id} className={`hover:bg-gray-50 ${!p.activo ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                              {(p.nombre?.[0] || '?').toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                {p.nombre || '—'} {p.apellido || ''}
                              </p>
                              <p className="text-xs text-gray-400 font-mono">{p.id.slice(0, 8)}…</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{p.cedula || '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{p.telefono || '—'}</td>
                        <td className="px-4 py-3">
                          <div className="space-y-1.5">
                            {/* Roles asignados */}
                            <div className="flex flex-wrap gap-1">
                              {perfilRoles
                                .filter(pr => pr.perfil_id === p.id)
                                .map(pr => {
                                  const r = roles.find(r => r.id === pr.rol_id)
                                  if (!r) return null
                                  return (
                                    <span key={r.id}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                                      style={{ backgroundColor: r.color + '20', color: r.color }}>
                                      {r.es_admin && <Crown className="w-2.5 h-2.5" />}
                                      {r.nombre}
                                    </span>
                                  )
                                })
                              }
                              {perfilRoles.filter(pr => pr.perfil_id === p.id).length === 0 && (
                                <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">Sin rol</span>
                              )}
                            </div>
                            {/* Botón asignar */}
                            <button onClick={() => abrirModalRoles(p)}
                              className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline">
                              <Shield className="w-3 h-3" /> Asignar roles
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {sucursales.find(s => s.id === p.sucursal_id)?.nombre || '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {p.activo
                            ? <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">Activo</span>
                            : <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs">Inactivo</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => abrirEditar(p)}
                              className="p-1.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100" title="Editar">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => toggleActivo(p)}
                              className={`p-1.5 rounded ${p.activo ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                              title={p.activo ? 'Desactivar' : 'Activar'}>
                              {p.activo ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══ TAB ROLES ══ */}
          {tab === 'roles' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {roles.map(rol => {
                  const usuariosRol = perfiles.filter(p => p.rol_id === rol.id).length
                  return (
                    <div key={rol.id} className="border rounded-xl p-4 hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: rol.color }} />
                          <h3 className="font-semibold text-gray-900">{rol.nombre}</h3>
                          {rol.es_super_admin && (
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-medium flex items-center gap-0.5">
                              <Crown className="w-3 h-3" /> Super Admin
                            </span>
                          )}
                          {rol.es_admin && !rol.es_super_admin && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded font-medium flex items-center gap-0.5">
                              <Crown className="w-3 h-3" /> Admin
                            </span>
                          )}
                        </div>
                      </div>
                      {rol.descripcion && (
                        <p className="text-sm text-gray-500 mb-3">{rol.descripcion}</p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Users className="w-3.5 h-3.5" />
                        {usuariosRol} usuario{usuariosRol !== 1 ? 's' : ''} con este rol
                      </div>
                      {/* módulos con acceso */}
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-gray-400 mb-2">Módulos:</p>
                        <div className="flex flex-wrap gap-1">
                          {modulos.slice(0, 5).map(m => (
                            <span key={m.id} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                              {m.nombre}
                            </span>
                          ))}
                          {modulos.length > 5 && (
                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
                              +{modulos.length - 5} más
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* SQL hint */}
              <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700 border border-blue-200">
                <p className="font-medium mb-1 flex items-center gap-2">
                  <Settings className="w-4 h-4" /> Para gestionar permisos por rol
                </p>
                <p className="text-xs text-blue-600">
                  Los permisos detallados (qué puede ver/crear/editar cada rol) se gestionan desde 
                  <strong> Supabase → SQL Editor</strong> usando las tablas <code>rol_permisos</code> y <code>permisos</code>.
                  Próximamente tendrá interfaz visual aquí.
                </p>
              </div>
            </div>
          )}

          {/* ══ TAB SUCURSALES ══ */}
          {tab === 'sucursales' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button onClick={() => {
                  setSucursalActual(null)
                  setFormSucursal(sucursalVacia)
                  setErrorSuc('')
                  setModalSucursal(true)
                }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
                  <Plus className="w-4 h-4" /> Nueva Sucursal
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {sucursales.map(s => (
                  <div key={s.id} className={`border rounded-xl p-4 ${!s.activo ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="p-2 bg-blue-50 rounded-lg">
                          <Building2 className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">{s.nombre}</h3>
                          <p className="text-xs text-gray-400">{s.ciudad || 'Tegucigalpa'}</p>
                        </div>
                      </div>
                      <button onClick={() => {
                        setSucursalActual(s)
                        setErrorSuc('')
                        setFormSucursal({
                          nombre:               s.nombre             || '',
                          nombre_corto:         s.nombre_corto       || '',
                          lema:                 s.lema               || '',
                          ciudad:               s.ciudad             || 'Tegucigalpa',
                          direccion:            s.direccion          || '',
                          telefono:             s.telefono           || '',
                          email:                s.email              || '',
                          rtn:                  s.rtn                || '',
                          cai:                  s.cai                || '',
                          fecha_limite:         s.fecha_limite       || '',
                          num_min:              s.num_min            || '',
                          num_max:              s.num_max            || '',
                          numero_inicial:       String(s.numero_inicial   ?? 1),
                          tercera_edad:         String(s.tercera_edad     ?? 60),
                          cuarta_edad:          String(s.cuarta_edad      ?? 80),
                          por_descuento_tercera:String(s.por_descuento_tercera ?? 0),
                          por_descuento_cuarta: String(s.por_descuento_cuarta  ?? 0),
                          tama:                 s.tama               || '340',
                          letra:                s.letra              || '12',
                          activo:               s.activo,
                        })
                        setModalSucursal(true)
                      }} className="p-1.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-gray-500">
                      {s.rtn && <p><span className="font-medium text-gray-600">RTN:</span> {s.rtn}</p>}
                      {s.cai && <p className="truncate"><span className="font-medium text-gray-600">CAI:</span> {s.cai}</p>}
                      {s.fecha_limite && (
                        <p><span className="font-medium text-gray-600">Límite CAI:</span>{' '}
                          <span className={new Date(s.fecha_limite) < new Date() ? 'text-red-600 font-semibold' : ''}>
                            {s.fecha_limite}
                          </span>
                        </p>
                      )}
                      {s.num_min && <p><span className="font-medium text-gray-600">Rango:</span> {s.num_min} → {s.num_max}</p>}
                    </div>
                    <div className="mt-2">
                      {s.activo
                        ? <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Activa</span>
                        : <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">Inactiva</span>
                      }
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══ TAB SERVICIOS ══ */}
          {tab === 'servicios' && (
            <div>
              <div className="flex items-center justify-between p-4 border-b">
                <p className="text-sm text-gray-600">{servicios.filter(s => s.activo).length} activos · {servicios.filter(s => !s.activo).length} inactivos</p>
                <button
                  onClick={() => { setServicioActual(null); setFormServicio({ nombre: '', tipo: 'General', descripcion: '', precio: '' }); setModalServicio(true) }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm rounded-lg font-semibold transition"
                >
                  <Plus className="w-4 h-4" /> Nuevo Servicio
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                      <th className="px-4 py-3 text-left">Nombre</th>
                      <th className="px-4 py-3 text-left">Tipo</th>
                      <th className="px-4 py-3 text-right">Precio</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                      <th className="px-4 py-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {servicios.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-10 text-gray-400">Sin servicios registrados</td></tr>
                    )}
                    {servicios.map(s => (
                      <tr key={s.id} className={`hover:bg-gray-50 ${!s.activo ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{s.nombre}</p>
                          {s.descripcion && <p className="text-xs text-gray-400">{s.descripcion}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{s.tipo}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">L {Number(s.precio).toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          {s.activo
                            ? <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Activo</span>
                            : <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">Inactivo</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => {
                                setServicioActual(s)
                                setFormServicio({ nombre: s.nombre, tipo: s.tipo || 'General', descripcion: s.descripcion || '', precio: String(s.precio) })
                                setModalServicio(true)
                              }}
                              className="p-1.5 rounded-lg hover:bg-blue-100 text-blue-600 transition"
                              title="Editar"
                            ><Edit2 className="w-3.5 h-3.5" /></button>
                            <button
                              onClick={() => toggleServicio(s.id, !s.activo)}
                              className={`p-1.5 rounded-lg transition ${s.activo ? 'hover:bg-red-100 text-red-500' : 'hover:bg-green-100 text-green-600'}`}
                              title={s.activo ? 'Desactivar' : 'Activar'}
                            >
                              {s.activo ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════════ MODAL SERVICIO ══════════ */}
      {modalServicio && (
        <Modal title={servicioActual ? 'Editar Servicio' : 'Nuevo Servicio'} onClose={() => setModalServicio(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                value={formServicio.nombre}
                onChange={e => setFormServicio(p => ({ ...p, nombre: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                placeholder="Ej: Inyección Intramuscular"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo / Categoría</label>
                <select
                  value={formServicio.tipo}
                  onChange={e => setFormServicio(p => ({ ...p, tipo: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  {['Consulta','General','Inyectable','Curación','Procedimiento','Cirugía Menor','Control','Diagnóstico','Laboratorio','Documento','Otro'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio (L) *</label>
                <input
                  type="number" min="0" step="0.01"
                  value={formServicio.precio}
                  onChange={e => setFormServicio(p => ({ ...p, precio: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
              <input
                value={formServicio.descripcion}
                onChange={e => setFormServicio(p => ({ ...p, descripcion: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                placeholder="Descripción breve..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalServicio(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button
                onClick={guardarServicio}
                disabled={guardandoServ || !formServicio.nombre.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition"
              >
                <Save className="w-4 h-4" /> {guardandoServ ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══ TAB PERMISOS ══ */}
      {tab === 'permisos' && (() => {
        // módulos ordenados
        const mods = [...modulos].sort((a, b) => a.orden - b.orden)
        // Super Admin: acceso total fijo. Resto de roles (incl. Administrador): permisos editables
        const rolSuper  = roles.find(r => r.es_super_admin)
        const rolesEdit = roles.filter(r => !r.es_super_admin)

        // helper: tiene permiso 'ver' el rol para ese módulo
        function tienePerm(rolId: number, moduloClave: string) {
          const mod = modulos.find(m => m.clave === moduloClave)
          if (!mod) return false
          const perm = permisos.find(p => p.modulo_id === mod.id && p.accion === 'ver')
          if (!perm) return false
          return rolPermisos.some(rp => rp.rol_id === rolId && rp.permiso_id === perm.id)
        }

        async function togglePerm(rolId: number, moduloClave: string, activo: boolean) {
          if (!esSuperAdmin) return alert('Solo el Super Administrador puede modificar permisos.')
          const mod  = modulos.find(m => m.clave === moduloClave)
          if (!mod) return
          const perm = permisos.find(p => p.modulo_id === mod.id && p.accion === 'ver')
          if (!perm) return
          const rolNombre = roles.find(r => r.id === rolId)?.nombre || 'este rol'
          if (activo) {
            const { confirmed } = await confirmDialog({
              title: 'Revocar acceso',
              message: `¿Revocar acceso al módulo "${mod.nombre}" para ${rolNombre}?`,
              variant: 'warning',
              confirmLabel: 'Revocar',
            })
            if (!confirmed) return
          }
          setGuardandoPerm(true)
          const supabase = sb()
          if (activo) {
            const { error } = await supabase.from('rol_permisos').delete()
              .eq('rol_id', rolId).eq('permiso_id', perm.id)
            if (error) { alert('Error: ' + error.message); setGuardandoPerm(false); return }
            setRolPermisos(prev => prev.filter(rp => !(rp.rol_id === rolId && rp.permiso_id === perm.id)))
          } else {
            const { error } = await supabase.from('rol_permisos').insert({ rol_id: rolId, permiso_id: perm.id })
            if (error) { alert('Error: ' + error.message); setGuardandoPerm(false); return }
            setRolPermisos(prev => [...prev, { rol_id: rolId, permiso_id: perm.id }])
          }
          setGuardandoPerm(false)
        }

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800">Acceso por Módulo</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  El Super Administrador tiene acceso total. Los demás roles (incluido Administrador) solo ven los módulos que actives aquí.
                </p>
              </div>
              {guardandoPerm && <span className="text-xs text-blue-500 animate-pulse">Guardando...</span>}
            </div>

            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-3 font-medium text-gray-700 w-40">Módulo</th>
                    {/* Super Administrador */}
                    {rolSuper && (
                      <th className="text-center px-3 py-3 min-w-[100px]">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-xs font-semibold text-blue-700">👑 {rolSuper.nombre}</span>
                          <span className="text-[10px] text-gray-400">Acceso total</span>
                        </div>
                      </th>
                    )}
                    {rolesEdit.map(r => (
                      <th key={r.id} className="text-center px-3 py-3 min-w-[100px]">
                        <span className="text-xs font-semibold" style={{ color: r.color }}>{r.nombre}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {mods.map(mod => (
                    <tr key={mod.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800 text-sm">{mod.nombre}</td>
                      {/* Super Admin siempre ✅ */}
                      {rolSuper && (
                        <td className="text-center px-3 py-3">
                          <CheckCircle2 className="w-5 h-5 text-blue-500 mx-auto" />
                        </td>
                      )}
                      {rolesEdit.map(r => {
                        const activo = tienePerm(r.id, mod.clave)
                        return (
                          <td key={r.id} className="text-center px-3 py-3">
                            <button
                              onClick={() => togglePerm(r.id, mod.clave, activo)}
                              className={`w-9 h-9 rounded-lg border-2 flex items-center justify-center mx-auto transition-all ${
                                activo
                                  ? 'bg-green-50 border-green-400 text-green-600 hover:bg-green-100'
                                  : 'bg-gray-50 border-gray-200 text-gray-300 hover:border-gray-300'
                              }`}
                              title={activo ? 'Quitar acceso' : 'Dar acceso'}
                            >
                              {activo ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-4 text-xs text-gray-500 bg-gray-50 rounded-xl px-4 py-3">
              <span className="flex items-center gap-1.5"><Unlock className="w-3.5 h-3.5 text-green-500" /> Con acceso</span>
              <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5 text-gray-400" /> Sin acceso</span>
              <span className="text-gray-400">· Los cambios se guardan automáticamente al hacer clic.</span>
            </div>
          </div>
        )
      })()}

          {/* ══ TAB SEGURIDAD ══ */}
          {tab === 'seguridad' && (() => {
            const logins   = accesoLogs.filter(l => l.accion === 'login')
            const logouts  = accesoLogs.filter(l => l.accion === 'logout')
            const timeouts = accesoLogs.filter(l => l.accion === 'timeout')

            function iconAccion(accion: string) {
              if (accion === 'login')   return <LogIn  className="w-3.5 h-3.5 text-green-500" />
              if (accion === 'logout')  return <LogOut className="w-3.5 h-3.5 text-slate-500" />
              return <Clock className="w-3.5 h-3.5 text-amber-500" />
            }
            function bgAccion(accion: string) {
              if (accion === 'login')   return 'bg-green-50 text-green-700'
              if (accion === 'logout')  return 'bg-slate-100 text-slate-600'
              return 'bg-amber-50 text-amber-700'
            }

            return (
              <div className="space-y-4">
                {/* KPIs */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Inicios de sesión', val: logins.length,   color: 'text-green-600', bg: 'bg-green-50', icon: <LogIn  className="w-5 h-5 text-green-500" /> },
                    { label: 'Cierres de sesión', val: logouts.length,  color: 'text-slate-600', bg: 'bg-slate-100', icon: <LogOut className="w-5 h-5 text-slate-500" /> },
                    { label: 'Expiradas (30 min)',val: timeouts.length,  color: 'text-amber-600', bg: 'bg-amber-50',  icon: <Clock  className="w-5 h-5 text-amber-500" /> },
                  ].map(k => (
                    <div key={k.label} className={`${k.bg} rounded-xl p-4 flex items-center gap-3`}>
                      {k.icon}
                      <div>
                        <p className={`text-xl font-bold ${k.color}`}>{k.val}</p>
                        <p className="text-xs text-slate-500">{k.label}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Tabla de logs */}
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                      <tr>
                        <th className="px-4 py-3 text-left">Usuario</th>
                        <th className="px-4 py-3 text-left">Acción</th>
                        <th className="px-4 py-3 text-left">Fecha y hora</th>
                        <th className="px-4 py-3 text-left">IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {accesoLogs.length === 0 ? (
                        <tr><td colSpan={4} className="text-center py-8 text-slate-400">Sin registros de acceso aún</td></tr>
                      ) : accesoLogs.map(log => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-800">{log.email ?? '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${bgAccion(log.accion)}`}>
                              {iconAccion(log.accion)}
                              {log.accion === 'login' ? 'Inicio de sesión' : log.accion === 'logout' ? 'Cierre de sesión' : 'Sesión expirada'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {new Date(log.created_at).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' })}
                          </td>
                          <td className="px-4 py-3 text-slate-400 font-mono text-xs">{log.ip ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-400">Mostrando los últimos 200 registros.</p>
              </div>
            )
          })()}

      {/* ══════════ MODAL EDITAR USUARIO ══════════ */}
      {modalUsuario && perfilActual && (
        <Modal title="Editar Perfil de Usuario" onClose={() => setModalUsuario(false)}>
          <div className="space-y-4">
            {/* ID de referencia */}
            <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500 font-mono break-all">
              ID: {perfilActual.id}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input value={formUsuario.nombre}
                  onChange={e => setFormUsuario(p => ({ ...p, nombre: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Apellido</label>
                <input value={formUsuario.apellido}
                  onChange={e => setFormUsuario(p => ({ ...p, apellido: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cédula / DNI</label>
                <input value={formUsuario.cedula}
                  onChange={e => setFormUsuario(p => ({ ...p, cedula: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input value={formUsuario.telefono}
                  onChange={e => setFormUsuario(p => ({ ...p, telefono: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo nómina</label>
                <select value={formUsuario.tipo_nomina}
                  onChange={e => setFormUsuario(p => ({ ...p, tipo_nomina: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="NINGUNO">Ninguno</option>
                  <option value="MEDICO">Médico (comisiones)</option>
                  <option value="ENFERMERA">Enfermera (sueldo fijo)</option>
                  <option value="ADMINISTRATIVO">Administrativo (sueldo fijo)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sueldo mensual (L.)</label>
                <input type="number" min="0" step="0.01" value={formUsuario.sueldo_fijo}
                  onChange={e => setFormUsuario(p => ({ ...p, sueldo_fijo: e.target.value }))}
                  placeholder="0.00"
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
                <p className="text-xs text-gray-400 mt-1">Solo enfermeras y administrativos</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol *</label>
              <select value={formUsuario.rol_id}
                onChange={e => {
                  const rolId = e.target.value
                  setFormUsuario(p => ({
                    ...p,
                    rol_id: rolId,
                    tipo_nomina: p.tipo_nomina === 'NINGUNO' ? inferirTipoNomina(rolId) : p.tipo_nomina,
                  }))
                }}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                <option value="">— Sin rol —</option>
                {roles.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.es_admin ? '👑 ' : ''}{r.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sucursal</label>
              <select value={formUsuario.sucursal_id}
                onChange={e => setFormUsuario(p => ({ ...p, sucursal_id: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                <option value="">— Sin sucursal —</option>
                {sucursales.filter(s => s.activo).map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <input type="checkbox" id="activo" checked={formUsuario.activo}
                onChange={e => setFormUsuario(p => ({ ...p, activo: e.target.checked }))}
                className="rounded" />
              <label htmlFor="activo" className="text-sm text-gray-700">Usuario activo</label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalUsuario(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={guardarUsuario}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
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
            {/* info usuario */}
            <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-bold">
                {(usuarioRoles.nombre?.[0] || '?').toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-gray-900">
                  {usuarioRoles.nombre} {usuarioRoles.apellido}
                </p>
                <p className="text-xs text-gray-400 font-mono">{usuarioRoles.id.slice(0, 16)}…</p>
              </div>
            </div>

            <p className="text-sm text-gray-600">
              Selecciona uno o varios roles. El usuario tendrá acceso a los módulos de <strong>todos</strong> los roles marcados.
            </p>

            {/* checkboxes de roles */}
            <div className="space-y-2">
              {roles.map(r => {
                const seleccionado = rolesSeleccionados.includes(r.id)
                return (
                  <label key={r.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                      seleccionado ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}>
                    <input type="checkbox" checked={seleccionado}
                      onChange={e => setRolesSeleccionados(prev =>
                        e.target.checked ? [...prev, r.id] : prev.filter(id => id !== r.id)
                      )}
                      className="w-4 h-4 rounded" />
                    <div className="flex items-center gap-2 flex-1">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.color }} />
                      <div>
                        <p className="font-medium text-sm text-gray-900 flex items-center gap-1">
                          {r.es_admin && <Crown className="w-3.5 h-3.5 text-amber-500" />}
                          {r.nombre}
                        </p>
                        {r.descripcion && (
                          <p className="text-xs text-gray-400">{r.descripcion}</p>
                        )}
                      </div>
                    </div>
                    {seleccionado && (
                      <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
                    )}
                  </label>
                )
              })}
            </div>

            {rolesSeleccionados.length > 0 && (
              <div className="bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-700">
                <span className="font-medium">{rolesSeleccionados.length} rol(es) seleccionado(s):</span>{' '}
                {rolesSeleccionados.map(id => roles.find(r => r.id === id)?.nombre).join(', ')}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalRoles(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={guardarRoles}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
                <Save className="w-4 h-4 inline mr-1" /> Guardar Roles
              </button>
            </div>
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
                <input type="email" value={formNuevo.email}
                  onChange={e => setFormNuevo(p => ({ ...p, email: e.target.value }))}
                  placeholder="usuario@clinica.com"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña *</label>
                <input type="password" value={formNuevo.password}
                  onChange={e => setFormNuevo(p => ({ ...p, password: e.target.value }))}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                <input value={formNuevo.nombre}
                  onChange={e => setFormNuevo(p => ({ ...p, nombre: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Apellido</label>
                <input value={formNuevo.apellido}
                  onChange={e => setFormNuevo(p => ({ ...p, apellido: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cédula / DNI</label>
                <input value={formNuevo.cedula}
                  onChange={e => setFormNuevo(p => ({ ...p, cedula: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input value={formNuevo.telefono}
                  onChange={e => setFormNuevo(p => ({ ...p, telefono: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rol <span className="text-red-500">*</span>
              </label>
              <select value={formNuevo.rol_id}
                onChange={e => setFormNuevo(p => ({ ...p, rol_id: e.target.value }))}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none ${!formNuevo.rol_id ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}>
                <option value="">— Selecciona rol —</option>
                {roles.filter(r => !r.es_super_admin).map(r => (
                  <option key={r.id} value={r.id}>{r.es_admin ? '👑 ' : ''}{r.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sucursal <span className="text-red-500">*</span>
              </label>
              <select value={formNuevo.sucursal_id}
                onChange={e => setFormNuevo(p => ({ ...p, sucursal_id: e.target.value }))}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none ${!formNuevo.sucursal_id ? 'border-red-300 bg-red-50' : 'border-gray-300'}`}>
                <option value="">— Selecciona sucursal —</option>
                {sucursales.filter(s => s.activo).map(s => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setModalNuevo(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={handleCrearUsuario}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
                <UserPlus className="w-4 h-4 inline mr-1" /> Crear Usuario
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ══════════ MODAL SUCURSAL ══════════ */}
      {modalSucursal && (
        <Modal title={sucursalActual ? 'Editar Sucursal' : 'Nueva Sucursal'} onClose={() => { setModalSucursal(false); setErrorSuc('') }}>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">

            {/* ── Datos generales ── */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Datos Generales</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                  <input value={formSucursal.nombre}
                    onChange={e => setFormSucursal(p => ({ ...p, nombre: e.target.value }))}
                    placeholder="Clínica Jerusalén — Sucursal Central"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre corto</label>
                    <input value={formSucursal.nombre_corto}
                      onChange={e => setFormSucursal(p => ({ ...p, nombre_corto: e.target.value }))}
                      placeholder="Central"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                    <input value={formSucursal.ciudad}
                      onChange={e => setFormSucursal(p => ({ ...p, ciudad: e.target.value }))}
                      placeholder="Tegucigalpa"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lema / encabezado factura</label>
                  <input value={formSucursal.lema}
                    onChange={e => setFormSucursal(p => ({ ...p, lema: e.target.value }))}
                    placeholder="Tu Salud, Nuestra Misión"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
                  <input value={formSucursal.direccion}
                    onChange={e => setFormSucursal(p => ({ ...p, direccion: e.target.value }))}
                    placeholder="Col. Palmira, Blvd. Morazán, Tegucigalpa"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                    <input value={formSucursal.telefono}
                      onChange={e => setFormSucursal(p => ({ ...p, telefono: e.target.value }))}
                      placeholder="2200-0000"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Correo</label>
                    <input type="email" value={formSucursal.email}
                      onChange={e => setFormSucursal(p => ({ ...p, email: e.target.value }))}
                      placeholder="sucursal@clinica.com"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Datos fiscales (Honduras SAR) ── */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Datos Fiscales (SAR Honduras)</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">RTN</label>
                    <input value={formSucursal.rtn}
                      onChange={e => setFormSucursal(p => ({ ...p, rtn: e.target.value }))}
                      placeholder="08011999000000"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha límite CAI</label>
                    <input type="date" value={formSucursal.fecha_limite}
                      onChange={e => setFormSucursal(p => ({ ...p, fecha_limite: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CAI</label>
                  <input value={formSucursal.cai}
                    onChange={e => setFormSucursal(p => ({ ...p, cai: e.target.value }))}
                    placeholder="48BFE5-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rango inicial</label>
                    <input value={formSucursal.num_min}
                      onChange={e => setFormSucursal(p => ({ ...p, num_min: e.target.value }))}
                      placeholder="001-001-01-00064901"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Rango final</label>
                    <input value={formSucursal.num_max}
                      onChange={e => setFormSucursal(p => ({ ...p, num_max: e.target.value }))}
                      placeholder="001-001-01-00069900"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Número inicial de facturación</label>
                  <input type="number" min="1" value={formSucursal.numero_inicial}
                    onChange={e => setFormSucursal(p => ({ ...p, numero_inicial: e.target.value }))}
                    placeholder="64901"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                  <p className="text-xs text-gray-400 mt-1">Correlativo desde donde comienza la facturación</p>
                </div>
              </div>
            </div>

            {/* ── Descuentos por edad ── */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Descuentos por Edad</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Edad mínima 3ra edad (años)</label>
                  <input type="number" min="0" value={formSucursal.tercera_edad}
                    onChange={e => setFormSucursal(p => ({ ...p, tercera_edad: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">% Descuento 3ra edad</label>
                  <input type="number" min="0" max="100" step="0.01" value={formSucursal.por_descuento_tercera}
                    onChange={e => setFormSucursal(p => ({ ...p, por_descuento_tercera: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Edad mínima 4ta edad (años)</label>
                  <input type="number" min="0" value={formSucursal.cuarta_edad}
                    onChange={e => setFormSucursal(p => ({ ...p, cuarta_edad: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">% Descuento 4ta edad</label>
                  <input type="number" min="0" max="100" step="0.01" value={formSucursal.por_descuento_cuarta}
                    onChange={e => setFormSucursal(p => ({ ...p, por_descuento_cuarta: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
              </div>
            </div>

            {/* ── Estado ── */}
            <div className="flex items-center gap-2 pt-1">
              <input type="checkbox" id="suc_activo" checked={formSucursal.activo}
                onChange={e => setFormSucursal(p => ({ ...p, activo: e.target.checked }))}
                className="rounded" />
              <label htmlFor="suc_activo" className="text-sm text-gray-700">Sucursal activa</label>
            </div>

            {errorSuc && (
              <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2 border border-red-200">
                <AlertCircle className="w-4 h-4 shrink-0" /> {errorSuc}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => { setModalSucursal(false); setErrorSuc('') }}
                className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button onClick={guardarSucursal} disabled={loadingSuc}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-60 flex items-center gap-2">
                {loadingSuc
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Guardando...</>
                  : <><Save className="w-4 h-4" /> {sucursalActual ? 'Actualizar' : 'Crear'}</>
                }
              </button>
            </div>
          </div>
        </Modal>
      )}
      </ModuleContent>
    </ModuleShell>
  )
}

/* ── Selector de Rol inline ── */
function RolSelector({ perfilId, rolActual, roles, onCambio }: {
  perfilId: string
  rolActual?: number
  roles: Rol[]
  onCambio: () => void
}) {
  const [valor, setValor]       = useState(String(rolActual || ''))
  const [saving, setSaving]     = useState(false)
  const [saved,  setSaved]      = useState(false)
  const supabase = sb()

  const rol = roles.find(r => r.id === Number(valor))

  async function cambiar(nuevoId: string) {
    setValor(nuevoId)
    setSaving(true)
    setSaved(false)
    await supabase
      .from('perfiles')
      .update({ rol_id: nuevoId ? Number(nuevoId) : null })
      .eq('id', perfilId)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    onCambio()
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={valor}
        onChange={e => cambiar(e.target.value)}
        disabled={saving}
        className="border rounded-lg px-2 py-1 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white"
        style={rol ? { borderColor: rol.color, color: rol.color } : {}}
      >
        <option value="">— Sin rol —</option>
        {roles.map(r => (
          <option key={r.id} value={r.id}>
            {r.es_admin ? '👑 ' : ''}{r.nombre}
          </option>
        ))}
      </select>

      {saving && (
        <RefreshCw className="w-3.5 h-3.5 text-gray-400 animate-spin" />
      )}
      {saved && !saving && (
        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
      )}
    </div>
  )
}

/* ── Modal genérico ── */
function Modal({ title, children, onClose }: {
  title: string; children: React.ReactNode; onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-4 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}
