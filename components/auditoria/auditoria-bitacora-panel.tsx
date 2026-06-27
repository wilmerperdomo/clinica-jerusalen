'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import {
  Search, Eye, X, Download, ChevronLeft, ChevronRight, RefreshCw,
  Plus, Pencil, Trash, ShieldCheck, Clock, User, ExternalLink,
} from 'lucide-react'
import {
  type BitacoraRow, labelTabla, esCritico, linkRegistro,
  OP_LABEL, fmtFechaAud, valorAud,
} from '@/lib/auditoria-utils'
import { fetchBitacora, exportarBitacoraCSV, type FiltrosBitacora } from '@/app/(dashboard)/auditoria/actions'

const OP_STYLE: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-700',
  UPDATE: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
}
const OP_ICON: Record<string, typeof Plus> = { INSERT: Plus, UPDATE: Pencil, DELETE: Trash }

interface Props {
  tablasInicial: string[]
  usuariosInicial: string[]
}

export default function AuditoriaBitacoraPanel({ tablasInicial, usuariosInicial }: Props) {
  const [rows, setRows] = useState<BitacoraRow[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [exportando, setExportando] = useState(false)
  const [ver, setVer] = useState<BitacoraRow | null>(null)

  const [buscar, setBuscar] = useState('')
  const [fTabla, setFTabla] = useState('')
  const [fOp, setFOp] = useState('')
  const [fUsuario, setFUsuario] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  const cargar = useCallback(async (p = page) => {
    setLoading(true)
    const filtros: FiltrosBitacora = {
      buscar, tabla: fTabla || undefined, operacion: fOp || undefined,
      usuario: fUsuario || undefined, fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined, page: p, pageSize: 50,
    }
    const res = await fetchBitacora(filtros)
    setLoading(false)
    if (res.ok) {
      setRows(res.rows)
      setTotal(res.total)
      setTotalPages(res.totalPages)
      setPage(res.page)
    }
  }, [buscar, fTabla, fOp, fUsuario, fechaDesde, fechaHasta, page])

  useEffect(() => { void cargar(1) }, [buscar, fTabla, fOp, fUsuario, fechaDesde, fechaHasta])

  async function exportar() {
    setExportando(true)
    const res = await exportarBitacoraCSV({
      buscar, tabla: fTabla || undefined, operacion: fOp || undefined,
      usuario: fUsuario || undefined, fechaDesde: fechaDesde || undefined,
      fechaHasta: fechaHasta || undefined,
    })
    setExportando(false)
    if (!res.ok) { alert(res.error); return }
    const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bitacora-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input value={buscar} onChange={e => setBuscar(e.target.value)}
              placeholder="Buscar usuario, tabla, ID…"
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>
          <select value={fTabla} onChange={e => setFTabla(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">Todas las tablas</option>
            {tablasInicial.map(t => <option key={t} value={t}>{labelTabla(t)}</option>)}
          </select>
          <select value={fOp} onChange={e => setFOp(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
            <option value="">Toda acción</option>
            <option value="INSERT">Creación</option>
            <option value="UPDATE">Modificación</option>
            <option value="DELETE">Eliminación</option>
          </select>
          <select value={fUsuario} onChange={e => setFUsuario(e.target.value)} className="border rounded-lg px-3 py-2 text-sm max-w-[160px]">
            <option value="">Todo usuario</option>
            {usuariosInicial.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm" title="Desde" />
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm" title="Hasta" />
          <button onClick={() => void cargar(page)} disabled={loading}
            className="p-2 border rounded-lg text-slate-600 hover:bg-slate-50" title="Recargar">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => void exportar()} disabled={exportando}
            className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm text-slate-700 hover:bg-slate-50">
            <Download className="w-4 h-4" /> CSV
          </button>
          <p className="text-sm text-gray-400 w-full sm:w-auto sm:ml-auto">{total.toLocaleString('es-HN')} eventos</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
                <th className="px-4 py-3 text-left">Fecha</th>
                <th className="px-4 py-3 text-left">Usuario</th>
                <th className="px-4 py-3 text-center">Acción</th>
                <th className="px-4 py-3 text-left">Tabla</th>
                <th className="px-4 py-3 text-left">Registro</th>
                <th className="px-4 py-3 text-left">Cambios</th>
                <th className="px-4 py-3 w-16" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && rows.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">Cargando…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-gray-400">Sin eventos para este filtro</td></tr>
              )}
              {rows.map(b => {
                const Icon = OP_ICON[b.operacion] ?? Pencil
                const critico = esCritico(b)
                const href = linkRegistro(b.tabla, b.registro_id)
                return (
                  <tr key={b.id} className={`hover:bg-gray-50 ${critico ? 'bg-red-50/60' : ''}`}>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtFechaAud(b.fecha)}</td>
                    <td className="px-4 py-3">
                      <p className="text-gray-800 text-sm">{b.usuario_nombre || '—'}</p>
                      {b.usuario_email && <p className="text-[11px] text-gray-400">{b.usuario_email}</p>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${OP_STYLE[b.operacion] ?? 'bg-gray-100'}`}>
                        <Icon className="w-3 h-3" /> {OP_LABEL[b.operacion] ?? b.operacion}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="font-medium text-slate-800">{labelTabla(b.tabla)}</span>
                      <span className="text-gray-400 ml-1 font-mono text-[10px]">{b.tabla}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {href ? (
                        <Link href={href} className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
                          {b.registro_id} <ExternalLink className="w-3 h-3" />
                        </Link>
                      ) : (b.registro_id || '—')}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                      {b.operacion === 'UPDATE' && b.campos_cambiados?.length
                        ? b.campos_cambiados.join(', ')
                        : b.operacion === 'INSERT' ? 'Registro nuevo'
                        : b.operacion === 'DELETE' ? 'Registro eliminado' : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => setVer(b)} className="p-1.5 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t flex items-center justify-between text-sm">
            <button onClick={() => void cargar(page - 1)} disabled={page <= 1 || loading}
              className="flex items-center gap-1 px-3 py-1.5 border rounded-lg disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" /> Anterior
            </button>
            <span className="text-slate-500">Página {page} de {totalPages}</span>
            <button onClick={() => void cargar(page + 1)} disabled={page >= totalPages || loading}
              className="flex items-center gap-1 px-3 py-1.5 border rounded-lg disabled:opacity-40">
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {ver && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-slate-600" /> Evento #{ver.id}
                {esCritico(ver) && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Crítico</span>}
              </h2>
              <button onClick={() => setVer(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /><span>{fmtFechaAud(ver.fecha)}</span></div>
                <div className="flex items-center gap-2"><User className="w-4 h-4 text-gray-400" /><span>{ver.usuario_nombre || ver.usuario_email || '—'}</span></div>
                <div><span className="text-xs text-gray-400 uppercase">Tabla</span><p className="font-medium">{labelTabla(ver.tabla)}</p></div>
                <div><span className="text-xs text-gray-400 uppercase">Registro</span><p className="font-mono text-sm">{ver.registro_id || '—'}</p></div>
                {ver.sucursal_id != null && (
                  <div><span className="text-xs text-gray-400 uppercase">Sucursal ID</span><p>{ver.sucursal_id}</p></div>
                )}
                {ver.ip_address && (
                  <div><span className="text-xs text-gray-400 uppercase">IP</span><p className="font-mono text-xs">{ver.ip_address}</p></div>
                )}
              </div>

              {ver.operacion === 'UPDATE' && ver.campos_cambiados?.length ? (
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-2">Campos modificados</p>
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="bg-gray-50 border-b text-gray-500">
                        <th className="px-3 py-2 text-left">Campo</th>
                        <th className="px-3 py-2 text-left">Antes</th>
                        <th className="px-3 py-2 text-left">Después</th>
                      </tr></thead>
                      <tbody className="divide-y">
                        {ver.campos_cambiados.map(c => (
                          <tr key={c}>
                            <td className="px-3 py-2 font-mono text-slate-700">{c}</td>
                            <td className="px-3 py-2 text-red-600 break-all max-w-[180px]">{valorAud(ver.datos_antes?.[c])}</td>
                            <td className="px-3 py-2 text-green-700 break-all max-w-[180px]">{valorAud(ver.datos_despues?.[c])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <details className="text-xs">
                <summary className="cursor-pointer text-gray-500 hover:text-gray-700">Ver datos completos (JSON)</summary>
                <pre className="mt-2 bg-gray-900 text-gray-100 rounded-lg p-3 overflow-x-auto max-h-64">
{JSON.stringify(ver.datos_despues ?? ver.datos_antes ?? {}, null, 2)}
                </pre>
              </details>
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-2">
              {linkRegistro(ver.tabla, ver.registro_id) && (
                <Link href={linkRegistro(ver.tabla, ver.registro_id)!}
                  className="px-4 py-2 border rounded-xl text-sm text-blue-600 hover:bg-blue-50">
                  Ir al registro
                </Link>
              )}
              <button onClick={() => setVer(null)} className="px-4 py-2 bg-gray-100 rounded-xl text-sm">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
