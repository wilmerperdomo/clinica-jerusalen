'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  X, Package, History, Warehouse, TrendingUp, TrendingDown, ExternalLink, Pill,
} from 'lucide-react'
import {
  type Producto, type StockProducto, type PrecioHistorialRow,
  margenVenta, markupCosto, fmtFechaProd,
} from '@/lib/productos-utils'
import { fetchHistorialPrecios } from '@/app/(dashboard)/productos/actions'

interface Props {
  producto: Producto
  stock?: StockProducto
  proveedorNombre?: string
  onClose: () => void
  onEditar: () => void
}

type Tab = 'info' | 'stock' | 'precios'

export default function ProductoDetalleModal({
  producto, stock, proveedorNombre, onClose, onEditar,
}: Props) {
  const [tab, setTab] = useState<Tab>('info')
  const [historial, setHistorial] = useState<PrecioHistorialRow[]>([])
  const [cargandoHist, setCargandoHist] = useState(false)

  useEffect(() => {
    if (tab !== 'precios' || historial.length > 0) return
    setCargandoHist(true)
    fetchHistorialPrecios(producto.id).then(r => {
      if (r.ok) setHistorial(r.rows)
      setCargandoHist(false)
    })
  }, [tab, producto.id, historial.length])

  const margen = margenVenta(producto.costo, producto.precio_venta)
  const markup = markupCosto(producto.costo, producto.precio_venta)

  const TABS: { key: Tab; label: string; icon: typeof Package }[] = [
    { key: 'info', label: 'Información', icon: Package },
    { key: 'stock', label: 'Existencias', icon: Warehouse },
    { key: 'precios', label: 'Historial de precios', icon: History },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[95vh] sm:max-h-[88vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div className="flex items-center gap-2">
            <Pill className="w-5 h-5 text-sky-600" />
            <div>
              <h3 className="font-bold text-gray-900">{producto.nombre}</h3>
              <p className="text-xs text-gray-400 font-mono">{producto.codigo}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex border-b px-3">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                tab === t.key ? 'border-sky-600 text-sky-700' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <t.icon className="w-4 h-4" /> {t.label}
            </button>
          ))}
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          {tab === 'info' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <Campo label="Tipo" value={producto.tipo} />
                <Campo label="Categoría" value={producto.categoria} />
                <Campo label="Unidad" value={producto.unidad} />
                <Campo label="Genérico" value={producto.nombre_generico} />
                <Campo label="Laboratorio" value={producto.laboratorio} />
                <Campo label="Marca" value={producto.marca} />
                <Campo label="Principio activo" value={producto.principio_activo} />
                <Campo label="Concentración" value={producto.concentracion} />
                <Campo label="Presentación" value={producto.presentacion} />
                <Campo label="Código de barra" value={producto.codigo_barra} mono />
                <Campo label="Proveedor preferido" value={proveedorNombre} />
                <Campo label="Días reposición" value={String(producto.dias_reposicion ?? '—')} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Kpi label="Costo" value={`L ${Number(producto.costo).toFixed(2)}`} />
                <Kpi label="Precio venta" value={`L ${Number(producto.precio_venta).toFixed(2)}`} />
                <Kpi label="Precio mínimo" value={`L ${Number(producto.precio_minimo ?? 0).toFixed(2)}`} />
                <Kpi
                  label="Margen / Markup"
                  value={margen != null ? `${margen.toFixed(1)}% / ${markup?.toFixed(1) ?? '—'}%` : '—'}
                  tone={margen != null && margen < 0 ? 'red' : 'green'}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {producto.es_antibiotico && <Badge text="Antibiótico" color="red" />}
                {producto.requiere_receta && <Badge text="Requiere receta" color="amber" />}
                {producto.es_controlado && <Badge text="Controlado" color="red" />}
                {producto.gravado ? <Badge text={`ISV ${producto.isv_porcentaje ?? 15}%`} color="blue" /> : <Badge text="Exento ISV" color="gray" />}
                {producto.facturable ? <Badge text="Facturable" color="green" /> : <Badge text="No facturable" color="gray" />}
                {!producto.activo && <Badge text="Inactivo" color="gray" />}
              </div>
            </div>
          )}

          {tab === 'stock' && (
            <div className="space-y-3">
              <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm text-sky-700">Existencia total</span>
                <span className="text-2xl font-bold text-sky-800">{stock?.total ?? 0} {producto.unidad}</span>
              </div>
              {stock && stock.sucursales.length > 0 ? (
                <table className="w-full text-sm border rounded-xl overflow-hidden">
                  <thead><tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                    <th className="px-4 py-2 text-left">Sucursal</th>
                    <th className="px-4 py-2 text-right">Cantidad</th>
                    <th className="px-4 py-2 text-center">Estado</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {stock.sucursales.map(s => {
                      const bajo = s.cantidad <= producto.stock_minimo
                      return (
                        <tr key={s.sucursal_id}>
                          <td className="px-4 py-2">{s.nombre}</td>
                          <td className="px-4 py-2 text-right font-medium">{s.cantidad}</td>
                          <td className="px-4 py-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${bajo ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                              {s.cantidad === 0 ? 'Agotado' : bajo ? 'Stock bajo' : 'OK'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="text-center text-gray-400 py-8 text-sm">Sin existencias registradas</p>
              )}
              <Link href="/inventario" className="inline-flex items-center gap-1 text-sm text-sky-600 hover:underline">
                Ver en inventario <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}

          {tab === 'precios' && (
            <div>
              {cargandoHist ? (
                <p className="text-center text-gray-400 py-8 text-sm">Cargando historial…</p>
              ) : historial.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">Sin cambios de precio registrados</p>
              ) : (
                <table className="w-full text-sm border rounded-xl overflow-hidden">
                  <thead><tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-right">Precio</th>
                    <th className="px-3 py-2 text-right">Costo</th>
                    <th className="px-3 py-2 text-left">Motivo</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {historial.map(h => {
                      const subePrecio = (h.precio_anterior ?? 0) < h.precio_nuevo
                      return (
                        <tr key={h.id}>
                          <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{fmtFechaProd(h.created_at)}</td>
                          <td className="px-3 py-2 text-right">
                            <span className="text-gray-400">{h.precio_anterior != null ? `L ${Number(h.precio_anterior).toFixed(2)}` : '—'}</span>
                            <span className="mx-1 inline-flex">{subePrecio ? <TrendingUp className="w-3 h-3 text-green-600" /> : <TrendingDown className="w-3 h-3 text-red-600" />}</span>
                            <span className="font-medium">L {Number(h.precio_nuevo).toFixed(2)}</span>
                          </td>
                          <td className="px-3 py-2 text-right text-gray-600">
                            {h.costo_nuevo != null ? `L ${Number(h.costo_nuevo).toFixed(2)}` : '—'}
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500">{h.motivo || '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-xl text-sm">Cerrar</button>
          <button onClick={onEditar} className="px-5 py-2 bg-sky-600 text-white rounded-xl text-sm font-medium hover:bg-sky-700">
            Editar producto
          </button>
        </div>
      </div>
    </div>
  )
}

function Campo({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase">{label}</p>
      <p className={`text-sm text-gray-800 ${mono ? 'font-mono' : ''}`}>{value || '—'}</p>
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  return (
    <div className="bg-gray-50 border rounded-xl p-3">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-sm font-bold ${tone === 'red' ? 'text-red-600' : tone === 'green' ? 'text-green-700' : 'text-gray-800'}`}>{value}</p>
    </div>
  )
}

function Badge({ text, color }: { text: string; color: 'red' | 'amber' | 'blue' | 'green' | 'gray' }) {
  const cls = {
    red: 'bg-red-100 text-red-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    green: 'bg-green-100 text-green-700',
    gray: 'bg-gray-100 text-gray-600',
  }[color]
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{text}</span>
}
