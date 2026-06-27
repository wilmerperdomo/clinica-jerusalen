'use client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, Eye, X, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import { type FacturaAuditoriaRow, fmtFechaAud } from '@/lib/auditoria-utils'
import { fetchFacturasAuditoria } from '@/app/(dashboard)/auditoria/actions'

export default function AuditoriaFacturasPanel() {
  const [rows, setRows] = useState<FacturaAuditoriaRow[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [ver, setVer] = useState<FacturaAuditoriaRow | null>(null)

  const cargar = useCallback(async (p: number) => {
    setLoading(true)
    const res = await fetchFacturasAuditoria(p, 50)
    setLoading(false)
    if (res.ok) {
      setRows(res.rows)
      setTotalPages(res.totalPages)
      setPage(p)
    }
  }, [])

  useEffect(() => { void cargar(1) }, [cargar])

  const ACCION_STYLE: Record<string, string> = {
    ELIMINADA: 'bg-red-100 text-red-800',
    ANULADA: 'bg-amber-100 text-amber-800',
    EMITIDA: 'bg-green-100 text-green-800',
  }

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-900">
        Historial dedicado de facturas: anulaciones, eliminaciones y cambios de estado con <strong>motivo obligatorio</strong>.
      </div>

      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b flex justify-between items-center">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Auditoría de facturación
          </h3>
          <button onClick={() => void cargar(page)} className="p-2 border rounded-lg text-slate-600 hover:bg-slate-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Factura</th>
                <th className="px-4 py-3 text-center">Acción</th>
                <th className="px-4 py-3 text-left">Motivo</th>
                <th className="px-4 py-3 text-left">Usuario</th>
                <th className="px-4 py-3 w-12" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 && !loading && (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400">Sin registros de facturación</td></tr>
              )}
              {rows.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fmtFechaAud(r.fecha)}</td>
                  <td className="px-4 py-3 font-mono text-sm">{r.numero || `#${r.factura_id}`}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ACCION_STYLE[r.accion] ?? 'bg-gray-100'}`}>
                      {r.accion}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 max-w-[280px] truncate" title={r.motivo}>{r.motivo}</td>
                  <td className="px-4 py-3 text-xs">{r.usuario_nombre || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => setVer(r)} className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t flex items-center justify-between text-sm">
            <button onClick={() => void cargar(page - 1)} disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 border rounded-lg disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <span className="text-slate-500">Página {page} de {totalPages}</span>
            <button onClick={() => void cargar(page + 1)} disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 border rounded-lg disabled:opacity-40">
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {ver && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold">Factura {ver.numero || ver.factura_id}</h2>
              <button onClick={() => setVer(null)}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-3 text-sm overflow-y-auto">
              <p><span className="text-gray-500">Acción:</span> <strong>{ver.accion}</strong></p>
              <p><span className="text-gray-500">Motivo:</span> {ver.motivo}</p>
              <p><span className="text-gray-500">Usuario:</span> {ver.usuario_nombre || '—'}</p>
              <p><span className="text-gray-500">Fecha:</span> {fmtFechaAud(ver.fecha)}</p>
              {ver.datos_antes && (
                <details>
                  <summary className="cursor-pointer text-gray-500">Snapshot antes del cambio</summary>
                  <pre className="mt-2 bg-gray-900 text-gray-100 rounded-lg p-3 text-xs overflow-x-auto max-h-48">
{JSON.stringify(ver.datos_antes, null, 2)}
                  </pre>
                </details>
              )}
            </div>
            <div className="px-6 py-4 border-t flex justify-end">
              <button onClick={() => setVer(null)} className="px-4 py-2 bg-gray-100 rounded-xl text-sm">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
