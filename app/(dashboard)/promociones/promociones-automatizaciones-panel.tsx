'use client'

import { useState, useEffect, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Plus, Pencil, Trash2, Cake, UserX, Zap } from 'lucide-react'
import ResponsiveModal from '@/components/responsive-modal'
import { CANAL_CFG, type Promocion } from '@/lib/promociones-utils'
import type { PromocionPlantilla } from '@/lib/promociones-plantillas'
import type { PromocionRegla, TipoDisparadorRegla } from '@/lib/promociones-reglas'

interface Props {
  promociones: Promocion[]
  esSuperAdmin?: boolean
  sucursalId?: number | null
  onProcesar?: () => void
  procesando?: boolean
}

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

const DISPARADOR_CFG: Record<TipoDisparadorRegla, { label: string; icon: typeof Cake; desc: string }> = {
  cumpleanos: { label: 'Cumpleaños', icon: Cake, desc: 'Envía el día del cumpleaños (o días antes)' },
  inactivo: { label: 'Pacientes inactivos', icon: UserX, desc: 'Sin consulta ni laboratorio en X meses' },
}

const REGLA_VACIA = {
  nombre: '',
  tipo_disparador: 'cumpleanos' as TipoDisparadorRegla,
  promocion_id: 0,
  plantilla_id: null as number | null,
  canal: 'ambos' as const,
  modo_envio: 'automatico' as const,
  dias_anticipacion: 0,
  meses_inactivo: 6,
  activa: true,
  sucursal_id: null as number | null,
}

export default function PromocionesAutomatizacionesPanel({
  promociones, esSuperAdmin, sucursalId, onProcesar, procesando,
}: Props) {
  const supabase = sb()
  const [reglas, setReglas] = useState<PromocionRegla[]>([])
  const [plantillas, setPlantillas] = useState<PromocionPlantilla[]>([])
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState<PromocionRegla | null>(null)
  const [form, setForm] = useState({ ...REGLA_VACIA })

  const cargar = useCallback(async () => {
    let rq = supabase.from('promocion_reglas').select('*, promocion:promociones(*), plantilla:promocion_plantillas(*)').order('nombre')
    let pq = supabase.from('promocion_plantillas').select('*').eq('activa', true).order('nombre')
    if (!esSuperAdmin && sucursalId) {
      rq = rq.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`)
      pq = pq.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`)
    }
    const [{ data: r }, { data: p }] = await Promise.all([rq, pq])
    if (r) setReglas(r as PromocionRegla[])
    if (p) setPlantillas(p as PromocionPlantilla[])
  }, [supabase, esSuperAdmin, sucursalId])

  useEffect(() => { void cargar() }, [cargar])

  const promosActivas = promociones.filter(p => p.activa)

  function abrirNueva() {
    setEdit(null)
    setForm({
      ...REGLA_VACIA,
      promocion_id: promosActivas[0]?.id ?? 0,
      sucursal_id: esSuperAdmin ? null : sucursalId ?? null,
    })
    setModal(true)
  }

  function abrirEditar(r: PromocionRegla) {
    setEdit(r)
    setForm({
      nombre: r.nombre,
      tipo_disparador: r.tipo_disparador,
      promocion_id: r.promocion_id,
      plantilla_id: r.plantilla_id ?? null,
      canal: r.canal,
      modo_envio: r.modo_envio,
      dias_anticipacion: r.dias_anticipacion,
      meses_inactivo: r.meses_inactivo,
      activa: r.activa,
      sucursal_id: r.sucursal_id ?? null,
    })
    setModal(true)
  }

  async function guardar() {
    if (!form.nombre.trim() || !form.promocion_id) {
      alert('Nombre y promoción son obligatorios.')
      return
    }
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        nombre: form.nombre.trim(),
        tipo_disparador: form.tipo_disparador,
        promocion_id: form.promocion_id,
        plantilla_id: form.plantilla_id,
        canal: form.canal,
        modo_envio: form.modo_envio,
        dias_anticipacion: form.dias_anticipacion,
        meses_inactivo: form.meses_inactivo,
        activa: form.activa,
        sucursal_id: form.sucursal_id,
        ...(edit ? {} : { creado_por: user?.id ?? null }),
      }
      if (edit) {
        await supabase.from('promocion_reglas').update(payload).eq('id', edit.id)
      } else {
        await supabase.from('promocion_reglas').insert(payload)
      }
      setModal(false)
      await cargar()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar')
    }
  }

  async function eliminar(id: number) {
    if (!confirm('¿Eliminar esta regla automática?')) return
    await supabase.from('promocion_reglas').delete().eq('id', id)
    await cargar()
  }

  async function toggleActiva(r: PromocionRegla) {
    await supabase.from('promocion_reglas').update({ activa: !r.activa }).eq('id', r.id)
    await cargar()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="text-sm text-emerald-900">
          <p className="font-semibold flex items-center gap-2">
            <Zap className="w-4 h-4" /> Automatizaciones diarias
          </p>
          <p className="text-xs text-emerald-700 mt-1">
            El cron (9:00 AM) evalúa cumpleaños e inactivos y crea campañas. También puede ejecutar manualmente.
          </p>
        </div>
        {onProcesar && (
          <button type="button" onClick={onProcesar} disabled={procesando}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white disabled:opacity-50 whitespace-nowrap">
            {procesando ? 'Procesando…' : 'Ejecutar ahora'}
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="font-bold text-gray-900">Reglas programadas</h3>
          <button type="button" onClick={abrirNueva} disabled={promosActivas.length === 0}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-[#003366] text-white flex items-center gap-1 disabled:opacity-40">
            <Plus className="w-3.5 h-3.5" /> Nueva regla
          </button>
        </div>
        {reglas.length === 0 ? (
          <p className="text-center py-12 text-gray-400 text-sm px-4">
            Configure reglas para felicitar cumpleaños o reactivar pacientes inactivos.
          </p>
        ) : (
          <div className="divide-y">
            {reglas.map(r => {
              const cfg = DISPARADOR_CFG[r.tipo_disparador]
              const Icon = cfg.icon
              return (
                <div key={r.id} className={`p-4 flex flex-col sm:flex-row gap-3 ${!r.activa ? 'opacity-50' : ''}`}>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Icon className="w-4 h-4 text-rose-500" />
                      <span className="font-semibold text-gray-900">{r.nombre}</span>
                      <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded-full">{cfg.label}</span>
                      <span className="text-[10px] text-gray-400">{CANAL_CFG[r.canal].icon} {CANAL_CFG[r.canal].label}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Promo: {r.promocion?.titulo ?? `#${r.promocion_id}`}
                      {r.plantilla?.nombre ? ` · Plantilla: ${r.plantilla.nombre}` : ''}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {r.tipo_disparador === 'cumpleanos'
                        ? `Anticipación: ${r.dias_anticipacion} día(s)`
                        : `Inactivo ≥ ${r.meses_inactivo} meses`}
                      {' · '}{r.modo_envio === 'automatico' ? 'Envío automático' : 'Lista asistida'}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => toggleActiva(r)}
                      className={`px-2 py-1 text-[10px] font-bold rounded-lg border ${r.activa ? 'text-emerald-700 border-emerald-200' : 'text-gray-400'}`}>
                      {r.activa ? 'Activa' : 'Pausada'}
                    </button>
                    <button type="button" onClick={() => abrirEditar(r)} className="p-2 border rounded-lg text-gray-500">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => eliminar(r.id)} className="p-2 border rounded-lg text-red-400">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modal && (
        <ResponsiveModal
          title={edit ? 'Editar regla' : 'Nueva regla automática'}
          onClose={() => setModal(false)}
          size="lg"
          footer={
            <div className="flex justify-end gap-2 w-full">
              <button type="button" onClick={() => setModal(false)} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
              <button type="button" onClick={guardar} className="px-4 py-2 bg-[#003366] text-white rounded-xl text-sm font-bold">Guardar</button>
            </div>
          }
        >
          <div className="space-y-4 text-sm">
            <div>
              <label className="text-xs text-gray-600">Nombre de la regla</label>
              <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2 mt-1" placeholder="Ej. Felicitación cumpleaños" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(DISPARADOR_CFG) as TipoDisparadorRegla[]).map(t => {
                const c = DISPARADOR_CFG[t]
                return (
                  <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tipo_disparador: t }))}
                    className={`p-3 rounded-xl border text-left ${form.tipo_disparador === t ? 'border-[#003366] bg-rose-50' : ''}`}>
                    <c.icon className="w-4 h-4 text-rose-500 mb-1" />
                    <p className="font-semibold text-xs">{c.label}</p>
                    <p className="text-[10px] text-gray-500">{c.desc}</p>
                  </button>
                )
              })}
            </div>
            {form.tipo_disparador === 'cumpleanos' && (
              <div>
                <label className="text-xs text-gray-600">Días de anticipación (0 = mismo día)</label>
                <input type="number" min={0} max={14} value={form.dias_anticipacion}
                  onChange={e => setForm(f => ({ ...f, dias_anticipacion: Number(e.target.value) }))}
                  className="w-full border rounded-xl px-3 py-2 mt-1" />
              </div>
            )}
            {form.tipo_disparador === 'inactivo' && (
              <div>
                <label className="text-xs text-gray-600">Meses sin actividad</label>
                <select value={form.meses_inactivo}
                  onChange={e => setForm(f => ({ ...f, meses_inactivo: Number(e.target.value) }))}
                  className="w-full border rounded-xl px-3 py-2 mt-1">
                  <option value={3}>3 meses</option>
                  <option value={6}>6 meses</option>
                  <option value={12}>12 meses</option>
                  <option value={18}>18 meses</option>
                </select>
              </div>
            )}
            <div>
              <label className="text-xs text-gray-600">Promoción a enviar</label>
              <select value={form.promocion_id}
                onChange={e => setForm(f => ({ ...f, promocion_id: Number(e.target.value) }))}
                className="w-full border rounded-xl px-3 py-2 mt-1">
                {promosActivas.map(p => (
                  <option key={p.id} value={p.id}>{p.titulo}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Plantilla de mensaje (opcional)</label>
              <select value={form.plantilla_id ?? ''}
                onChange={e => setForm(f => ({ ...f, plantilla_id: e.target.value ? Number(e.target.value) : null }))}
                className="w-full border rounded-xl px-3 py-2 mt-1">
                <option value="">Mensaje por defecto de la promoción</option>
                {plantillas.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-600">Canal</label>
                <select value={form.canal} onChange={e => setForm(f => ({ ...f, canal: e.target.value as typeof form.canal }))}
                  className="w-full border rounded-xl px-3 py-2 mt-1">
                  <option value="ambos">Inteligente</option>
                  <option value="whatsapp">Solo WhatsApp</option>
                  <option value="email">Solo correo</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600">Modo</label>
                <select value={form.modo_envio} onChange={e => setForm(f => ({ ...f, modo_envio: e.target.value as typeof form.modo_envio }))}
                  className="w-full border rounded-xl px-3 py-2 mt-1">
                  <option value="automatico">Automático (API)</option>
                  <option value="asistido">Asistido (revisar antes)</option>
                </select>
              </div>
            </div>
          </div>
        </ResponsiveModal>
      )}
    </div>
  )
}
