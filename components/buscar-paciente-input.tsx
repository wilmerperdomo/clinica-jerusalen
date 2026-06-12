'use client'

import { useMemo, useState, useEffect, useRef } from 'react'

import { Search, User, Building2, X } from 'lucide-react'

import {

  esPacienteEmpresa, nombrePaciente, detallePaciente, textoBusquedaPaciente,

  type PacienteConsulta,

} from '@/lib/consultas-utils'

import { PacientePlanBadge } from '@/components/paciente-plan-badge'

import type { MembresiasMap } from '@/lib/membresia-utils'



export type PacienteBusqueda = PacienteConsulta & { id: number; codigo: string }



interface Props {

  pacientes: PacienteBusqueda[]

  value: string

  onChange: (id: string) => void

  placeholder?: string

  required?: boolean

  membresiasMap?: MembresiasMap

  listasMap?: Record<number, string>

  /** Si se define, busca en todos los pacientes registrados vía servidor (recomendado en laboratorio) */
  buscarRemoto?: (termino: string) => Promise<PacienteBusqueda[]>

  onSelectPaciente?: (p: PacienteBusqueda) => void

}



export default function BuscarPacienteInput({

  pacientes, value, onChange,

  placeholder = 'Buscar por nombre, empresa, RTN o código...',

  required,

  membresiasMap,

  listasMap,

  buscarRemoto,

  onSelectPaciente,

}: Props) {

  const [q, setQ] = useState('')

  const [abierto, setAbierto] = useState(false)

  const [remotos, setRemotos] = useState<PacienteBusqueda[]>([])

  const [buscando, setBuscando] = useState(false)

  const [cacheSel, setCacheSel] = useState<PacienteBusqueda | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buscarRemotoRef = useRef(buscarRemoto)
  buscarRemotoRef.current = buscarRemoto



  const seleccionado = useMemo(

    () => cacheSel ?? pacientes.find(p => String(p.id) === value) ?? remotos.find(p => String(p.id) === value),

    [pacientes, value, cacheSel, remotos],

  )

  useEffect(() => {

    if (!buscarRemoto) return

    const term = q.trim()

    if (term.length < 2) {

      setRemotos([])

      setBuscando(false)

      return

    }

    setBuscando(true)

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {

      const fn = buscarRemotoRef.current

      if (!fn) { setBuscando(false); return }

      fn(term).then(rows => {

        setRemotos(rows)

        setBuscando(false)

      }).catch(() => {

        setRemotos([])

        setBuscando(false)

      })

    }, 280)

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }

  }, [q, buscarRemoto])

  useEffect(() => {

    if (!value) { setCacheSel(null); return }

    const p = pacientes.find(x => String(x.id) === value)

    if (p) setCacheSel(p)

  }, [value, pacientes])



  const resultados = useMemo(() => {

    if (buscarRemoto) return remotos.slice(0, 25)

    const term = q.trim().toLowerCase()

    if (!term) return pacientes.slice(0, 15)

    return pacientes.filter(p => textoBusquedaPaciente(p).includes(term)).slice(0, 25)

  }, [q, pacientes, buscarRemoto, remotos])



  function elegir(p: PacienteBusqueda) {
    setCacheSel(p)
    setQ('')
    setAbierto(false)
    if (onSelectPaciente) {
      onSelectPaciente(p)
    } else {
      onChange(String(p.id))
    }
  }



  function limpiar() {

    onChange('')

    setQ('')

    setAbierto(true)

  }



  return (

    <div className="relative">

      {seleccionado && !abierto ? (

        <div className="flex items-center gap-2 border rounded-xl px-3 py-2.5 bg-slate-50">

          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${

            esPacienteEmpresa(seleccionado) ? 'bg-violet-100' : 'bg-[#003366]/10'

          }`}>

            {esPacienteEmpresa(seleccionado)

              ? <Building2 className="w-4 h-4 text-violet-700" />

              : <User className="w-4 h-4 text-[#003366]" />}

          </div>

          <div className="flex-1 min-w-0">

            <p className="text-sm font-semibold text-gray-900 truncate">

              {nombrePaciente(seleccionado)}

              {esPacienteEmpresa(seleccionado) && (

                <span className="ml-1.5 text-[10px] font-bold uppercase text-violet-600">Empresa</span>

              )}

            </p>

            <p className="text-xs text-gray-500 truncate">{detallePaciente(seleccionado)}</p>

            <PacientePlanBadge
              pacienteId={seleccionado.id}
              listaId={seleccionado.lista_id}
              listaNombre={seleccionado.lista_id ? listasMap?.[seleccionado.lista_id] : undefined}
              membresiasMap={membresiasMap}
            />

          </div>

          <button type="button" onClick={limpiar} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400" aria-label="Cambiar paciente">

            <X className="w-4 h-4" />

          </button>

        </div>

      ) : (

        <>

          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />

          <input

            type="search"

            value={q}

            onChange={e => { setQ(e.target.value); setAbierto(true) }}

            onFocus={() => setAbierto(true)}

            placeholder={placeholder}

            required={required && !value}

            className="w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#003366]/30"

            autoComplete="off"

          />

          {buscarRemoto && abierto && q.trim().length < 2 && (

            <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg px-3 py-3 text-sm text-gray-500 text-center">

              Escriba al menos 2 caracteres (nombre, código, RTN, teléfono…)

            </div>

          )}

          {buscarRemoto && abierto && buscando && q.trim().length >= 2 && (

            <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg px-3 py-3 text-sm text-gray-500 text-center">

              Buscando pacientes…

            </div>

          )}

          {abierto && resultados.length > 0 && (

            <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-xl max-h-52 overflow-y-auto">

              {resultados.map(p => (

                <button

                  key={p.id}

                  type="button"

                  onClick={() => elegir(p)}

                  className="w-full text-left px-3 py-2.5 hover:bg-sky-50 border-b border-gray-50 last:border-0 flex items-center gap-2"

                >

                  {esPacienteEmpresa(p)

                    ? <Building2 className="w-4 h-4 text-violet-600 flex-shrink-0" />

                    : <User className="w-4 h-4 text-[#003366]/60 flex-shrink-0" />}

                  <div className="min-w-0">

                    <p className="text-sm font-medium truncate">

                      {nombrePaciente(p)}

                      {esPacienteEmpresa(p) && (

                        <span className="ml-1 text-[10px] text-violet-600 font-bold">EMPRESA</span>

                      )}

                    </p>

                    <p className="text-xs text-gray-400 truncate">

                      {detallePaciente(p)}{p.celular ? ` · ${p.celular}` : ''}

                    </p>

                    <PacientePlanBadge
                      pacienteId={p.id}
                      listaId={p.lista_id}
                      listaNombre={p.lista_id ? listasMap?.[p.lista_id] : undefined}
                      membresiasMap={membresiasMap}
                    />

                  </div>

                </button>

              ))}

            </div>

          )}

          {abierto && q.trim().length >= (buscarRemoto ? 2 : 1) && !buscando && resultados.length === 0 && (

            <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg px-3 py-4 text-sm text-gray-500 text-center">

              Sin pacientes registrados con ese criterio

            </div>

          )}

        </>

      )}

    </div>

  )

}


