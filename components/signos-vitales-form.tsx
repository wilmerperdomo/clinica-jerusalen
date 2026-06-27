'use client'

import type { EnfoqueClinico } from '@/lib/consulta-especialidad-utils'
import { etiquetaEnfoque } from '@/lib/consulta-especialidad-utils'
import {
  camposSignosPorEnfoque,
  etiquetaEnfoqueSignos,
  type FormSignosVitales,
} from '@/lib/signos-vitales-utils'

interface Props {
  form: FormSignosVitales
  onChange: (form: FormSignosVitales) => void
  enfoque: EnfoqueClinico
}

export default function SignosVitalesForm({ form, onChange, enfoque }: Props) {
  const campos = camposSignosPorEnfoque(enfoque)
  const tieneExtras = enfoque !== 'general'

  function setCampo(key: keyof FormSignosVitales, value: string) {
    onChange({ ...form, [key]: value })
  }

  return (
    <div className="space-y-4">
      {tieneExtras && (
        <div className={`rounded-lg border px-3 py-2 text-xs font-medium ${
          enfoque === 'pediatria'
            ? 'bg-sky-50 border-sky-200 text-sky-800'
            : 'bg-pink-50 border-pink-200 text-pink-800'
        }`}>
          Campos adicionales para enfoque {etiquetaEnfoque(enfoque)} — {etiquetaEnfoqueSignos(enfoque)}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {campos.map(c => (
          <div key={c.key} className={c.colSpan ? 'col-span-2' : ''}>
            <label className="block text-xs font-medium text-gray-600 mb-1">{c.label}</label>
            {c.type === 'select' && c.options ? (
              <select
                value={form[c.key]}
                onChange={e => setCampo(c.key, e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none bg-white"
              >
                {c.options.map(o => (
                  <option key={o.value || '_'} value={o.value}>{o.label}</option>
                ))}
              </select>
            ) : (
              <input
                type={c.type === 'date' ? 'date' : c.type === 'number' ? 'number' : 'text'}
                value={form[c.key]}
                onChange={e => setCampo(c.key, e.target.value)}
                placeholder={c.ph}
                min={c.key === 'dolor_eva' ? 0 : undefined}
                max={c.key === 'dolor_eva' ? 10 : undefined}
                step={c.type === 'number' && c.key !== 'dolor_eva' ? 'any' : undefined}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
