'use client'

import { createBrowserClient } from '@supabase/ssr'
import { PackagePlus, RefreshCw, Truck } from 'lucide-react'
import type { SugerenciaReposicion } from '@/lib/inventario-profesional'

interface Props {
  sugerencias: SugerenciaReposicion[]
  sucursalNombre: (id?: number) => string
  proveedorNombre: (id?: number | null) => string
  onRecargar: () => void
}

function sb() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

export default function InventarioReposicionPanel({
  sugerencias,
  sucursalNombre,
  proveedorNombre,
  onRecargar,
}: Props) {
  const supabase = sb()

  async function guardarSugerencias() {
    if (sugerencias.length === 0) return
    const rows = sugerencias.map(s => ({
      producto_id: s.producto_id,
      sucursal_id: s.sucursal_id ?? null,
      proveedor_id: s.proveedor_id ?? null,
      stock_actual: s.stock_actual,
      stock_minimo: s.stock_minimo,
      venta_promedio_30: s.venta_promedio_30,
      cantidad_sugerida: s.cantidad_sugerida,
      motivo: s.motivo,
    }))
    const { error } = await supabase.from('inventario_reposicion_sugerencias').insert(rows)
    if (error) alert(error.message)
    else {
      alert('Sugerencias guardadas para seguimiento.')
      onRecargar()
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border p-5 flex flex-wrap gap-3 items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <PackagePlus className="w-5 h-5 text-emerald-600" /> Reposición sugerida
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Calculada por stock mínimo, rotación de 30 días y días de reposición.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void guardarSugerencias()}
          className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          <Truck className="w-4 h-4" /> Guardar sugerencias
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {sugerencias.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <RefreshCw className="w-10 h-10 mx-auto mb-2 opacity-30" />
            No hay productos para reponer con las reglas actuales.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-800 text-white">
              <tr>
                <th className="text-left px-4 py-3">Producto</th>
                <th className="text-left px-4 py-3">Sucursal</th>
                <th className="text-left px-4 py-3">Proveedor</th>
                <th className="text-right px-4 py-3">Stock</th>
                <th className="text-right px-4 py-3">Mínimo</th>
                <th className="text-right px-4 py-3">Venta 30d</th>
                <th className="text-right px-4 py-3">Comprar</th>
              </tr>
            </thead>
            <tbody>
              {sugerencias.map(s => (
                <tr key={`${s.producto_id}-${s.sucursal_id}`} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{s.producto}</p>
                    <p className="text-xs text-slate-500">{s.codigo} · {s.motivo}</p>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{sucursalNombre(s.sucursal_id)}</td>
                  <td className="px-4 py-2.5 text-slate-600">{proveedorNombre(s.proveedor_id)}</td>
                  <td className="px-4 py-2.5 text-right">{s.stock_actual}</td>
                  <td className="px-4 py-2.5 text-right">{s.stock_minimo}</td>
                  <td className="px-4 py-2.5 text-right">{s.venta_promedio_30}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{s.cantidad_sugerida}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
