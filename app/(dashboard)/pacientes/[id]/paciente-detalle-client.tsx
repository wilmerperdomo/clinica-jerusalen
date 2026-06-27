'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Save, FileText, Stethoscope, CreditCard,
  User, Heart, Baby, AlertCircle, CheckCircle2, Power, Sparkles,
} from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import PacienteFotoCapture from '@/components/paciente-foto-capture'
import ColoniaSelect, { type Colonia } from '@/components/colonia-select'
import PacientePlanHistorial, { type HistorialMembresia, type HistorialPago } from '@/components/paciente-plan-historial'
import { nombreCompletoPaciente, edadPaciente, normalizarCodigoPaciente } from '@/lib/paciente-utils'
import { buscarPacienteDuplicado, mensajePacienteDuplicado } from '@/lib/paciente-duplicado'

interface Lista { id: number; nombre: string }

interface Antecedentes {
  id?: number
  personal?: string | null
  alergias?: string | null
  familiares?: string | null
  hospitalario?: string | null
}

interface AntecedentesGo {
  id?: number
  gestas?: number | null
  partos?: number | null
  cesareas?: number | null
  abortos?: number | null
  hijos_vivos?: number | null
  hijos_muertos?: number | null
  gemelares?: number | null
  ultima_regla?: string | null
}

interface Paciente {
  id: number
  codigo: string
  tipo: string
  nombre?: string | null
  apellido1?: string | null
  apellido2?: string | null
  nombre_empresa?: string | null
  rtn_empresa?: string | null
  contacto?: string | null
  telefono?: string | null
  celular?: string | null
  correo?: string | null
  direccion?: string | null
  colonia_id?: number | null
  colonias?: { id: number; nombre: string } | null
  fecha_nac?: string | null
  genero?: string | null
  grupo_sanguineo?: string | null
  lista_id?: number | null
  nota?: string | null
  puntos?: number
  activo?: boolean
  foto_url?: string | null
  responsable?: string | null
  parentesco?: string | null
  telefono_responsable?: string | null
  listas_precio?: { id: number; nombre: string } | null
}

interface Props {
  paciente: Paciente
  listas: Lista[]
  antecedentes: Antecedentes | null
  antecedentesGo: AntecedentesGo | null
  membresia: { id: number; tipo_nombre?: string | null; fecha_fin?: string; numero_carnet?: string | null } | null
  historialMembresias?: HistorialMembresia[]
  historialPagos?: HistorialPago[]
  colonias: Colonia[]
  totalConsultas: number
}

type Tab = 'general' | 'antecedentes' | 'gineco' | 'plan'

const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-slate-600 mb-1'

export default function PacienteDetalleClient({
  paciente: initial, listas, antecedentes: antInitial, antecedentesGo: goInitial,
  membresia, historialMembresias = [], historialPagos = [], colonias, totalConsultas,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [tab, setTab] = useState<Tab>('general')
  const [paciente, setPaciente] = useState(initial)
  const [antecedentes, setAntecedentes] = useState<Antecedentes>(antInitial ?? {})
  const [antecGo, setAntecGo] = useState<AntecedentesGo>(goInitial ?? {})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const nombre = nombreCompletoPaciente(paciente)
  const edad = edadPaciente(paciente.fecha_nac)
  const esFemenino = paciente.genero === 'F'
  const listaNombre = paciente.listas_precio?.nombre
    ?? listas.find(l => l.id === paciente.lista_id)?.nombre

  async function guardarGeneral(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const fd = new FormData(e.currentTarget)
    const data = Object.fromEntries(fd.entries())

    const codigoNorm = normalizarCodigoPaciente(String(data.codigo ?? ''))
    const rtnNorm = paciente.tipo === 'empresa' && data.rtn_empresa
      ? normalizarCodigoPaciente(String(data.rtn_empresa))
      : ''

    if (!codigoNorm) {
      setSaving(false)
      setMsg({ ok: false, text: 'La cédula o código es obligatorio.' })
      return
    }

    const supabase = createClient()
    const dup = await buscarPacienteDuplicado(supabase, {
      codigo: codigoNorm,
      rtnEmpresa: rtnNorm || undefined,
      excludeId: paciente.id,
    })
    if (dup) {
      setSaving(false)
      setMsg({ ok: false, text: mensajePacienteDuplicado(dup.paciente, dup.campo) })
      return
    }

    const payload: Record<string, unknown> = {
      codigo: codigoNorm,
      lista_id: Number(data.lista_id) || paciente.lista_id,
      telefono: data.telefono || null,
      celular: data.celular || null,
      correo: data.correo || null,
      direccion: data.direccion || null,
      colonia_id: data.colonia_id ? Number(data.colonia_id) : null,
      nota: data.nota || null,
      responsable: data.responsable || null,
      parentesco: data.parentesco || null,
      telefono_responsable: data.telefono_responsable || null,
    }

    if (paciente.tipo === 'persona') {
      Object.assign(payload, {
        nombre: data.nombre,
        apellido1: data.apellido1,
        apellido2: data.apellido2 || null,
        genero: data.genero || null,
        fecha_nac: data.fecha_nac || null,
        grupo_sanguineo: data.grupo_sanguineo || null,
      })
    } else {
      Object.assign(payload, {
        nombre_empresa: data.nombre_empresa,
        rtn_empresa: rtnNorm || null,
        contacto: data.contacto || null,
      })
    }

    const { error } = await supabase.from('pacientes').update(payload).eq('id', paciente.id)
    setSaving(false)
    if (error) {
      const esUnico = error.message.includes('unique') || error.message.includes('duplicate')
      setMsg({
        ok: false,
        text: esUnico
          ? 'Ya existe otro paciente con esa cédula o RTN. No se permiten duplicados.'
          : error.message,
      })
      return
    }
    setPaciente(prev => ({ ...prev, ...payload } as Paciente))
    setMsg({ ok: true, text: 'Datos guardados correctamente.' })
    startTransition(() => router.refresh())
  }

  async function guardarAntecedentes(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const fd = new FormData(e.currentTarget)
    const row = {
      paciente_id: paciente.id,
      personal: (fd.get('personal') as string) || null,
      alergias: (fd.get('alergias') as string) || null,
      familiares: (fd.get('familiares') as string) || null,
      hospitalario: (fd.get('hospitalario') as string) || null,
    }
    const supabase = createClient()
    const { data: saved, error } = await supabase
      .from('paciente_antecedentes')
      .upsert(row, { onConflict: 'paciente_id' })
      .select('id')
      .single()
    setSaving(false)
    if (error) { setMsg({ ok: false, text: error.message }); return }
    setAntecedentes({ ...row, id: saved?.id ?? antecedentes.id })
    setMsg({ ok: true, text: 'Antecedentes guardados.' })
  }

  async function guardarGineco(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const fd = new FormData(e.currentTarget)
    const num = (k: string) => {
      const v = fd.get(k) as string
      return v === '' ? 0 : parseInt(v, 10) || 0
    }
    const row = {
      paciente_id: paciente.id,
      gestas: num('gestas'),
      partos: num('partos'),
      cesareas: num('cesareas'),
      abortos: num('abortos'),
      hijos_vivos: num('hijos_vivos'),
      hijos_muertos: num('hijos_muertos'),
      gemelares: num('gemelares'),
      ultima_regla: (fd.get('ultima_regla') as string) || null,
    }
    const supabase = createClient()
    const { data: saved, error } = await supabase
      .from('paciente_antecedentes_go')
      .upsert(row, { onConflict: 'paciente_id' })
      .select('id')
      .single()
    setSaving(false)
    if (error) { setMsg({ ok: false, text: error.message }); return }
    setAntecGo({ ...row, id: saved?.id ?? antecGo.id })
    setMsg({ ok: true, text: 'Antecedentes G.O. guardados.' })
  }

  async function toggleActivo() {
    const nuevo = !paciente.activo
    if (!nuevo && !confirm('¿Desactivar este paciente? No aparecerá en búsquedas activas.')) return
    const supabase = createClient()
    const { error } = await supabase.from('pacientes').update({ activo: nuevo }).eq('id', paciente.id)
    if (error) { alert(error.message); return }
    setPaciente(prev => ({ ...prev, activo: nuevo }))
    startTransition(() => router.refresh())
  }

  const tabs: { id: Tab; label: string; icon: typeof User; show?: boolean }[] = [
    { id: 'general', label: 'Datos generales', icon: User },
    { id: 'plan', label: 'Plan médico', icon: CreditCard },
    { id: 'antecedentes', label: 'Antecedentes', icon: Heart },
    { id: 'gineco', label: 'Gineco-obstétricos', icon: Baby, show: esFemenino },
  ]

  return (
    <div className="min-h-full min-w-0 w-full overflow-x-hidden bg-gradient-to-br from-slate-50 via-white to-sky-50/30">

      {/* HERO ficha */}
      <div className="relative overflow-hidden shadow-lg"
        style={{ background: `linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.navyMid} 50%, #002244 100%)` }}>
        <div className="absolute -right-16 -top-16 w-56 h-56 rounded-full opacity-10 bg-white blur-3xl" />
        <div className="relative px-4 sm:px-6 py-6 sm:py-7">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
            <div>
              <Link href="/pacientes"
                className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 mb-2 transition">
                <ArrowLeft className="w-3.5 h-3.5" /> Pacientes
              </Link>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4" style={{ color: BRAND.gold }} />
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Ficha clínica</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">{nombre}</h1>
              <p className="text-white/60 text-sm mt-1">
                {paciente.codigo}
                {edad !== null && ` · ${edad} años`}
                {listaNombre && ` · ${listaNombre}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/expediente/${paciente.id}`}
                className="px-3 py-2 rounded-xl text-sm text-white/90 bg-white/10 hover:bg-white/20 border border-white/20 flex items-center gap-1.5 backdrop-blur">
                <FileText className="w-3.5 h-3.5" /> Expediente
              </Link>
              <Link href="/consultas"
                className="px-3 py-2 rounded-xl text-sm text-white/90 bg-white/10 hover:bg-white/20 border border-white/20 flex items-center gap-1.5 backdrop-blur">
                <Stethoscope className="w-3.5 h-3.5" /> Consultas ({totalConsultas})
              </Link>
              <Link href="/membresias"
                className="px-3 py-2 rounded-xl text-sm text-white/90 bg-white/10 hover:bg-white/20 border border-white/20 flex items-center gap-1.5 backdrop-blur">
                <CreditCard className="w-3.5 h-3.5" /> Membresías
              </Link>
              <button type="button" onClick={toggleActivo}
                className="px-3 py-2 rounded-xl text-sm border border-white/20 bg-white/10 text-white/90 hover:bg-white/20 flex items-center gap-1.5">
                <Power className="w-3.5 h-3.5" />
                {paciente.activo ? 'Desactivar' : 'Reactivar'}
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-5 items-start">
            <div className="rounded-2xl bg-white/10 backdrop-blur border border-white/20 p-3">
              <PacienteFotoCapture
                pacienteId={paciente.id}
                fotoUrl={paciente.foto_url}
                nombre={nombre}
                genero={paciente.genero}
                tipo={paciente.tipo}
                onFotoChange={(url) => setPaciente(prev => ({ ...prev, foto_url: url }))}
              />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex flex-wrap gap-2">
                {!paciente.activo && (
                  <span className="text-xs bg-red-500/30 text-red-100 border border-red-300/30 px-2 py-0.5 rounded-full font-medium">Inactivo</span>
                )}
                {paciente.grupo_sanguineo && (
                  <span className="text-xs bg-red-500/20 text-red-100 px-2 py-0.5 rounded-full font-bold">{paciente.grupo_sanguineo}</span>
                )}
                {membresia && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium border border-amber-300/40 text-amber-100 bg-amber-500/20">
                    {membresia.tipo_nombre} · vence {membresia.fecha_fin}
                  </span>
                )}
              </div>
              {(paciente.colonias?.nombre || paciente.celular || paciente.correo) && (
                <p className="text-sm text-white/70">
                  {[paciente.colonias?.nombre, paciente.direccion, paciente.celular, paciente.correo].filter(Boolean).join(' · ')}
                </p>
              )}
              {antecedentes.alergias && (
                <p className="text-xs bg-amber-500/25 text-amber-50 border border-amber-400/30 px-3 py-2 rounded-xl flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span><strong>Alergias:</strong> {antecedentes.alergias}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto w-full">

      {/* Tabs */}
      <div className="flex gap-1 bg-white border rounded-xl p-1 overflow-x-auto shadow-sm">
        {tabs.filter(t => t.show !== false).map(t => (
          <button key={t.id} type="button" onClick={() => { setTab(t.id); setMsg(null) }}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition',
              tab === t.id ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50',
            )}
            style={tab === t.id ? { backgroundColor: BRAND.navy } : undefined}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div className={cn(
          'flex items-center gap-2 text-sm px-4 py-3 rounded-xl',
          msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
        )}>
          {msg.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {/* Tab: General */}
      {tab === 'general' && (
        <form onSubmit={guardarGeneral} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-800">Información del paciente</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                {paciente.tipo === 'empresa' ? 'RTN / Código *' : 'Cédula / DNI *'}
              </label>
              <input name="codigo" required defaultValue={paciente.codigo} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Lista de precios</label>
              <select name="lista_id" defaultValue={paciente.lista_id ?? 1} className={cn(inputCls, 'bg-white')}>
                {listas.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select>
            </div>
          </div>

          {paciente.tipo === 'persona' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={labelCls}>Nombre *</label>
                <input name="nombre" required defaultValue={paciente.nombre ?? ''} className={inputCls} /></div>
              <div><label className={labelCls}>Primer apellido *</label>
                <input name="apellido1" required defaultValue={paciente.apellido1 ?? ''} className={inputCls} /></div>
              <div><label className={labelCls}>Segundo apellido</label>
                <input name="apellido2" defaultValue={paciente.apellido2 ?? ''} className={inputCls} /></div>
              <div><label className={labelCls}>Fecha de nacimiento</label>
                <input type="date" name="fecha_nac" defaultValue={paciente.fecha_nac ?? ''} className={inputCls} /></div>
              <div><label className={labelCls}>Género</label>
                <select name="genero" defaultValue={paciente.genero ?? ''} className={cn(inputCls, 'bg-white')}>
                  <option value="">—</option>
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                  <option value="O">Otro</option>
                </select></div>
              <div><label className={labelCls}>Grupo sanguíneo</label>
                <select name="grupo_sanguineo" defaultValue={paciente.grupo_sanguineo ?? ''} className={cn(inputCls, 'bg-white')}>
                  <option value="">—</option>
                  {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => <option key={g} value={g}>{g}</option>)}
                </select></div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2"><label className={labelCls}>Nombre empresa *</label>
                <input name="nombre_empresa" required defaultValue={paciente.nombre_empresa ?? ''} className={inputCls} /></div>
              <div><label className={labelCls}>RTN empresa</label>
                <input name="rtn_empresa" defaultValue={paciente.rtn_empresa ?? ''} className={inputCls} /></div>
              <div><label className={labelCls}>Contacto</label>
                <input name="contacto" defaultValue={paciente.contacto ?? ''} className={inputCls} /></div>
            </div>
          )}

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Contacto</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className={labelCls}>Teléfono</label>
                <input name="telefono" type="tel" defaultValue={paciente.telefono ?? ''} className={inputCls} /></div>
              <div><label className={labelCls}>Celular</label>
                <input name="celular" type="tel" defaultValue={paciente.celular ?? ''} className={inputCls} /></div>
              <div><label className={labelCls}>Correo</label>
                <input name="correo" type="email" defaultValue={paciente.correo ?? ''} className={inputCls} /></div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Colonia / Barrio</label>
                <ColoniaSelect colonias={colonias} value={paciente.colonia_id} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Dirección exacta (opcional)</label>
                <input name="direccion" defaultValue={paciente.direccion ?? ''} placeholder="Calle, bloque, casa..."
                  className={inputCls} />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Responsable / tutor</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><label className={labelCls}>Nombre responsable</label>
                <input name="responsable" defaultValue={paciente.responsable ?? ''} className={inputCls} /></div>
              <div><label className={labelCls}>Parentesco</label>
                <input name="parentesco" defaultValue={paciente.parentesco ?? ''} className={inputCls} /></div>
              <div><label className={labelCls}>Tel. responsable</label>
                <input name="telefono_responsable" type="tel" defaultValue={paciente.telefono_responsable ?? ''} className={inputCls} /></div>
            </div>
          </div>

          <div>
            <label className={labelCls}>Notas</label>
            <textarea name="nota" rows={3} defaultValue={paciente.nota ?? ''}
              className={cn(inputCls, 'resize-none')} />
          </div>

          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 disabled:opacity-50 text-white text-sm font-bold rounded-xl"
            style={{ backgroundColor: BRAND.navy }}>
            <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>
      )}

      {/* Tab: Plan médico */}
      {tab === 'plan' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Historial del plan médico</h2>
          <PacientePlanHistorial
            membresias={historialMembresias}
            pagos={historialPagos}
          />
        </div>
      )}

      {/* Tab: Antecedentes */}
      {tab === 'antecedentes' && (
        <form onSubmit={guardarAntecedentes} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">Antecedentes clínicos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Antecedentes patológicos personales</label>
              <textarea name="personal" rows={4} defaultValue={antecedentes.personal ?? ''}
                className={cn(inputCls, 'resize-none')} placeholder="Enfermedades crónicas, cirugías..." />
            </div>
            <div>
              <label className={labelCls}>Antecedentes inmunológicos / alérgicos</label>
              <textarea name="alergias" rows={4} defaultValue={antecedentes.alergias ?? ''}
                className={cn(inputCls, 'resize-none')} placeholder="Alergias a medicamentos, alimentos..." />
            </div>
            <div>
              <label className={labelCls}>Antecedentes patológicos familiares</label>
              <textarea name="familiares" rows={4} defaultValue={antecedentes.familiares ?? ''}
                className={cn(inputCls, 'resize-none')} />
            </div>
            <div>
              <label className={labelCls}>Hospitalarios, traumáticos y quirúrgicos</label>
              <textarea name="hospitalario" rows={4} defaultValue={antecedentes.hospitalario ?? ''}
                className={cn(inputCls, 'resize-none')} />
            </div>
          </div>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 disabled:opacity-50 text-white text-sm font-bold rounded-xl"
            style={{ backgroundColor: BRAND.navy }}>
            <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar antecedentes'}
          </button>
        </form>
      )}

      {/* Tab: Gineco */}
      {tab === 'gineco' && esFemenino && (
        <form onSubmit={guardarGineco} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">Antecedentes gineco-obstétricos</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {([
              ['gestas', 'Gestas'],
              ['partos', 'Partos'],
              ['cesareas', 'Cesáreas'],
              ['abortos', 'Abortos'],
              ['hijos_vivos', 'Hijos vivos'],
              ['hijos_muertos', 'Hijos fallecidos'],
              ['gemelares', 'P. gemelares'],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <label className={labelCls}>{label}</label>
                <input name={key} type="number" min={0} defaultValue={antecGo[key] ?? 0} className={inputCls} />
              </div>
            ))}
            <div>
              <label className={labelCls}>Última regla (FUR)</label>
              <input type="date" name="ultima_regla" defaultValue={antecGo.ultima_regla ?? ''} className={inputCls} />
            </div>
          </div>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 disabled:opacity-50 text-white text-sm font-bold rounded-xl"
            style={{ backgroundColor: BRAND.navy }}>
            <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar G.O.'}
          </button>
        </form>
      )}
      </div>
    </div>
  )
}
