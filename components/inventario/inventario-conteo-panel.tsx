'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ClipboardCheck, Plus, Save } from 'lucide-react'
import { useConfirm } from '@/components/confirm-dialog'
import type { StockPro } from '@/lib/inventario-profesional'

interface Props {
  inventario: StockPro[]
  sucursales: { id: number; nombre: string }[]
  sucursalUsuario: number | null
  userId: string
  onRecargar: () => void
}


export default function InventarioConteoPanel({
  inventario,
  sucursales,
  sucursalUsuario,
  userId,
  onRecargar,
}: Props) {
  const supabase = createClient()
  const confirmDialog = useConfirm()
  const [sucursalId, setSucursalId] = useState(String(sucursalUsuario || sucursales[0]?.id || ''))
  const [responsable, setResponsable] = useState('')
  const [cantidades, setCantidades] = useState<Record<number, string>>({})
  const [guardando, setGuardando] = useState(false)

  const rows = inventario.filter(r => String(r.sucursal_id) === sucursalId && Number(r.cantidad) >= 0)

  function diferencia(row: StockPro) {
    const val = cantidades[row.id]
    if (val === undefined || val === '') return 0
    return Number(val) - Number(row.cantidad)
  }

  async function crearConteo(cerrar: boolean) {
    if (!sucursalId) return

    const sucursalNombre = sucursales.find(s => s.id === Number(sucursalId))?.nombre ?? ''
    const contados = rows.filter(r => cantidades[r.id] !== undefined && cantidades[r.id] !== '')
    const conDiferencia = contados.filter(r => Number(cantidades[r.id]) !== Number(r.cantidad))

    if (cerrar) {
      const { confirmed } = await confirmDialog({
        title: 'Cerrar conteo físico',
        message: conDiferencia.length
          ? `Se aplicarán ${conDiferencia.length} ajuste(s) de inventario. ¿Está seguro que desea cerrar el conteo?`
          : '¿Está seguro que desea cerrar el conteo sin diferencias?',
        variant: 'warning',
        confirmLabel: 'Cerrar y aplicar',
        details: [
          { label: 'Sucursal', value: sucursalNombre },
          { label: 'Productos contados', value: String(contados.length) },
          { label: 'Con diferencia', value: String(conDiferencia.length) },
        ],
      })
      if (!confirmed) return
    }

    setGuardando(true)
    const { data: conteo, error } = await supabase.from('inventario_conteos').insert({
      sucursal_id: Number(sucursalId),
      responsable: responsable.trim() || null,
      usuario_id: userId,
      estado: cerrar ? 'CERRADO' : 'BORRADOR',
      cerrado_at: cerrar ? new Date().toISOString() : null,
    }).select('id').single()

    if (error || !conteo) {
      setGuardando(false)
      alert(error?.message || 'No se pudo crear el conteo')
      return
    }

    const detalles = rows
      .filter(r => cantidades[r.id] !== undefined && cantidades[r.id] !== '')
      .map(r => ({
        conteo_id: conteo.id,
        producto_id: r.producto_id,
        inventario_id: r.id,
        lote: r.lote || null,
        fecha_vencimiento: r.fecha_vencimiento || null,
        cantidad_sistema: Number(r.cantidad),
        cantidad_contada: Number(cantidades[r.id]),
        motivo: diferencia(r) === 0 ? null : 'Diferencia conteo físico',
      }))

    if (detalles.length) await supabase.from('inventario_conteo_detalles').insert(detalles)

    if (cerrar) {
      for (const r of rows) {
        const val = cantidades[r.id]
        if (val === undefined || val === '') continue
        const nueva = Number(val)
        if (nueva === Number(r.cantidad)) continue
        await supabase.from('inventario').update({ cantidad: nueva }).eq('id', r.id)
        await supabase.from('inventario_movimientos').insert({
          producto_id: r.producto_id,
          sucursal_id: r.sucursal_id,
          tipo: 'AJUSTE',
          cantidad: nueva - Number(r.cantidad),
          cantidad_antes: Number(r.cantidad),
          cantidad_despues: nueva,
          lote: r.lote || null,
          fecha_vencimiento: r.fecha_vencimiento || null,
          motivo: 'Ajuste por conteo físico',
          referencia_tipo: 'conteo_fisico',
          referencia_id: conteo.id,
          usuario_id: userId,
        })
      }
    }

    setGuardando(false)
    setCantidades({})
    alert(cerrar ? 'Conteo cerrado y diferencias aplicadas.' : 'Conteo guardado como borrador.')
    onRecargar()
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-indigo-600" /> Conteo físico
        </h3>
        <p className="text-sm text-slate-500 mt-1">Compare existencia del sistema contra existencia contada y cierre con ajuste automático.</p>
        <div className="flex flex-wrap gap-3 mt-4">
          <select value={sucursalId} onChange={e => setSucursalId(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <input
            value={responsable}
            onChange={e => setResponsable(e.target.value)}
            placeholder="Responsable del conteo"
            className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[220px]"
          />
          <button onClick={() => void crearConteo(false)} disabled={guardando} className="px-4 py-2 border rounded-lg text-sm font-medium">
            <Save className="w-4 h-4 inline mr-1" /> Guardar
          </button>
          <button onClick={() => void crearConteo(true)} disabled={guardando} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4 inline mr-1" /> Cerrar y ajustar
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-white">
            <tr>
              <th className="text-left px-4 py-3">Producto</th>
              <th className="text-left px-4 py-3">Lote</th>
              <th className="text-right px-4 py-3">Sistema</th>
              <th className="text-right px-4 py-3">Contado</th>
              <th className="text-right px-4 py-3">Dif.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const dif = diferencia(r)
              return (
                <tr key={r.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{r.producto?.nombre}</p>
                    <p className="text-xs text-slate-500">{r.producto?.codigo}</p>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{r.lote || '—'}</td>
                  <td className="px-4 py-2.5 text-right">{r.cantidad}</td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number"
                      value={cantidades[r.id] ?? ''}
                      onChange={e => setCantidades(prev => ({ ...prev, [r.id]: e.target.value }))}
                      className="w-24 border rounded px-2 py-1 text-right"
                    />
                  </td>
                  <td className={`px-4 py-2.5 text-right font-bold ${dif === 0 ? 'text-slate-400' : dif > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {dif}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
