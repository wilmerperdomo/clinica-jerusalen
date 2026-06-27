'use client'

import { useState, useMemo, useTransition } from 'react'
import {
  ShieldCheck, History, Database, Search, X, Eye, RefreshCw,
  Download, Trash2, FilePlus2, AlertTriangle, Plus, Pencil, Trash,
  Clock, User,
} from 'lucide-react'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnPrimary, ModuleBtnGhost } from '@/components/module-layout'
import { generarRespaldoManual, urlDescargaRespaldo, eliminarRespaldo } from './actions'
import { useConfirm } from '@/components/confirm-dialog'

interface Bitacora {
  id: number; tabla: string; registro_id?: string | null; operacion: string
  datos_antes?: Record<string, unknown> | null
  datos_despues?: Record<string, unknown> | null
  campos_cambiados?: string[] | null
  usuario_email?: string | null; usuario_nombre?: string | null; fecha: string
}
interface Respaldo {
  id: number; archivo: string; tipo: string; tablas: number
  registros: number; tamano_bytes: number; generado_por_nombre?: string | null; created_at: string
}
interface Props {
  bitacora: Bitacora[]
  respaldos: Respaldo[]
  serviceRoleDisponible: boolean
}

const OP_STYLE: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-700',
  UPDATE: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
}
const OP_LABEL: Record<string, string> = { INSERT: 'Creó', UPDATE: 'Modificó', DELETE: 'Eliminó' }
const OP_ICON: Record<string, typeof Plus> = { INSERT: Plus, UPDATE: Pencil, DELETE: Trash }

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}
function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' })
}
function valor(v: unknown): string {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export default function AuditoriaClient({ bitacora: initBit, respaldos: initResp, serviceRoleDisponible }: Props) {
  const confirmDialog = useConfirm()
  const [tab, setTab] = useState<'bitacora' | 'respaldos'>('bitacora')
  const [respaldos, setRespaldos] = useState<Respaldo[]>(initResp)

  // filtros bitácora
  const [buscar, setBuscar] = useState('')
  const [fTabla, setFTabla] = useState('')
  const [fOp, setFOp] = useState('')
  const [ver, setVer] = useState<Bitacora | null>(null)

  // respaldos
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState('')
  const [bajando, setBajando] = useState<number | null>(null)

  const tablas = useMemo(() => Array.from(new Set(initBit.map(b => b.tabla))).sort(), [initBit])

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return initBit.filter(b => {
      if (fTabla && b.tabla !== fTabla) return false
      if (fOp && b.operacion !== fOp) return false
      if (!q) return true
      return (
        b.tabla.toLowerCase().includes(q) ||
        (b.usuario_nombre || '').toLowerCase().includes(q) ||
        (b.usuario_email || '').toLowerCase().includes(q) ||
        (b.registro_id || '').toLowerCase().includes(q)
      )
    })
  }, [initBit, buscar, fTabla, fOp])

  const stats = useMemo(() => ({
    total: initBit.length,
    crea: initBit.filter(b => b.operacion === 'INSERT').length,
    modi: initBit.filter(b => b.operacion === 'UPDATE').length,
    elim: initBit.filter(b => b.operacion === 'DELETE').length,
  }), [initBit])

  function generar() {
    setMsg('')
    startTransition(async () => {
      const r = await generarRespaldoManual()
      if (r.ok && r.respaldo) {
        setRespaldos(prev => [r.respaldo as Respaldo, ...prev])
        setMsg('Respaldo generado correctamente.')
      } else {
        setMsg('Error: ' + (r.error || 'No se pudo generar el respaldo'))
      }
    })
  }

  async function descargar(r: Respaldo) {
    setBajando(r.id)
    try {
      const res = await urlDescargaRespaldo(r.archivo)
      if (res.ok) window.open(res.url, '_blank')
      else alert('Error: ' + res.error)
    } finally { setBajando(null) }
  }

  async function eliminar(r: Respaldo) {
    const { confirmed } = await confirmDialog({
      title: 'Eliminar respaldo',
      message: `¿Está seguro que desea eliminar el respaldo del ${fmtFecha(r.created_at)}? Esta acción no se puede deshacer.`,
      variant: 'danger',
      confirmLabel: 'Eliminar',
      details: [
        { label: 'Archivo', value: r.archivo },
        { label: 'Registros', value: String(r.registros) },
      ],
    })
    if (!confirmed) return
    const res = await eliminarRespaldo(r.id, r.archivo)
    if (res.ok) setRespaldos(prev => prev.filter(x => x.id !== r.id))
    else alert('Error: ' + res.error)
  }

  return (
    <ModuleShell tint="violet">
      <ModuleHero
        title="Auditoría y Respaldos"
        subtitle="Quién creó, modificó o borró qué y cuándo — y copias de seguridad de la base de datos"
        badge="Super Admin"
        icon={ShieldCheck}
        kpis={[
          { label: 'Eventos registrados', value: stats.total, icon: History },
          { label: 'Creaciones', value: stats.crea, icon: Plus },
          { label: 'Modificaciones', value: stats.modi, icon: Pencil },
          { label: 'Eliminaciones', value: stats.elim, icon: Trash },
          { label: 'Respaldos', value: respaldos.length, icon: Database },
        ]}
        actions={
          <>
            <ModuleBtnGhost onClick={() => setTab('bitacora')}>
              <History className="w-4 h-4" /> Bitácora
            </ModuleBtnGhost>
            <ModuleBtnGhost onClick={() => setTab('respaldos')}>
              <Database className="w-4 h-4" /> Respaldos
            </ModuleBtnGhost>
          </>
        }
      />
      <ModuleContent>

        {tab === 'bitacora' && (
          <div className="bg-white border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input value={buscar} onChange={e => setBuscar(e.target.value)}
                  placeholder="Usuario, tabla, ID de registro…"
                  className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
              </div>
              <select value={fTabla} onChange={e => setFTabla(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm text-gray-700">
                <option value="">Todas las tablas</option>
                {tablas.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={fOp} onChange={e => setFOp(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm text-gray-700">
                <option value="">Toda acción</option>
                <option value="INSERT">Creación</option>
                <option value="UPDATE">Modificación</option>
                <option value="DELETE">Eliminación</option>
              </select>
              <p className="text-sm text-gray-400 ml-auto">{filtradas.length} eventos</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3 text-left">Fecha / Hora</th>
                    <th className="px-4 py-3 text-left">Usuario</th>
                    <th className="px-4 py-3 text-center">Acción</th>
                    <th className="px-4 py-3 text-left">Tabla</th>
                    <th className="px-4 py-3 text-left">Registro</th>
                    <th className="px-4 py-3 text-left">Cambios</th>
                    <th className="px-4 py-3 text-center w-16">Ver</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtradas.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-16 text-gray-400">
                      <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      Sin eventos para este filtro
                    </td></tr>
                  )}
                  {filtradas.map(b => {
                    const Icon = OP_ICON[b.operacion] ?? Pencil
                    return (
                      <tr key={b.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtFecha(b.fecha)}</td>
                        <td className="px-4 py-3">
                          <p className="text-gray-800 text-sm">{b.usuario_nombre || '—'}</p>
                          {b.usuario_email && <p className="text-[11px] text-gray-400">{b.usuario_email}</p>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${OP_STYLE[b.operacion] ?? 'bg-gray-100 text-gray-600'}`}>
                            <Icon className="w-3 h-3" /> {OP_LABEL[b.operacion] ?? b.operacion}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{b.tabla}</td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.registro_id || '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 max-w-[220px] truncate">
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
          </div>
        )}

        {tab === 'respaldos' && (
          <div className="space-y-4">
            {!serviceRoleDisponible && (
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span>El respaldo requiere <strong>SUPABASE_SERVICE_ROLE_KEY</strong> configurado en el servidor (variables de entorno en Vercel). Sin esa clave no se pueden generar respaldos.</span>
              </div>
            )}

            <div className="bg-white border rounded-2xl p-5 flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[220px]">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Database className="w-4 h-4 text-slate-500" /> Copias de seguridad</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Exporta toda la base de datos a un archivo JSON guardado en almacenamiento privado. El respaldo automático se ejecuta a diario.
                </p>
              </div>
              <ModuleBtnPrimary onClick={generar} disabled={pending || !serviceRoleDisponible}>
                {pending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />}
                Generar respaldo ahora
              </ModuleBtnPrimary>
            </div>

            {msg && (
              <p className={`text-sm px-4 py-2 rounded-lg ${msg.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>{msg}</p>
            )}

            <div className="bg-white border rounded-2xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
                      <th className="px-4 py-3 text-left">Fecha</th>
                      <th className="px-4 py-3 text-center">Tipo</th>
                      <th className="px-4 py-3 text-right">Tablas</th>
                      <th className="px-4 py-3 text-right">Registros</th>
                      <th className="px-4 py-3 text-right">Tamaño</th>
                      <th className="px-4 py-3 text-left">Generado por</th>
                      <th className="px-4 py-3 text-center w-28">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {respaldos.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-16 text-gray-400">
                        <Database className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        Aún no hay respaldos
                      </td></tr>
                    )}
                    {respaldos.map(r => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 text-xs whitespace-nowrap">{fmtFecha(r.created_at)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.tipo === 'AUTOMATICO' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                            {r.tipo === 'AUTOMATICO' ? 'Automático' : 'Manual'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">{r.tablas}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{r.registros?.toLocaleString('es-HN')}</td>
                        <td className="px-4 py-3 text-right text-gray-500 text-xs">{fmtBytes(r.tamano_bytes)}</td>
                        <td className="px-4 py-3 text-gray-600 text-xs">{r.generado_por_nombre || '—'}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button onClick={() => descargar(r)} disabled={bajando === r.id} title="Descargar"
                              className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50">
                              {bajando === r.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => eliminar(r)} title="Eliminar"
                              className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </ModuleContent>

      {/* ── Modal detalle de evento ── */}
      {ver && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-slate-600" /> Evento #{ver.id}
              </h2>
              <button onClick={() => setVer(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /><span>{fmtFecha(ver.fecha)}</span></div>
                <div className="flex items-center gap-2"><User className="w-4 h-4 text-gray-400" /><span>{ver.usuario_nombre || ver.usuario_email || '—'}</span></div>
                <div><span className="text-xs text-gray-400 uppercase">Tabla</span><p className="font-mono text-sm">{ver.tabla}</p></div>
                <div><span className="text-xs text-gray-400 uppercase">Registro</span><p className="font-mono text-sm">{ver.registro_id || '—'}</p></div>
                <div>
                  <span className="text-xs text-gray-400 uppercase">Acción</span>
                  <p><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${OP_STYLE[ver.operacion] ?? 'bg-gray-100'}`}>{OP_LABEL[ver.operacion] ?? ver.operacion}</span></p>
                </div>
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
                            <td className="px-3 py-2 text-red-600 break-all max-w-[180px]">{valor(ver.datos_antes?.[c])}</td>
                            <td className="px-3 py-2 text-green-700 break-all max-w-[180px]">{valor(ver.datos_despues?.[c])}</td>
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
            <div className="px-6 py-4 border-t flex justify-end">
              <button onClick={() => setVer(null)} className="px-4 py-2 bg-gray-100 rounded-xl text-sm">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </ModuleShell>
  )
}
