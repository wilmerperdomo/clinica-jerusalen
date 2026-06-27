'use client'

import { AlertTriangle, BarChart3, Package, TrendingUp, WalletCards } from 'lucide-react'
import {
  calcularMargenProducto,
  calcularResumenInventario,
  fmtInv,
  topProductosPorMovimiento,
  type AlertaInventario,
  type MovimientoInventarioPro,
  type ProductoPro,
  type StockPro,
  type SugerenciaReposicion,
} from '@/lib/inventario-profesional'

interface Props {
  productos: ProductoPro[]
  inventario: StockPro[]
  movimientos: MovimientoInventarioPro[]
  alertas: AlertaInventario[]
  reposicion: SugerenciaReposicion[]
  onIrAlertas: () => void
  onIrReposicion: () => void
}

export default function InventarioEjecutivoPanel({
  productos,
  inventario,
  movimientos,
  alertas,
  reposicion,
  onIrAlertas,
  onIrReposicion,
}: Props) {
  const resumen = calcularResumenInventario(inventario, productos)
  const top = topProductosPorMovimiento(movimientos, 8)
  const margenesRiesgo = productos
    .map(calcularMargenProducto)
    .filter(m => m.bajo_costo || m.bajo_minimo)
    .slice(0, 8)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Valor a costo', value: fmtInv(resumen.valorCosto), icon: WalletCards, color: 'text-blue-700' },
          { label: 'Valor a venta', value: fmtInv(resumen.valorVenta), icon: TrendingUp, color: 'text-emerald-700' },
          { label: 'Utilidad potencial', value: fmtInv(resumen.utilidadPotencial), icon: BarChart3, color: 'text-indigo-700' },
          { label: 'Margen promedio', value: resumen.margenPromedio == null ? '—' : `${resumen.margenPromedio}%`, icon: Package, color: 'text-slate-800' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border p-4">
            <k.icon className={`w-5 h-5 ${k.color} mb-2`} />
            <p className="text-xs text-slate-500">{k.label}</p>
            <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={onIrAlertas}
          className="bg-red-50 border border-red-200 rounded-xl p-5 text-left hover:bg-red-100 transition"
        >
          <AlertTriangle className="w-6 h-6 text-red-600 mb-2" />
          <p className="font-bold text-red-800">{alertas.filter(a => a.prioridad === 'alta').length} alertas altas</p>
          <p className="text-sm text-red-700 mt-1">
            {resumen.lotesVencidos} vencidos · {resumen.lotesPorVencer} por vencer · {resumen.productosStockBajo} stock bajo
          </p>
        </button>

        <button
          type="button"
          onClick={onIrReposicion}
          className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-left hover:bg-amber-100 transition"
        >
          <Package className="w-6 h-6 text-amber-600 mb-2" />
          <p className="font-bold text-amber-900">{reposicion.length} productos para reponer</p>
          <p className="text-sm text-amber-800 mt-1">Basado en stock mínimo, rotación y días de reposición.</p>
        </button>

        <div className="bg-white rounded-xl border p-5">
          <p className="font-bold text-slate-800">Reglas profesionales activas</p>
          <ul className="mt-2 text-sm text-slate-600 space-y-1">
            <li>PEPS: vender primero lotes próximos a vencer.</li>
            <li>Bloquear vencidos y productos bajo costo.</li>
            <li>Reponer por stock mínimo + rotación.</li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-bold text-slate-800 mb-3">Productos con más salida</h3>
          {top.length === 0 ? (
            <p className="text-sm text-slate-400">Sin salidas recientes registradas.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {top.map((p, i) => (
                <li key={p.producto_id} className="flex justify-between border-b pb-2">
                  <span><strong>{i + 1}.</strong> {p.nombre}</span>
                  <strong>{p.cantidad}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border p-5">
          <h3 className="font-bold text-slate-800 mb-3">Precios con riesgo</h3>
          {margenesRiesgo.length === 0 ? (
            <p className="text-sm text-slate-400">No hay productos bajo costo o bajo mínimo.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {margenesRiesgo.map(p => (
                <li key={p.producto_id} className="flex justify-between gap-2 border-b pb-2">
                  <span>{p.nombre}</span>
                  <span className="text-red-600 font-bold">{fmtInv(p.precio)} / costo {fmtInv(p.costo)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
