'use client'

import type { FormControlPrenatal } from '@/lib/control-prenatal-utils'

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-pink-200 focus:border-pink-400 outline-none'
const textareaCls = `${inputCls} resize-y min-h-[2.5rem]`

interface Props {
  form: FormControlPrenatal
  onChange: (f: FormControlPrenatal) => void
  onAgregarProtocoloLab?: () => void
  semanasAuto?: string
}

export default function ControlPrenatalPanel({
  form,
  onChange,
  onAgregarProtocoloLab,
  semanasAuto,
}: Props) {
  const set = <K extends keyof FormControlPrenatal>(key: K, value: FormControlPrenatal[K]) =>
    onChange({ ...form, [key]: value })

  return (
    <div className="rounded-xl border border-pink-200 bg-pink-50/40 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-pink-900">Control prenatal — esta visita</p>
          <p className="text-[11px] text-pink-700/80">Serie de controles del embarazo activo</p>
        </div>
        {onAgregarProtocoloLab && (
          <button
            type="button"
            onClick={onAgregarProtocoloLab}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-pink-600 text-white hover:bg-pink-700 transition"
          >
            + Protocolo labs embarazo
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Control #</label>
          <input type="number" min="1" value={form.num_control} onChange={e => set('num_control', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Semanas</label>
          <input
            value={form.semanas_gestacion || semanasAuto || ''}
            onChange={e => set('semanas_gestacion', e.target.value)}
            className={inputCls}
            placeholder={semanasAuto || 'Auto FUM'}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Peso materno (kg)</label>
          <input type="number" step="0.1" value={form.peso_materno} onChange={e => set('peso_materno', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">PA</label>
          <input value={form.presion_arterial} onChange={e => set('presion_arterial', e.target.value)} className={inputCls} placeholder="120/80" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">FCF</label>
          <input type="number" value={form.fcf} onChange={e => set('fcf', e.target.value)} className={inputCls} placeholder="lpm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Alt. uterina (cm)</label>
          <input type="number" step="0.1" value={form.altura_uterina} onChange={e => set('altura_uterina', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Proteinuria</label>
          <input value={form.proteinuria} onChange={e => set('proteinuria', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Edema</label>
          <input value={form.edema} onChange={e => set('edema', e.target.value)} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ultrasonido (USG)</label>
          <textarea rows={2} value={form.usg_resumen} onChange={e => set('usg_resumen', e.target.value)} className={textareaCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Laboratorios / notas</label>
          <textarea rows={2} value={form.labs_notas} onChange={e => set('labs_notas', e.target.value)} className={textareaCls} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Notas del control</label>
        <textarea rows={2} value={form.notas} onChange={e => set('notas', e.target.value)} className={textareaCls} />
      </div>
    </div>
  )
}
