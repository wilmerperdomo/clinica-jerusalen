'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Baby, Printer, AlertTriangle, Plus, Syringe } from 'lucide-react'
import {
  alertasPediatricas, claseSeveridadAlerta,
} from '@/lib/alertas-clinicas'
import {
  vacunasPendientes, etiquetaVacuna, edadEnMeses,
  type VacunaCatalogo, type PacienteVacuna,
} from '@/lib/vacunas-utils'
import { puntosDesdeConsultas, generoOMS, percentilPesoAprox } from '@/lib/crecimiento-oms'
import { imprimirCarnetVacunas } from '@/lib/vacunas-print'
import { imprimirCurvaCrecimiento } from '@/lib/crecimiento-print'

interface Props {
  pacienteId: number
  fechaNac?: string | null
  genero?: string | null
  codigo: string
  nombre: string
  apellido1: string
  apellido2?: string
}

function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export default function ExpedientePediatriaPanel({
  pacienteId, fechaNac, genero, codigo, nombre, apellido1, apellido2,
}: Props) {
  const [catalogo, setCatalogo] = useState<VacunaCatalogo[]>([])
  const [vacunas, setVacunas] = useState<PacienteVacuna[]>([])
  const [consultas, setConsultas] = useState<{ id: number; fecha: string; peso?: string; talla?: string; perim_cefalico?: string }[]>([])
  const [cargando, setCargando] = useState(true)
  const [vacunaSel, setVacunaSel] = useState('')
  const [fechaVac, setFechaVac] = useState(new Date().toISOString().slice(0, 10))
  const [lote, setLote] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function recargar() {
    setCargando(true)
    const sb = supabase()
    const [catRes, vacRes, conRes] = await Promise.all([
      sb.from('vacuna_catalogo').select('*').eq('activo', true).order('orden'),
      sb.from('paciente_vacuna').select('*, vacuna:vacuna_catalogo(*)').eq('paciente_id', pacienteId).order('fecha_aplicada', { ascending: false }),
      sb.from('consultas').select('id,fecha,peso,talla,perim_cefalico').eq('paciente_id', pacienteId).in('estado', ['FINALIZADO', 'PAGADO']).order('fecha'),
    ])
    if (!catRes.error) setCatalogo((catRes.data ?? []) as VacunaCatalogo[])
    if (!vacRes.error) setVacunas((vacRes.data ?? []) as PacienteVacuna[])
    if (!conRes.error) setConsultas(conRes.data ?? [])
    setCargando(false)
  }

  useEffect(() => { recargar() }, [pacienteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const edad = edadEnMeses(fechaNac)
  const alertas = alertasPediatricas({ pacienteId, fechaNac, consultas, catalogoVacunas: catalogo, vacunasAplicadas: vacunas })
  const pendientes = vacunasPendientes(catalogo, vacunas, edad)
  const puntos = fechaNac ? puntosDesdeConsultas(consultas, fechaNac) : []
  const g = generoOMS(genero)

  async function registrarVacuna() {
    if (!vacunaSel) return
    setGuardando(true)
    const sb = supabase()
    const { error } = await sb.from('paciente_vacuna').insert({
      paciente_id: pacienteId,
      vacuna_id: Number(vacunaSel),
      fecha_aplicada: fechaVac,
      lote: lote.trim() || null,
    })
    setGuardando(false)
    if (error) { alert(error.message); return }
    setVacunaSel('')
    setLote('')
    recargar()
  }

  if (cargando) {
    return <p className="text-sm text-slate-500 p-4">Cargando datos pediátricos...</p>
  }

  if (edad != null && edad > 216) {
    return <p className="text-sm text-slate-400 italic p-4">Panel pediátrico orientado a menores de 18 años.</p>
  }

  return (
    <div className="p-4 sm:p-5 space-y-5">
      {alertas.length > 0 && (
        <div className="space-y-2">
          {alertas.map(a => (
            <div key={a.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${claseSeveridadAlerta(a.severidad)}`}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <div><p className="font-semibold">{a.titulo}</p><p className="text-xs opacity-90">{a.mensaje}</p></div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => imprimirCarnetVacunas({ codigo, nombre, apellido1, apellido2, fecha_nac: fechaNac ?? undefined }, catalogo, vacunas)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700">
          <Printer className="w-3.5 h-3.5" /> Carnet de vacunas
        </button>
        <button type="button" onClick={() => imprimirCurvaCrecimiento({ codigo, nombre, apellido1, apellido2, fecha_nac: fechaNac ?? undefined, genero }, consultas)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700">
          <Printer className="w-3.5 h-3.5" /> Curva de crecimiento
        </button>
      </div>

      {/* Curva mini preview */}
      {puntos.length > 0 && (
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2"><Baby className="w-4 h-4" /> Crecimiento (últimas mediciones)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="text-slate-500"><th className="text-left py-1">Fecha</th><th>Edad (m)</th><th>Peso</th><th>Percentil</th></tr></thead>
              <tbody>
                {puntos.slice(-6).map(p => (
                  <tr key={p.consultaId} className="border-t">
                    <td className="py-1">{p.fecha}</td>
                    <td className="text-center">{p.edadMeses}</td>
                    <td className="text-center font-medium">{p.peso} kg</td>
                    <td className="text-center">{percentilPesoAprox(p.peso, p.edadMeses, g) != null ? `P${percentilPesoAprox(p.peso, p.edadMeses, g)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400 mt-2">Referencia OMS P3–P97 (simplificado 0–24 meses)</p>
        </div>
      )}

      {/* Vacunas */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/30 p-4">
        <p className="text-sm font-bold text-sky-900 flex items-center gap-2 mb-3"><Syringe className="w-4 h-4" /> Vacunación</p>
        <div className="grid sm:grid-cols-4 gap-2 mb-3">
          <select value={vacunaSel} onChange={e => setVacunaSel(e.target.value)} className="border rounded-lg px-2 py-2 text-sm sm:col-span-2">
            <option value="">— Vacuna —</option>
            {pendientes.map(v => <option key={v.id} value={v.id}>{etiquetaVacuna(v)}</option>)}
          </select>
          <input type="date" value={fechaVac} onChange={e => setFechaVac(e.target.value)} className="border rounded-lg px-2 py-2 text-sm" />
          <input value={lote} onChange={e => setLote(e.target.value)} placeholder="Lote" className="border rounded-lg px-2 py-2 text-sm" />
        </div>
        <button type="button" onClick={registrarVacuna} disabled={guardando || !vacunaSel}
          className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-sky-600 text-white disabled:opacity-50">
          <Plus className="w-3.5 h-3.5" /> Registrar vacuna
        </button>

        {vacunas.length > 0 && (
          <div className="mt-4 space-y-1 max-h-48 overflow-y-auto">
            {vacunas.map(v => (
              <div key={v.id} className="flex justify-between text-xs bg-white rounded-lg px-3 py-2 border">
                <span>{v.vacuna ? etiquetaVacuna(v.vacuna as VacunaCatalogo) : `Vacuna #${v.vacuna_id}`}</span>
                <span className="text-slate-500">{v.fecha_aplicada}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
