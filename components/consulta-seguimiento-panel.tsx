'use client'

import { CalendarClock, MessageCircle, AlertTriangle } from 'lucide-react'
import {
  ATAJOS_SEGUIMIENTO,
  MOTIVOS_SEGUIMIENTO,
  aplicarAtajoSeguimiento,
  type FormSeguimiento,
} from '@/lib/consulta-seguimiento-utils'
import { fmtFechaLarga } from '@/lib/consultas-utils'
import { limpiarCelular } from '@/lib/agenda-utils'

interface ServicioOpt {
  id: number
  nombre: string
}

interface Props {
  value: FormSeguimiento
  onChange: (v: FormSeguimiento) => void
  fechaHoy: string
  serviciosConsulta: ServicioOpt[]
  diasReposo?: number
  celularPaciente?: string | null
}

export default function ConsultaSeguimientoPanel({
  value,
  onChange,
  fechaHoy,
  serviciosConsulta,
  diasReposo = 0,
  celularPaciente,
}: Props) {
  const tieneCelular = !!limpiarCelular(celularPaciente ?? undefined)

  function patch(partial: Partial<FormSeguimiento>) {
    onChange({ ...value, ...partial })
  }

  function activarSeguimiento(activo: boolean) {
    if (!activo) {
      patch({ activo: false })
      return
    }
    const sugerenciaDias = diasReposo > 0 ? diasReposo : 7
    patch({
      activo: true,
      fecha: aplicarAtajoSeguimiento(value, fechaHoy, sugerenciaDias).fecha,
      servicioId: value.servicioId || (serviciosConsulta[0] ? String(serviciosConsulta[0].id) : ''),
    })
  }

  return (
    <div className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50/90 via-white to-cyan-50/60 p-4 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-1">
        <div>
          <p className="text-sm font-bold text-[#003366] flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-sky-600" />
            Seguimiento / Próxima cita
          </p>
          <p className="text-xs text-sky-700/70 mt-0.5">
            Al finalizar el examen se creará la cita en la agenda de recepción.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 cursor-pointer select-none self-start sm:self-center">
          <span className="text-xs font-medium text-gray-600">Agendar seguimiento</span>
          <button
            type="button"
            role="switch"
            aria-checked={value.activo}
            onClick={() => activarSeguimiento(!value.activo)}
            className={`relative w-11 h-6 rounded-full transition-colors ${value.activo ? 'bg-[#003366]' : 'bg-gray-300'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value.activo ? 'translate-x-5' : ''}`}
            />
          </button>
        </label>
      </div>

      {value.activo && (
        <div className="mt-4 space-y-4 border-t border-sky-100 pt-4">
          {diasReposo > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              Reposo indicado: {diasReposo} día{diasReposo !== 1 ? 's' : ''}. Fecha sugerida al activar seguimiento.
            </p>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Atajos rápidos</p>
            <div className="flex flex-wrap gap-2">
              {ATAJOS_SEGUIMIENTO.map(a => (
                <button
                  key={a.dias}
                  type="button"
                  onClick={() => patch(aplicarAtajoSeguimiento(value, fechaHoy, a.dias))}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-sky-200 bg-white text-[#003366] hover:bg-sky-50 hover:border-sky-300 transition"
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
              <input
                type="date"
                min={fechaHoy}
                value={value.fecha}
                onChange={e => patch({ fecha: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              />
              {value.fecha && (
                <p className="text-[10px] text-gray-400 mt-1 capitalize">{fmtFechaLarga(value.fecha)}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hora</label>
              <input
                type="time"
                value={value.hora}
                onChange={e => patch({ hora: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Motivo del seguimiento</label>
              <select
                value={value.motivo}
                onChange={e => patch({ motivo: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              >
                {MOTIVOS_SEGUIMIENTO.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de consulta a agendar</label>
              <select
                value={value.servicioId}
                onChange={e => patch({ servicioId: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              >
                {serviciosConsulta.length === 0 ? (
                  <option value="">Consulta general</option>
                ) : (
                  serviciosConsulta.map(s => (
                    <option key={s.id} value={String(s.id)}>{s.nombre}</option>
                  ))
                )}
              </select>
            </div>
          </div>

          {value.motivo === 'otro' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Especifique el motivo</label>
              <input
                value={value.motivoOtro}
                onChange={e => patch({ motivoOtro: e.target.value })}
                placeholder="Ej. Control de herida, valoración especializada..."
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Prioridad</label>
            <div className="flex flex-wrap gap-2">
              {([
                { id: 'normal', label: 'Normal' },
                { id: 'urgente', label: 'Urgente' },
              ] as const).map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => patch({ prioridad: p.id })}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                    value.prioridad === p.id
                      ? p.id === 'urgente'
                        ? 'bg-red-600 text-white border-red-600'
                        : 'bg-[#003366] text-white border-[#003366]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nota para recepción (opcional)</label>
            <textarea
              value={value.notaRecepcion}
              onChange={e => patch({ notaRecepcion: e.target.value })}
              rows={2}
              placeholder="Instrucciones para agenda: traer estudios, ayuno, acompañante, etc."
              className="w-full border rounded-lg px-3 py-2 text-sm bg-white resize-y min-h-[60px]"
            />
          </div>

          {tieneCelular ? (
            <label className="flex items-start gap-2 cursor-pointer rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2.5">
              <input
                type="checkbox"
                checked={value.enviarWhatsApp}
                onChange={e => patch({ enviarWhatsApp: e.target.checked })}
                className="mt-0.5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-400"
              />
              <span className="text-xs text-emerald-900">
                <span className="font-semibold flex items-center gap-1">
                  <MessageCircle className="w-3.5 h-3.5" />
                  Enviar recordatorio por WhatsApp al finalizar
                </span>
                <span className="text-emerald-700/80 block mt-0.5">
                  Se abrirá WhatsApp con el mensaje de confirmación para el paciente.
                </span>
              </span>
            </label>
          ) : (
            <p className="text-xs text-gray-400 italic">
              Sin celular registrado — no se puede enviar WhatsApp desde aquí.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
