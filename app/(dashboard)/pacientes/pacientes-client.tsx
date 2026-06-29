'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Search, Plus, Users, UserCheck, Building2,
  Phone, Mail, ChevronRight, Download, CreditCard, FileText, MapPin,
  Sparkles, RefreshCw, Camera, X, Save,
} from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { cn, getInitials } from '@/lib/utils'
import { nombreCompletoPaciente, edadPaciente, textoBusquedaPacienteFull, exportarPacientesCsv, normalizarCodigoPaciente } from '@/lib/paciente-utils'
import { buscarPacienteDuplicado, mensajePacienteDuplicado, type PacienteDuplicado } from '@/lib/paciente-duplicado'
import { subirFotoPaciente } from '@/lib/paciente-foto'
import ColoniaSelect, { type Colonia } from '@/components/colonia-select'
import PacienteExitoPanel from '@/components/paciente-exito-panel'

interface Paciente {
  id: number
  codigo: string
  tipo: string
  nombre: string | null
  apellido1: string | null
  apellido2: string | null
  nombre_empresa: string | null
  rtn_empresa?: string | null
  contacto?: string | null
  responsable?: string | null
  telefono: string | null
  celular: string | null
  correo: string | null
  fecha_nac: string | null
  genero: string | null
  grupo_sanguineo: string | null
  puntos: number
  activo: boolean
  lista_id: number | null
  created_at: string
  foto_url?: string | null
  colonia_id?: number | null
  listas_precio: { nombre: string } | null
  colonias?: { id: number; nombre: string } | null
}

interface Lista { id: number; nombre: string }

interface Props {
  pacientes:     Paciente[]
  listas:        Lista[]
  colonias:      Colonia[]
  membresiasMap: Record<number, { tipo: string; fecha_fin: string; numero_carnet?: string }>
}

export default function PacientesClient({ pacientes, listas, colonias, membresiasMap }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [search,       setSearch]       = useState('')
  const [tipoFiltro,   setTipoFiltro]   = useState<'todos' | 'persona' | 'empresa'>('todos')
  const [filtroMem,    setFiltroMem]    = useState<'todos' | 'con_plan' | 'sin_plan'>('todos')
  const [verInactivos, setVerInactivos] = useState(false)
  const [showModal,    setShowModal]    = useState(false)

  const activos = useMemo(() => pacientes.filter(p => verInactivos || p.activo), [pacientes, verInactivos])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return activos.filter((p) => {
      if (tipoFiltro !== 'todos' && p.tipo !== tipoFiltro) return false
      if (filtroMem === 'con_plan' && !membresiasMap[p.id]) return false
      if (filtroMem === 'sin_plan' && membresiasMap[p.id]) return false
      if (!q) return true
      return textoBusquedaPacienteFull(p).includes(q)
    })
  }, [activos, search, tipoFiltro, filtroMem, membresiasMap])

  const stats = useMemo(() => ({
    total: activos.length,
    personas: activos.filter(p => p.tipo === 'persona').length,
    empresas: activos.filter(p => p.tipo === 'empresa').length,
    conPlan: activos.filter(p => !!membresiasMap[p.id]).length,
    conFoto: activos.filter(p => p.foto_url).length,
    inactivos: pacientes.filter(p => !p.activo).length,
  }), [activos, pacientes, membresiasMap])

  function handleExportar() {
    exportarPacientesCsv(filtered.map(p => ({
      codigo: p.codigo,
      tipo: p.tipo,
      nombre: nombreCompletoPaciente(p),
      telefono: p.telefono,
      celular: p.celular,
      correo: p.correo,
      rtn: p.rtn_empresa,
      lista: p.listas_precio?.nombre,
      plan: membresiasMap[p.id]?.tipo,
      grupo_sanguineo: p.grupo_sanguineo,
      activo: p.activo ? 'Sí' : 'No',
    })))
  }

  return (
    <div className="min-h-full min-w-0 w-full overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50/30">

      {/* HERO */}
      <div className="relative overflow-hidden shadow-xl"
        style={{ background: `linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.navyMid} 50%, #002244 100%)` }}>
        <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full opacity-10 bg-white blur-3xl" />
        <div className="absolute -left-10 bottom-0 w-48 h-48 rounded-full opacity-10"
          style={{ backgroundColor: BRAND.gold }} />

        <div className="relative px-4 sm:px-6 py-6 sm:py-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4" style={{ color: BRAND.gold }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                  {BRAND.nombreCorto}
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
                <Users className="w-8 h-8" style={{ color: BRAND.goldLight }} />
                Pacientes
              </h1>
              <p className="text-white/60 text-sm mt-1">
                {colonias.length} colonias · {listas.length} listas de precio
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => startTransition(() => router.refresh())}
                className="px-3 py-2 rounded-xl text-sm text-white/90 bg-white/10 hover:bg-white/20 border border-white/20 flex items-center gap-1.5 backdrop-blur transition">
                <RefreshCw className="w-3.5 h-3.5" /> Actualizar
              </button>
              <Link href="/colonias"
                className="px-3 py-2 rounded-xl text-sm text-white/90 bg-white/10 hover:bg-white/20 border border-white/20 flex items-center gap-1.5 backdrop-blur transition">
                <MapPin className="w-3.5 h-3.5" /> Colonias
              </Link>
              <Link href="/consultas"
                className="px-3 py-2 rounded-xl text-sm text-white/90 bg-white/10 hover:bg-white/20 border border-white/20 flex items-center gap-1.5 backdrop-blur transition">
                <FileText className="w-3.5 h-3.5" /> Consultas
              </Link>
              <button onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] transition"
                style={{ backgroundColor: BRAND.gold, color: BRAND.navy }}>
                <Plus className="w-4 h-4" /> Nuevo Paciente
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mt-5">
            {[
              { label: 'Total', value: stats.total, icon: Users },
              { label: 'Personas', value: stats.personas, icon: UserCheck },
              { label: 'Empresas', value: stats.empresas, icon: Building2 },
              { label: 'Con plan', value: stats.conPlan, icon: CreditCard },
              { label: 'Con foto', value: stats.conFoto, icon: Camera },
              { label: 'Inactivos', value: stats.inactivos, icon: Users },
            ].map(k => (
              <div key={k.label}
                className="rounded-2xl p-3 bg-white/10 backdrop-blur border border-white/15 flex items-center gap-2">
                <k.icon className="w-4 h-4 text-white/60 flex-shrink-0" />
                <div>
                  <p className="text-xl sm:text-2xl font-black text-white leading-none">{k.value}</p>
                  <p className="text-[10px] text-white/50 uppercase tracking-wide mt-0.5">{k.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4 max-w-[1600px] mx-auto w-full">

      {/* Guía rápida */}
      <div className="rounded-2xl border bg-white shadow-sm p-4 sm:p-5">
        <p className="text-sm font-bold mb-2" style={{ color: BRAND.navy }}>Registro de pacientes</p>
        <div className="flex flex-wrap gap-2 text-xs text-gray-600">
          <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800">Sin duplicar cédula/RTN</span>
          <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800">Persona o empresa</span>
          <span className="text-gray-300">→</span>
          <span className="px-2.5 py-1 rounded-full bg-violet-100 text-violet-800">Colonia y contacto</span>
          <span className="text-gray-300">→</span>
          <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">Ficha · antecedentes · foto</span>
          <span className="text-gray-300">→</span>
          <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">Consultas y expediente</span>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            placeholder="Buscar por nombre, cédula, RTN, teléfono, correo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-blue-300 outline-none bg-white shadow-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border bg-white">
            {([['todos', 'Todos'], ['persona', 'Personas'], ['empresa', 'Empresas']] as const).map(([val, label]) => (
              <button key={val} onClick={() => setTipoFiltro(val)}
                className={cn('px-3 py-2 text-sm font-medium transition',
                  tipoFiltro === val ? 'text-white' : 'text-gray-600 hover:bg-gray-50')}
                style={tipoFiltro === val ? { backgroundColor: BRAND.navy } : undefined}>
                {label}
              </button>
            ))}
          </div>
          <select value={filtroMem} onChange={e => setFiltroMem(e.target.value as typeof filtroMem)}
            className="border rounded-xl px-3 py-2 text-sm bg-white focus:outline-none">
            <option value="todos">Todos los planes</option>
            <option value="con_plan">Con plan médico</option>
            <option value="sin_plan">Sin plan</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer px-2 py-2 border rounded-xl bg-white">
            <input type="checkbox" checked={verInactivos} onChange={e => setVerInactivos(e.target.checked)}
              className="rounded border-gray-300 accent-blue-600" />
            Inactivos
          </label>
          <button onClick={handleExportar} disabled={!filtered.length}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-xl bg-white hover:bg-gray-50 disabled:opacity-40">
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
          <p className="text-sm font-medium text-gray-600">
            {filtered.length} paciente{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-12 h-12 text-gray-200 mb-3" />
            <p className="text-sm font-medium text-gray-600">
              {search ? 'Sin resultados para tu búsqueda' : 'No hay pacientes registrados'}
            </p>
            <button onClick={() => setShowModal(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ backgroundColor: BRAND.navy }}>
              <Plus className="w-4 h-4" /> Nuevo Paciente
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((p) => {
              const nombre    = nombreCompletoPaciente(p)
              const edad      = edadPaciente(p.fecha_nac)
              const tel       = p.celular ?? p.telefono
              const membresia = membresiasMap[p.id]
              const borderColor = p.tipo === 'empresa' ? 'border-l-violet-500'
                : p.genero === 'F' ? 'border-l-pink-500' : 'border-l-sky-500'

              return (
                <div
                  key={p.id}
                  onClick={() => router.push(`/pacientes/${p.id}`)}
                  className={cn(
                    'flex items-center gap-4 px-4 sm:px-5 py-4 hover:bg-sky-50/50 cursor-pointer transition group border-l-4',
                    borderColor,
                    !p.activo && 'opacity-55 bg-gray-50/80',
                  )}
                >
                  {/* Avatar / Foto */}
                  <div className="relative flex-shrink-0">
                    {p.foto_url ? (
                      <img src={p.foto_url} alt={nombre}
                        className="w-10 h-10 rounded-full object-cover border-2 border-slate-200" />
                    ) : (
                      <div className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold',
                        p.tipo === 'empresa' ? 'bg-violet-100 text-violet-700'
                          : p.genero === 'F'  ? 'bg-pink-100 text-pink-700'
                          : 'bg-blue-100 text-blue-700'
                      )}>
                        {p.tipo === 'empresa' ? <Building2 className="w-4 h-4" /> : getInitials(nombre)}
                      </div>
                    )}
                    {/* indicador de membresía sobre el avatar */}
                    {membresia && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-amber-400 rounded-full border-2 border-white flex items-center justify-center"
                        title={`Membresía: ${membresia.tipo}`}>
                        <CreditCard className="w-2 h-2 text-white" />
                      </div>
                    )}
                  </div>

                  {/* Info principal */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-800 truncate">{nombre}</p>
                      {p.grupo_sanguineo && (
                        <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded-md font-medium">
                          {p.grupo_sanguineo}
                        </span>
                      )}
                      {membresia && (
                        <span className="flex items-center gap-0.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">
                          <CreditCard className="w-2.5 h-2.5" /> {membresia.tipo}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {p.codigo}
                      {edad !== null && ` · ${edad} años`}
                      {p.listas_precio && ` · ${p.listas_precio.nombre}`}
                      {p.colonias?.nombre && ` · ${p.colonias.nombre}`}
                      {membresia && ` · Vence: ${membresia.fecha_fin}`}
                    </p>
                  </div>

                  {/* Contacto */}
                  <div className="hidden md:flex flex-col items-end gap-0.5">
                    {tel && (
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {tel}
                      </p>
                    )}
                    {p.correo && (
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {p.correo}
                      </p>
                    )}
                  </div>

                  {/* Puntos */}
                  {p.puntos > 0 && (
                    <div className="hidden lg:flex flex-col items-center">
                      <p className="text-sm font-bold text-amber-600">{p.puntos}</p>
                      <p className="text-[10px] text-slate-400">puntos</p>
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    <Link
                      href={`/expediente/${p.id}`}
                      onClick={e => e.stopPropagation()}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                      title="Ver Expediente Clínico"
                    >
                      <FileText className="w-4 h-4" />
                    </Link>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0 transition" />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ---- Modal Nuevo Paciente ---- */}
      {showModal && (
        <NuevoPacienteModal
          listas={listas}
          colonias={colonias}
          onClose={() => setShowModal(false)}
          onCreated={() => startTransition(() => router.refresh())}
        />
      )}
      </div>
    </div>
  )
}

// ================================================================
//  MODAL — Nuevo Paciente
// ================================================================
function NuevoPacienteModal({
  listas, colonias, onClose, onCreated,
}: {
  listas: Lista[]
  colonias: Colonia[]
  onClose: () => void
  onCreated: () => void
}) {
  const [tipo,    setTipo]    = useState<'persona' | 'empresa'>('persona')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [dupExistente, setDupExistente] = useState<PacienteDuplicado | null>(null)
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [exito, setExito] = useState<{ id: number; nombre: string; aviso?: string } | null>(null)

  function cerrarExito() {
    onClose()
  }

  async function verificarDuplicado(codigo: string, rtn?: string) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const dup = await buscarPacienteDuplicado(supabase, {
      codigo,
      rtnEmpresa: rtn,
    })
    if (dup) {
      setDupExistente(dup.paciente)
      setError(mensajePacienteDuplicado(dup.paciente, dup.campo))
      return true
    }
    setDupExistente(null)
    return false
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const fd     = new FormData(e.currentTarget)
    const data   = Object.fromEntries(fd.entries())

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()

    const codigoNorm = normalizarCodigoPaciente(String(data.codigo ?? ''))
    const rtnNorm = tipo === 'empresa' && data.rtn_empresa
      ? normalizarCodigoPaciente(String(data.rtn_empresa))
      : ''

    if (!codigoNorm) {
      setError('Ingrese la cédula o código del paciente.')
      setLoading(false)
      return
    }

    const esDuplicado = await verificarDuplicado(codigoNorm, rtnNorm || undefined)
    if (esDuplicado) {
      setLoading(false)
      return
    }

    const payload: Record<string, unknown> = {
      tipo,
      codigo:    codigoNorm,
      lista_id:  Number(data.lista_id) || 1,
      telefono:  data.telefono || null,
      celular:   data.celular  || null,
      correo:    data.correo   || null,
      direccion: data.direccion || null,
      colonia_id: data.colonia_id ? Number(data.colonia_id) : null,
      nota:      data.nota     || null,
      responsable: data.responsable || null,
      parentesco: data.parentesco || null,
      telefono_responsable: data.telefono_responsable || null,
    }

    if (tipo === 'persona') {
      payload.nombre     = data.nombre
      payload.apellido1  = data.apellido1
      payload.apellido2  = data.apellido2 || null
      payload.genero     = data.genero    || null
      payload.fecha_nac  = data.fecha_nac || null
      payload.grupo_sanguineo = data.grupo_sanguineo || null
    } else {
      payload.nombre_empresa = data.nombre_empresa
      payload.rtn_empresa    = rtnNorm || null
      payload.contacto       = data.contacto   || null
    }

    const { data: inserted, error: dbError } = await supabase
      .from('pacientes')
      .insert(payload)
      .select('id')
      .single()

    if (dbError) {
      const esUnico = dbError.message.includes('unique') || dbError.message.includes('duplicate')
      setError(esUnico
        ? 'Ya existe un paciente con esa cédula o RTN. No se permiten duplicados.'
        : 'Error al guardar. Verifica los datos.')
      setLoading(false)
      return
    }

    const nombreCreado = tipo === 'persona'
      ? `${String(data.nombre ?? '').trim()} ${String(data.apellido1 ?? '').trim()}`.trim()
      : String(data.nombre_empresa ?? '').trim()

    let avisoFoto: string | undefined
    if (fotoFile && inserted?.id) {
      try {
        await subirFotoPaciente(supabase, inserted.id, fotoFile)
      } catch (err) {
        avisoFoto = 'Paciente creado, pero la foto no se pudo subir: ' + (err instanceof Error ? err.message : '')
      }
    }

    if (inserted?.id) {
      onCreated()
      setExito({ id: inserted.id, nombre: nombreCreado || `Paciente #${inserted.id}`, aviso: avisoFoto })
      setLoading(false)
      return
    }

    onCreated()
    onClose()
  }

  if (exito) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[95vh] overflow-y-auto">
          <PacienteExitoPanel
            pacienteId={exito.id}
            nombre={exito.nombre}
            aviso={exito.aviso}
            onClose={cerrarExito}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto flex flex-col">

        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0 text-white rounded-t-2xl sm:rounded-t-2xl"
          style={{ background: `linear-gradient(135deg, ${BRAND.navy}, ${BRAND.navyMid})` }}>
          <h2 className="text-base font-bold flex items-center gap-2">
            <Users className="w-5 h-5" style={{ color: BRAND.goldLight }} />
            Nuevo Paciente
          </h2>
          <button onClick={onClose} className="text-white/70 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 flex-1 overflow-y-auto">

          {/* Tipo */}
          <div className="flex gap-3">
            {(['persona', 'empresa'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={cn(
                  'flex-1 py-2.5 rounded-xl text-sm font-medium border transition',
                  tipo === t
                    ? 'text-white border-transparent'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300',
                )}
                style={tipo === t ? { backgroundColor: BRAND.navy } : undefined}
              >
                {t === 'persona' ? '👤 Persona Natural' : '🏢 Empresa'}
              </button>
            ))}
          </div>

          {/* Campos comunes */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {tipo === 'empresa' ? 'RTN / Código *' : 'Cédula / DNI *'}
              </label>
              <input name="codigo" required
                onChange={() => { setError(null); setDupExistente(null) }}
                onBlur={async (e) => {
                  const v = normalizarCodigoPaciente(e.target.value)
                  if (v.length >= 5) await verificarDuplicado(v)
                }}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <p className="text-[10px] text-slate-400 mt-1">No se permite registrar la misma cédula o RTN dos veces.</p>
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-xs font-medium text-slate-600 mb-1">Lista de Precios</label>
              <select name="lista_id"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                {listas.map((l) => (
                  <option key={l.id} value={l.id}>{l.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Campos persona */}
          {tipo === 'persona' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre *</label>
                <input name="nombre" required
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Primer Apellido *</label>
                <input name="apellido1" required
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Segundo Apellido</label>
                <input name="apellido2"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fecha de Nacimiento</label>
                <input type="date" name="fecha_nac"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Género</label>
                <select name="genero"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">— Seleccionar —</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                  <option value="O">Otro</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Grupo Sanguíneo</label>
                <select name="grupo_sanguineo"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">— Seleccionar —</option>
                  {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Campos empresa */}
          {tipo === 'empresa' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre de la Empresa *</label>
                <input name="nombre_empresa" required
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">RTN Empresa</label>
                <input name="rtn_empresa"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre del Contacto</label>
                <input name="contacto"
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          )}

          {/* Foto opcional */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Foto (opcional)</label>
            <input type="file" accept="image/jpeg,image/png,image/webp"
              onChange={e => setFotoFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-slate-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700" />
          </div>

          {/* Responsable */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Responsable</label>
              <input name="responsable"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Parentesco</label>
              <input name="parentesco"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tel. responsable</label>
              <input name="telefono_responsable" type="tel"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Contacto */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono</label>
              <input name="telefono" type="tel"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Celular</label>
              <input name="celular" type="tel"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Correo</label>
              <input name="correo" type="email"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Colonia / Barrio</label>
              <ColoniaSelect colonias={colonias} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Dirección exacta (opcional)</label>
              <input name="direccion" placeholder="Calle, bloque, casa..."
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Nota */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nota (opcional)</label>
            <textarea name="nota" rows={2}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl space-y-1">
              <p>{error}</p>
              {dupExistente && (
                <Link
                  href={`/pacientes/${dupExistente.id}`}
                  className="inline-flex font-semibold text-red-800 underline underline-offset-2"
                  onClick={onClose}
                >
                  Ver paciente existente →
                </Link>
              )}
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition flex items-center justify-center gap-2"
              style={{ backgroundColor: BRAND.navy }}>
              <Save className="w-4 h-4" />
              {loading ? 'Guardando...' : 'Guardar Paciente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
