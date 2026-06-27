'use client'

import { AlertTriangle, CheckCircle2, Clock, PackageX } from 'lucide-react'
import type { AlertaInventario } from '@/lib/inventario-profesional'

interface Props {
  alertas: AlertaInventario[]
  onIrStockBajo: () => void
}

const cfg = {
  alta: { icon: AlertTriangle, cls: 'bg-red-50 border-red-200 text-red-800', badge: 'bg-red-100 text-red-800' },
  media: { icon: Clock, cls: 'bg-amber-50 border-amber-200 text-amber-900', badge: 'bg-amber-100 text-amber-800' },
  baja: { icon: PackageX, cls: 'bg-blue-50 border-blue-200 text-blue-900', badge: 'bg-blue-100 text-blue-800' },
}

export default function InventarioAlertasPanel({ alertas, onIrStockBajo }: Props) {
  if (alertas.length === 0) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-10 text-center">
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
        <p className="font-bold text-emerald-800">Inventario sin alertas críticas</p>
        <p className="text-sm text-emerald-600 mt-1">Siga revisando vencimientos, stock mínimo y precios cada semana.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {(['alta', 'media', 'baja'] as const).map(p => (
          <div key={p} className={`rounded-xl border p-4 ${cfg[p].cls}`}>
            <p className="text-xs uppercase font-semibold">{p}</p>
            <p className="text-2xl font-bold">{alertas.filter(a => a.prioridad === p).length}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {alertas.map(a => {
          const C = cfg[a.prioridad]
          const Icon = C.icon
          return (
            <div key={a.id} className={`rounded-xl border p-4 ${C.cls}`}>
              <div className="flex gap-3 items-start">
                <Icon className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex gap-2 flex-wrap items-center">
                    <p className="font-bold">{a.titulo}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase ${C.badge}`}>{a.prioridad}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/70">{a.tipo}</span>
                  </div>
                  <p className="text-sm mt-1">{a.descripcion}</p>
                  <p className="text-xs mt-2 font-semibold">Acción recomendada: {a.accion}</p>
                  {a.tipo === 'STOCK_BAJO' && (
                    <button type="button" onClick={onIrStockBajo} className="text-xs underline mt-2 font-medium">
                      Ver productos con stock bajo
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
