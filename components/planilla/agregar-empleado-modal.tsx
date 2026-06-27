'use client'

import { useState } from 'react'
import { Search, UserPlus, X } from 'lucide-react'

export type EmpleadoBusqueda = {
  id: string
  nombre: string
  apellido?: string
  tipo_nomina: string
  sueldo_fijo?: number
  roles?: { nombre: string }
}

interface Props {
  todosEmpleados: EmpleadoBusqueda[]
  enPlanilla: Set<string>
  onAgregar: (emp: EmpleadoBusqueda, tipo: string, sueldo: number) => Promise<void>
  onClose: () => void
}

const TIPOS = [
  { value: 'MEDICO', label: 'Médico (comisiones)' },
  { value: 'ENFERMERA', label: 'Enfermera (sueldo fijo)' },
  { value: 'ADMINISTRATIVO', label: 'Administrativo (sueldo fijo)' },
]

export default function AgregarEmpleadoPlanillaModal({
  todosEmpleados, enPlanilla, onAgregar, onClose,
}: Props) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<EmpleadoBusqueda | null>(null)
  const [tipo, setTipo] = useState('ENFERMERA')
  const [sueldo, setSueldo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const filtrados = todosEmpleados.filter(e => {
    if (enPlanilla.has(e.id)) return false
    const t = `${e.nombre} ${e.apellido ?? ''} ${e.roles?.nombre ?? ''}`.toLowerCase()
    return !q.trim() || t.includes(q.toLowerCase())
  }).slice(0, 20)

  async function confirmar() {
    if (!sel) return
    setGuardando(true)
    await onAgregar(sel, tipo, tipo === 'MEDICO' ? 0 : Number(sueldo || 0))
    setGuardando(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-violet-600" /> Agregar a planilla
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Buscar empleado por nombre o rol..."
              className="w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-violet-300 outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto border rounded-xl divide-y">
            {filtrados.length === 0 ? (
              <p className="p-4 text-sm text-gray-400 text-center">Sin resultados</p>
            ) : filtrados.map(e => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setSel(e)
                  setTipo(e.tipo_nomina === 'MEDICO' ? 'MEDICO' : 'ENFERMERA')
                  setSueldo(String(e.sueldo_fijo || ''))
                }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-violet-50 ${sel?.id === e.id ? 'bg-violet-100' : ''}`}
              >
                <span className="font-medium">{e.nombre} {e.apellido}</span>
                <span className="text-gray-400 ml-2">{e.roles?.nombre}</span>
              </button>
            ))}
          </div>
          {sel && (
            <div className="space-y-3 pt-2 border-t">
              <p className="text-sm font-semibold text-gray-800">Asignar a: {sel.nombre} {sel.apellido}</p>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Tipo nómina</label>
                <select value={tipo} onChange={e => setTipo(e.target.value)}
                  className="w-full mt-1 border rounded-lg px-3 py-2 text-sm">
                  {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {tipo !== 'MEDICO' && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase">Sueldo mensual (L.)</label>
                  <input type="number" min={0} step="0.01" value={sueldo}
                    onChange={e => setSueldo(e.target.value)}
                    className="w-full mt-1 border rounded-lg px-3 py-2 text-sm" />
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 border rounded-xl text-sm">Cancelar</button>
          <button
            onClick={() => void confirmar()}
            disabled={!sel || guardando}
            className="px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium"
          >
            {guardando ? 'Guardando...' : 'Agregar'}
          </button>
        </div>
      </div>
    </div>
  )
}
