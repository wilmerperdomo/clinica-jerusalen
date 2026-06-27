'use client'

import { useState, useTransition } from 'react'
import {
  Database, AlertTriangle, FilePlus2, RefreshCw, Download, Trash2, CheckCircle2, Shield,
} from 'lucide-react'
import { ModuleBtnPrimary } from '@/components/module-layout'
import { useConfirm } from '@/components/confirm-dialog'
import {
  type RespaldoRow, fmtBytes, fmtFechaAud, calcularSaludRespaldo,
} from '@/lib/auditoria-utils'
import { generarRespaldoManual, urlDescargaRespaldo, eliminarRespaldo } from '@/app/(dashboard)/auditoria/actions'

interface Props {
  respaldosInicial: RespaldoRow[]
  serviceRoleDisponible: boolean
}

export default function AuditoriaRespaldosPanel({ respaldosInicial, serviceRoleDisponible }: Props) {
  const confirmDialog = useConfirm()
  const [respaldos, setRespaldos] = useState(respaldosInicial)
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState('')
  const [bajando, setBajando] = useState<number | null>(null)
  const [nota, setNota] = useState('')

  const ultimoAuto = respaldos.find(r => r.tipo === 'AUTOMATICO') ?? null
  const salud = calcularSaludRespaldo(ultimoAuto)

  function generar() {
    setMsg('')
    startTransition(async () => {
      const { confirmed } = await confirmDialog({
        title: 'Generar respaldo manual',
        message: '¿Está seguro que desea generar una copia de seguridad completa de la base de datos?',
        variant: 'warning',
        confirmLabel: 'Generar respaldo',
        details: [
          { label: 'Formato', value: 'JSON comprimido (.gz)' },
          { label: 'Tablas', value: '~70 tablas de negocio' },
        ],
      })
      if (!confirmed) return

      const r = await generarRespaldoManual(nota)
      if (r.ok && r.respaldo) {
        setRespaldos(prev => [r.respaldo as RespaldoRow, ...prev])
        setNota('')
        setMsg('Respaldo generado correctamente.')
      } else {
        setMsg('Error: ' + (r.error || 'No se pudo generar'))
      }
    })
  }

  async function descargar(r: RespaldoRow) {
    setBajando(r.id)
    try {
      const res = await urlDescargaRespaldo(r.archivo)
      if (res.ok) window.open(res.url, '_blank')
      else alert('Error: ' + res.error)
    } finally { setBajando(null) }
  }

  async function eliminar(r: RespaldoRow) {
    const { confirmed } = await confirmDialog({
      title: 'Eliminar respaldo',
      message: `¿Está seguro que desea eliminar el respaldo del ${fmtFechaAud(r.created_at)}?`,
      variant: 'danger',
      confirmLabel: 'Eliminar',
      details: [
        { label: 'Archivo', value: r.archivo },
        { label: 'Registros', value: String(r.registros) },
        { label: 'Hash', value: r.hash_sha256?.slice(0, 16) + '…' || '—' },
      ],
    })
    if (!confirmed) return
    const res = await eliminarRespaldo(r.id, r.archivo)
    if (res.ok) setRespaldos(prev => prev.filter(x => x.id !== r.id))
    else alert('Error: ' + res.error)
  }

  return (
    <div className="space-y-4">
      {!serviceRoleDisponible && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-xl text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>Configure <strong>SUPABASE_SERVICE_ROLE_KEY</strong> en Vercel para generar respaldos.</span>
        </div>
      )}

      <div className={`border rounded-xl p-4 flex flex-wrap gap-4 items-center ${salud.saludable ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
        {salud.saludable
          ? <CheckCircle2 className="w-8 h-8 text-green-600 shrink-0" />
          : <AlertTriangle className="w-8 h-8 text-amber-600 shrink-0" />}
        <div className="flex-1 min-w-[200px]">
          <p className="font-semibold text-slate-800">Salud del respaldo automático</p>
          <p className="text-sm text-slate-600 mt-0.5">{salud.mensaje}</p>
          <p className="text-xs text-slate-500 mt-1">Cron diario · Retención: 14 copias automáticas · Formato gzip + SHA-256</p>
        </div>
        {ultimoAuto?.hash_sha256 && (
          <div className="text-xs font-mono text-slate-500 max-w-[200px] truncate" title={ultimoAuto.hash_sha256}>
            <Shield className="w-3.5 h-3.5 inline mr-1" />
            {ultimoAuto.hash_sha256.slice(0, 24)}…
          </div>
        )}
      </div>

      <div className="bg-white border rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-[220px]">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-500" /> Generar respaldo manual
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Exporta tablas de negocio a JSON comprimido. Incluye planilla, laboratorio, finanzas e inventario.
            </p>
          </div>
          <ModuleBtnPrimary onClick={generar} disabled={pending || !serviceRoleDisponible}>
            {pending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FilePlus2 className="w-4 h-4" />}
            Generar ahora
          </ModuleBtnPrimary>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Nota opcional</label>
          <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: Antes de cierre mensual"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
        </div>
      </div>

      {msg && (
        <p className={`text-sm px-4 py-2 rounded-lg border ${msg.startsWith('Error') ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}>
          {msg}
        </p>
      )}

      <div className="bg-white border rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
              <th className="px-4 py-3 text-left">Fecha</th>
              <th className="px-4 py-3 text-center">Tipo</th>
              <th className="px-4 py-3 text-right">Tablas</th>
              <th className="px-4 py-3 text-right">Registros</th>
              <th className="px-4 py-3 text-right">Tamaño</th>
              <th className="px-4 py-3 text-left">Nota / Usuario</th>
              <th className="px-4 py-3 text-center">Integridad</th>
              <th className="px-4 py-3 text-center w-24">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {respaldos.length === 0 && (
              <tr><td colSpan={8} className="text-center py-16 text-gray-400">
                <Database className="w-10 h-10 mx-auto mb-2 opacity-30" /> Aún no hay respaldos
              </td></tr>
            )}
            {respaldos.map(r => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-xs whitespace-nowrap">{fmtFechaAud(r.created_at)}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.tipo === 'AUTOMATICO' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                    {r.tipo === 'AUTOMATICO' ? 'Auto' : 'Manual'}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{r.tablas}</td>
                <td className="px-4 py-3 text-right">{r.registros?.toLocaleString('es-HN')}</td>
                <td className="px-4 py-3 text-right text-xs">
                  {fmtBytes(r.tamano_bytes)}
                  {r.comprimido && <span className="text-violet-600 ml-1">.gz</span>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600 max-w-[160px] truncate">
                  {r.nota || r.generado_por_nombre || '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  {r.hash_sha256
                    ? <span className="text-green-600 text-xs" title={r.hash_sha256}>✓ SHA-256</span>
                    : <span className="text-gray-400 text-xs">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex justify-center gap-1">
                    <button onClick={() => void descargar(r)} disabled={bajando === r.id}
                      className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50">
                      {bajando === r.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={() => void eliminar(r)} className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100">
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
  )
}
