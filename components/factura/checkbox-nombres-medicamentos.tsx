'use client'

import { Pill } from 'lucide-react'

interface Props {
  checked: boolean
  onChange: (value: boolean) => void
  id: string
}

export default function CheckboxNombresMedicamentosFactura({ checked, onChange, id }: Props) {
  return (
    <div className="flex items-start gap-3 p-3 border border-green-200 bg-green-50/50 rounded-xl">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 accent-green-600 mt-0.5 shrink-0"
      />
      <label htmlFor={id} className="text-sm cursor-pointer flex-1 min-w-0">
        <span className="font-medium text-gray-800 flex items-center gap-1.5">
          <Pill className="w-3.5 h-3.5 text-green-600 shrink-0" />
          Imprimir nombres de medicamentos en la factura
        </span>
        <span className="text-xs text-gray-500 block mt-0.5 leading-relaxed">
          Por privacidad del paciente, en la factura solo aparece &quot;Medicamento&quot;.
          Active esta opción si el paciente solicita los nombres completos.
        </span>
      </label>
    </div>
  )
}
