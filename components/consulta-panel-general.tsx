'use client'

import { ClipboardList, Sparkles, Link2, Pill, FlaskConical } from 'lucide-react'
import {
  type FormConsultaGeneral,
  REVISION_SISTEMAS,
  etiquetaIMC,
} from '@/lib/consulta-general-utils'
import { PLANTILLAS_CONSULTA } from '@/lib/consulta-plantillas'

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-slate-200 outline-none'
const textareaCls = `${inputCls} resize-y min-h-[2.5rem]`

interface Props {
  form: FormConsultaGeneral
  onChange: (f: FormConsultaGeneral) => void
  onAplicarPlantilla: (id: string) => void
  onConectarMedicamentos?: () => void
  onConectarEstudios?: () => void
  peso?: string | null
  talla?: string | null
}

export default function ConsultaPanelGeneral({
  form, onChange, onAplicarPlantilla, onConectarMedicamentos, onConectarEstudios, peso, talla,
}: Props) {
  const set = <K extends keyof FormConsultaGeneral>(key: K, v: FormConsultaGeneral[K]) =>
    onChange({ ...form, [key]: v })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <span className="text-[11px] font-semibold text-slate-500 uppercase self-center mr-1">Plantillas:</span>
        {PLANTILLAS_CONSULTA.map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => onAplicarPlantilla(p.id)}
            className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition"
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Dolor (0-10)</label>
          <input type="number" min="0" max="10" value={form.escala_dolor}
            onChange={e => set('escala_dolor', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Glasgow</label>
          <input type="number" min="3" max="15" value={form.glasgow}
            onChange={e => set('glasgow', e.target.value)} className={inputCls} placeholder="3-15" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">IMC</label>
          <input value={form.imc} readOnly className={`${inputCls} bg-white text-slate-700`} />
          {form.imc && (
            <p className="text-[10px] text-slate-500 mt-0.5">{etiquetaIMC(form.imc)} · P:{peso} T:{talla}</p>
          )}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1">
          <ClipboardList className="w-3.5 h-3.5" /> Objetivo — Revisión por sistemas
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {REVISION_SISTEMAS.map(s => (
            <div key={s.key}>
              <label className="block text-xs text-gray-500 mb-0.5">{s.label}</label>
              <input value={form[s.key]} onChange={e => set(s.key, e.target.value)}
                className={inputCls} placeholder="Normal / hallazgos..." />
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2 flex items-center gap-1">
          <Sparkles className="w-3.5 h-3.5" /> Plan — Estructurado
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Medicamentos</label>
              {onConectarMedicamentos && form.plan_medicamentos.trim() && (
                <button type="button" onClick={onConectarMedicamentos}
                  className="text-[10px] font-semibold text-emerald-700 flex items-center gap-0.5 hover:underline">
                  <Link2 className="w-3 h-3" /><Pill className="w-3 h-3" /> A receta
                </button>
              )}
            </div>
            <textarea rows={2} value={form.plan_medicamentos}
              onChange={e => set('plan_medicamentos', e.target.value)} className={textareaCls}
              placeholder="Una línea por medicamento. Ej: Paracetamol 500mg — 1 tab c/8h x 5 días" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs text-gray-500">Estudios / laboratorio</label>
              {onConectarEstudios && form.plan_estudios.trim() && (
                <button type="button" onClick={onConectarEstudios}
                  className="text-[10px] font-semibold text-blue-700 flex items-center gap-0.5 hover:underline">
                  <Link2 className="w-3 h-3" /><FlaskConical className="w-3 h-3" /> A pedido lab
                </button>
              )}
            </div>
            <textarea rows={2} value={form.plan_estudios}
              onChange={e => set('plan_estudios', e.target.value)} className={textareaCls}
              placeholder="Una línea por estudio. Ej: Biometría hemática; Glucosa" />
          </div>
          {([
            ['plan_recomendaciones', 'Recomendaciones'],
            ['plan_signos_alarma', 'Signos de alarma'],
            ['plan_seguimiento', 'Seguimiento'],
          ] as const).map(([key, label]) => (
            <div key={key} className={key === 'plan_seguimiento' ? 'sm:col-span-2' : ''}>
              <label className="block text-xs text-gray-500 mb-1">{label}</label>
              <textarea rows={2} value={form[key]} onChange={e => set(key, e.target.value)} className={textareaCls} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
