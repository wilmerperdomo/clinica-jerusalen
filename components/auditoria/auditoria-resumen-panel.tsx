'use client'

import {
  History, Database, AlertTriangle, CheckCircle2, Trash2, TrendingUp, Users, Table2,
} from 'lucide-react'
import {
  type ResumenAuditoria, labelTabla, fmtBytes, fmtFechaAud, calcularSaludRespaldo,
} from '@/lib/auditoria-utils'

interface Props {
  resumen: ResumenAuditoria
  accesos: { id: number; accion: string; detalle?: string | null; usuario_nombre?: string | null; ip_address?: string | null; fecha: string }[]
}

export default function AuditoriaResumenPanel({ resumen, accesos }: Props) {
  const salud = calcularSaludRespaldo(resumen.ultimoRespaldoAuto)
  const maxDia = Math.max(...resumen.eventosPorDia.map(d => d.total), 1)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-slate-500 flex items-center gap-1"><History className="w-3.5 h-3.5" /> Eventos totales</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{resumen.totalEventos.toLocaleString('es-HN')}</p>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-slate-500 flex items-center gap-1"><Trash2 className="w-3.5 h-3.5" /> Eliminaciones hoy</p>
          <p className={`text-2xl font-bold mt-1 ${resumen.eliminacionesHoy > 0 ? 'text-red-600' : 'text-slate-800'}`}>
            {resumen.eliminacionesHoy}
          </p>
        </div>
        <div className={`border rounded-xl p-4 ${salud.saludable ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <p className="text-xs text-slate-600 flex items-center gap-1">
            {salud.saludable ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
            Respaldo automático
          </p>
          <p className="text-sm font-semibold mt-1">{salud.mensaje}</p>
          {resumen.ultimoRespaldoAuto && (
            <p className="text-xs text-slate-500 mt-1">
              {fmtBytes(resumen.ultimoRespaldoAuto.tamano_bytes)} · {resumen.ultimoRespaldoAuto.registros?.toLocaleString('es-HN')} reg.
            </p>
          )}
        </div>
        <div className="bg-white border rounded-xl p-4">
          <p className="text-xs text-slate-500 flex items-center gap-1"><Database className="w-3.5 h-3.5" /> Retención auto</p>
          <p className="text-sm font-semibold mt-1">14 copias diarias</p>
          <p className="text-xs text-slate-500">Bitácora: 12 meses (fn_purgar)</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-white border rounded-xl p-4 lg:col-span-1">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm mb-3">
            <TrendingUp className="w-4 h-4 text-violet-600" /> Eventos últimos 7 días
          </h3>
          {resumen.eventosPorDia.length === 0 ? (
            <p className="text-sm text-slate-400">Sin datos recientes</p>
          ) : (
            <div className="space-y-2">
              {resumen.eventosPorDia.map(d => (
                <div key={d.fecha} className="flex items-center gap-2 text-xs">
                  <span className="w-16 text-slate-500">{d.fecha.slice(5)}</span>
                  <div className="flex-1 h-5 bg-slate-100 rounded overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded"
                      style={{ width: `${(d.total / maxDia) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-medium">{d.total}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm mb-3">
            <Users className="w-4 h-4 text-blue-600" /> Usuarios más activos
          </h3>
          <ul className="space-y-2 text-sm">
            {resumen.topUsuarios.map(u => (
              <li key={u.nombre} className="flex justify-between">
                <span className="text-slate-700 truncate">{u.nombre}</span>
                <span className="font-medium text-slate-500">{u.total}</span>
              </li>
            ))}
            {resumen.topUsuarios.length === 0 && <li className="text-slate-400">—</li>}
          </ul>
        </div>

        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold text-slate-800 flex items-center gap-2 text-sm mb-3">
            <Table2 className="w-4 h-4 text-emerald-600" /> Tablas más modificadas
          </h3>
          <ul className="space-y-2 text-sm">
            {resumen.topTablas.map(t => (
              <li key={t.tabla} className="flex justify-between gap-2">
                <span className="text-slate-700 truncate">{labelTabla(t.tabla)}</span>
                <span className="font-medium text-slate-500 shrink-0">{t.total}</span>
              </li>
            ))}
            {resumen.topTablas.length === 0 && <li className="text-slate-400">—</li>}
          </ul>
        </div>
      </div>

      {resumen.ultimoRespaldoAuto && (
        <div className="bg-slate-50 border rounded-xl p-4 text-xs text-slate-600">
          <strong>Último respaldo automático:</strong> {fmtFechaAud(resumen.ultimoRespaldoAuto.created_at)}
          {resumen.ultimoRespaldoAuto.hash_sha256 && (
            <span className="ml-2 font-mono">SHA-256: {resumen.ultimoRespaldoAuto.hash_sha256.slice(0, 16)}…</span>
          )}
        </div>
      )}

      {accesos.length > 0 && (
        <div className="bg-white border rounded-xl p-4">
          <h3 className="font-semibold text-slate-800 text-sm mb-3">Accesos recientes al módulo</h3>
          <ul className="space-y-1.5 text-xs">
            {accesos.map(a => (
              <li key={a.id} className="flex flex-wrap gap-x-3 gap-y-0.5 text-slate-600">
                <span className="text-slate-400">{fmtFechaAud(a.fecha)}</span>
                <span className="font-medium">{a.accion}</span>
                <span>{a.usuario_nombre || '—'}</span>
                {a.detalle && <span className="text-slate-400 truncate max-w-[200px]">{a.detalle}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
