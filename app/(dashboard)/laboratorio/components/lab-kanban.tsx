'use client'

import { AlertTriangle, FlaskConical, Tag } from 'lucide-react'
import {
  KANBAN_COLUMNAS_LAB,
  etiquetaEstadoLab,
  claseBadgeEstadoLab,
  type EstadoLab,
} from '@/lib/lab-estado-utils'
import type { GrupoLab } from '@/lib/lab-utils'

interface Props {
  grupos: GrupoLab[]
  onAbrirGrupo: (g: GrupoLab) => void
  onEtiquetas: (g: GrupoLab) => void
  onMoverGrupo: (g: GrupoLab, nuevoEstado: EstadoLab) => void
}

export default function LabKanban({ grupos, onAbrirGrupo, onEtiquetas, onMoverGrupo }: Props) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 min-h-[420px]">
      {KANBAN_COLUMNAS_LAB.map(col => {
        const items = grupos.filter(g => col.estados.includes(g.estado))
        return (
          <div
            key={col.id}
            className={`flex-shrink-0 w-64 sm:w-72 rounded-xl border ${col.color} flex flex-col`}
          >
            <div className="px-3 py-2 border-b border-inherit flex items-center justify-between">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{col.label}</span>
              <span className="text-xs bg-white/80 px-2 py-0.5 rounded-full font-semibold text-gray-600">
                {items.length}
              </span>
            </div>
            <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[520px]">
              {items.length === 0 && (
                <p className="text-[11px] text-gray-400 text-center py-6">Sin órdenes</p>
              )}
              {items.map(g => (
                <div
                  key={g.grupoId}
                  className="bg-white rounded-lg border shadow-sm p-3 space-y-2 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-gray-900 truncate">{g.pacienteNombre}</p>
                      <p className="text-[10px] text-gray-400">{g.pacienteCodigo} · {g.fecha}</p>
                    </div>
                    {g.atrasado && (
                      <span title={`${g.diasAtraso} día(s) de atraso`} className="text-red-500 shrink-0">
                        <AlertTriangle className="w-4 h-4" />
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {g.pruebas.slice(0, 3).map((p, i) => (
                      <span key={i} className="text-[10px] bg-cyan-50 text-cyan-800 px-1.5 py-0.5 rounded">
                        {p}
                      </span>
                    ))}
                    {g.pruebas.length > 3 && (
                      <span className="text-[10px] text-gray-400">+{g.pruebas.length - 3}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-gray-500">
                    <span>L. {g.totalImporte.toFixed(2)}</span>
                    {g.fechaPrometida && (
                      <span className={g.atrasado ? 'text-red-600 font-semibold' : ''}>
                        Prom: {g.fechaPrometida}
                      </span>
                    )}
                  </div>
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${claseBadgeEstadoLab(g.estado)}`}>
                    {etiquetaEstadoLab(g.estado)}
                  </span>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {['PAGADO', 'EN_PROCESO', 'RESULTADO_LISTO', 'VALIDADO', 'ENTREGADO'].includes(g.estado) && (
                      <button
                        type="button"
                        onClick={() => onAbrirGrupo(g)}
                        className="flex-1 min-w-0 px-2 py-1 rounded text-[10px] font-semibold bg-teal-600 text-white hover:bg-teal-700"
                      >
                        <FlaskConical className="w-3 h-3 inline mr-0.5" />
                        {g.estado === 'ENTREGADO' ? 'Ver' : 'Resultados'}
                      </button>
                    )}
                    {g.estado !== 'PENDIENTE_COBRO' && (
                      <button
                        type="button"
                        onClick={() => onEtiquetas(g)}
                        className="px-2 py-1 rounded text-[10px] bg-gray-100 hover:bg-gray-200"
                        title="Etiquetas de tubo"
                      >
                        <Tag className="w-3 h-3" />
                      </button>
                    )}
                    {g.estado !== 'ENTREGADO' && g.estado !== 'PENDIENTE_COBRO' && (
                      <select
                        className="text-[10px] border rounded px-1 py-1 max-w-[90px]"
                        value=""
                        onChange={e => {
                          const v = e.target.value as EstadoLab
                          if (v) onMoverGrupo(g, v)
                          e.target.value = ''
                        }}
                      >
                        <option value="">Mover…</option>
                        {KANBAN_COLUMNAS_LAB.filter(c => !c.estados.includes(g.estado)).map(c => (
                          <option key={c.id} value={c.estados[0]}>{c.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
