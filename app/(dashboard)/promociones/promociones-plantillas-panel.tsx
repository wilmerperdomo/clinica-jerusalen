'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Pencil, Trash2, FileText } from 'lucide-react'
import ResponsiveModal from '@/components/responsive-modal'
import {
  CATEGORIAS_SERVICIO_PROMO, cfgCategoriaServicio,
  type CategoriaServicioPromo,
} from '@/lib/promociones-utils'
import { VARIABLES_PLANTILLA, type PromocionPlantilla } from '@/lib/promociones-plantillas'
import { useConfirm } from '@/components/confirm-dialog'

interface Props {
  esSuperAdmin?: boolean
  sucursalId?: number | null
  onSeleccionar?: (p: PromocionPlantilla) => void
  modoSeleccion?: boolean
}


const VACIA: Omit<PromocionPlantilla, 'id' | 'created_at'> = {
  nombre: '', contenido: '', categoria_servicio: 'general', activa: true, sucursal_id: null,
}

export default function PromocionesPlantillasPanel({
  esSuperAdmin, sucursalId, onSeleccionar, modoSeleccion,
}: Props) {
  const supabase = createClient()
  const confirmDialog = useConfirm()
  const [plantillas, setPlantillas] = useState<PromocionPlantilla[]>([])
  const [modal, setModal] = useState(false)
  const [edit, setEdit] = useState<PromocionPlantilla | null>(null)
  const [form, setForm] = useState({ ...VACIA })
  const [guardando, setGuardando] = useState(false)

  const cargar = useCallback(async () => {
    let q = supabase.from('promocion_plantillas').select('*').order('nombre')
    if (!esSuperAdmin && sucursalId) {
      q = q.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`)
    }
    const { data } = await q
    if (data) setPlantillas(data as PromocionPlantilla[])
  }, [supabase, esSuperAdmin, sucursalId])

  useEffect(() => { void cargar() }, [cargar])

  function abrirNueva() {
    setEdit(null)
    setForm({ ...VACIA, sucursal_id: esSuperAdmin ? null : sucursalId ?? null })
    setModal(true)
  }

  function abrirEditar(p: PromocionPlantilla) {
    setEdit(p)
    setForm({ ...p })
    setModal(true)
  }

  async function guardar() {
    if (!form.nombre.trim() || !form.contenido.trim()) {
      alert('Nombre y contenido son obligatorios.')
      return
    }
    setGuardando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        nombre: form.nombre.trim(),
        contenido: form.contenido.trim(),
        categoria_servicio: form.categoria_servicio,
        activa: form.activa,
        sucursal_id: form.sucursal_id,
        ...(edit ? {} : { creado_por: user?.id ?? null }),
      }
      if (edit) {
        await supabase.from('promocion_plantillas').update(payload).eq('id', edit.id)
      } else {
        await supabase.from('promocion_plantillas').insert(payload)
      }
      setModal(false)
      await cargar()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar(id: number) {
    const plantilla = plantillas.find(p => p.id === id)
    const { confirmed } = await confirmDialog({
      title: 'Eliminar plantilla',
      message: '¿Está seguro que desea eliminar esta plantilla de mensaje?',
      variant: 'danger',
      confirmLabel: 'Eliminar',
      details: plantilla ? [{ label: 'Nombre', value: plantilla.nombre }] : undefined,
    })
    if (!confirmed) return
    await supabase.from('promocion_plantillas').delete().eq('id', id)
    await cargar()
  }

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      <div className="p-4 border-b flex justify-between items-center gap-3">
        <div>
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-rose-500" /> Plantillas de mensaje
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Reutilice textos con variables como {'{{NOMBRE}}'}</p>
        </div>
        {!modoSeleccion && (
          <button type="button" onClick={abrirNueva}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-[#003366] text-white flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Nueva plantilla
          </button>
        )}
      </div>
      {plantillas.length === 0 ? (
        <p className="text-center py-12 text-gray-400 text-sm">No hay plantillas. Cree una para agilizar campañas.</p>
      ) : (
        <div className="divide-y">
          {plantillas.map(p => {
            const cat = cfgCategoriaServicio(p.categoria_servicio)
            return (
              <div key={p.id} className="p-4 hover:bg-rose-50/30 flex flex-col sm:flex-row gap-3 sm:items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900">{p.nombre}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cat.badge}`}>
                      {cat.icon} {cat.label}
                    </span>
                  </div>
                  <pre className="text-xs text-gray-600 mt-2 whitespace-pre-wrap line-clamp-3 font-sans">{p.contenido}</pre>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {modoSeleccion && onSeleccionar && (
                    <button type="button" onClick={() => onSeleccionar(p)}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 text-white">
                      Usar
                    </button>
                  )}
                  {!modoSeleccion && (
                    <>
                      <button type="button" onClick={() => abrirEditar(p)} className="p-2 border rounded-lg text-gray-500">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => eliminar(p.id)} className="p-2 border rounded-lg text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal && (
        <ResponsiveModal
          title={edit ? 'Editar plantilla' : 'Nueva plantilla'}
          onClose={() => setModal(false)}
          size="lg"
          footer={
            <div className="flex justify-end gap-2 w-full">
              <button type="button" onClick={() => setModal(false)} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
              <button type="button" onClick={guardar} disabled={guardando}
                className="px-4 py-2 bg-[#003366] text-white rounded-xl text-sm font-bold disabled:opacity-50">
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          }
        >
          <div className="space-y-4 text-sm">
            <div>
              <label className="text-xs font-medium text-gray-600">Nombre</label>
              <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                className="w-full border rounded-xl px-3 py-2 mt-1" placeholder="Ej. Cumpleaños estándar" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Categoría</label>
              <select value={form.categoria_servicio}
                onChange={e => setForm(f => ({ ...f, categoria_servicio: e.target.value as CategoriaServicioPromo }))}
                className="w-full border rounded-xl px-3 py-2">
                {CATEGORIAS_SERVICIO_PROMO.map(c => (
                  <option key={c.value} value={c.value}>{c.icon} {c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Mensaje</label>
              <textarea value={form.contenido} onChange={e => setForm(f => ({ ...f, contenido: e.target.value }))}
                rows={8} className="w-full border rounded-xl px-3 py-2 mt-1 font-mono text-xs resize-y"
                placeholder={'Hola {{NOMBRE}},\n\nEn {{CLINICA}} tenemos una oferta especial en {{SERVICIO}}…'} />
            </div>
            <div className="rounded-lg bg-gray-50 border p-2">
              <p className="text-[10px] font-semibold text-gray-600 mb-1">Variables disponibles</p>
              <div className="flex flex-wrap gap-1">
                {VARIABLES_PLANTILLA.map(v => (
                  <button key={v.key} type="button"
                    onClick={() => setForm(f => ({ ...f, contenido: f.contenido + v.key }))}
                    className="text-[10px] px-2 py-0.5 rounded bg-white border hover:bg-sky-50"
                    title={v.desc}>
                    {v.key}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </ResponsiveModal>
      )}
    </div>
  )
}
