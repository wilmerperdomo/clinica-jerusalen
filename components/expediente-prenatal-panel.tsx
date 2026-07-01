'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Heart, Printer, AlertTriangle } from 'lucide-react'
import { alertasPrenatales, claseSeveridadAlerta } from '@/lib/alertas-clinicas'
import { imprimirHojaControlPrenatal } from '@/lib/prenatal-print'
import { imprimirCarnetMaterno } from '@/lib/carnet-materno-print'

interface Props {
  pacienteId: number
  codigo: string
  nombre: string
  apellido1: string
  apellido2?: string
  fechaNac?: string | null
}

interface ControlRow {
  fecha: string
  num_control?: number | null
  semanas_gestacion?: number | null
  peso_materno?: number | null
  presion_arterial?: string | null
  fcf?: number | null
  altura_uterina?: number | null
  proteinuria?: string | null
  edema?: string | null
  usg_resumen?: string | null
  labs_notas?: string | null
  notas?: string | null
}


export default function ExpedientePrenatalPanel({
  pacienteId, codigo, nombre, apellido1, apellido2, fechaNac,
}: Props) {
  const [embarazo, setEmbarazo] = useState<{ id?: number; fum?: string; fpp?: string; activo?: boolean } | null>(null)
  const [controles, setControles] = useState<ControlRow[]>([])
  const [gineco, setGineco] = useState<{
    gestas?: number | null; partos?: number | null; cesareas?: number | null; abortos?: number | null
    menarquia?: string | null; ciclos_menstruales?: string | null; planificacion?: string | null
    riesgo_prenatal?: string | null; plan_parto_notas?: string | null
  } | null>(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    const sb = createClient()
    async function load() {
      setCargando(true)
      const embRes = await sb.from('embarazo').select('id,fum,fpp,activo').eq('paciente_id', pacienteId).eq('activo', true).maybeSingle()
      if (!embRes.error && embRes.data) {
        setEmbarazo(embRes.data)
        const [ctrlRes, gineRes] = await Promise.all([
          sb.from('control_prenatal')
            .select('*, consulta:consultas(fecha)')
            .eq('embarazo_id', embRes.data.id)
            .order('num_control'),
          sb.from('consulta_ginecologia')
            .select('gestas,partos,cesareas,abortos,menarquia,ciclos_menstruales,planificacion,riesgo_prenatal,plan_parto_notas, consulta:consultas!inner(paciente_id)')
            .eq('consulta.paciente_id', pacienteId)
            .order('consulta_id', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])
        if (!ctrlRes.error) {
          setControles((ctrlRes.data ?? []).map((r: Record<string, unknown>) => {
            const consulta = r.consulta as { fecha?: string } | null
            return {
              fecha: consulta?.fecha ?? '',
              num_control: r.num_control as number | null,
              semanas_gestacion: r.semanas_gestacion as number | null,
              peso_materno: r.peso_materno as number | null,
              presion_arterial: r.presion_arterial as string | null,
              fcf: r.fcf as number | null,
              altura_uterina: r.altura_uterina as number | null,
              proteinuria: r.proteinuria as string | null,
              edema: r.edema as string | null,
              usg_resumen: r.usg_resumen as string | null,
              labs_notas: r.labs_notas as string | null,
              notas: r.notas as string | null,
            }
          }))
        }
        if (!gineRes.error && gineRes.data) {
          const g = gineRes.data as Record<string, unknown>
          setGineco({
            gestas: g.gestas as number | null,
            partos: g.partos as number | null,
            cesareas: g.cesareas as number | null,
            abortos: g.abortos as number | null,
            menarquia: g.menarquia as string | null,
            ciclos_menstruales: g.ciclos_menstruales as string | null,
            planificacion: g.planificacion as string | null,
            riesgo_prenatal: g.riesgo_prenatal as string | null,
            plan_parto_notas: g.plan_parto_notas as string | null,
          })
        } else {
          setGineco(null)
        }
      } else {
        setEmbarazo(null)
        setControles([])
        setGineco(null)
      }
      setCargando(false)
    }
    load()
  }, [pacienteId])

  const ultimo = controles[controles.length - 1]
  const alertas = alertasPrenatales({
    embarazoActivo: embarazo?.activo === true,
    fpp: embarazo?.fpp,
    ultimoControl: ultimo ? { fecha: ultimo.fecha, semanas_gestacion: ultimo.semanas_gestacion } : null,
    semanasActuales: ultimo?.semanas_gestacion ?? null,
  })

  if (cargando) return <p className="text-sm text-slate-500 p-4">Cargando control prenatal...</p>

  if (!embarazo?.activo) {
    return (
      <p className="text-sm text-slate-400 italic p-6 text-center">
        No hay embarazo activo registrado. Marque &quot;Embarazo activo&quot; en una consulta con enfoque ginecológico.
      </p>
    )
  }

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {alertas.map(a => (
        <div key={a.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${claseSeveridadAlerta(a.severidad)}`}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div><p className="font-semibold">{a.titulo}</p><p className="text-xs opacity-90">{a.mensaje}</p></div>
        </div>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center">
            <Heart className="w-5 h-5 text-pink-600" />
          </div>
          <div>
            <p className="font-semibold text-pink-900">Embarazo activo</p>
            <p className="text-xs text-pink-700">FUM: {embarazo.fum ?? '—'} · FPP: {embarazo.fpp ?? '—'}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button"
            onClick={() => imprimirCarnetMaterno(
              { codigo, nombre, apellido1, apellido2, fecha_nac: fechaNac ?? undefined },
              {
                fum: embarazo.fum, fpp: embarazo.fpp,
                gestas: gineco?.gestas, partos: gineco?.partos,
                cesareas: gineco?.cesareas, abortos: gineco?.abortos,
              },
              {
                menarquia: gineco?.menarquia,
                ciclo_menstrual: gineco?.ciclos_menstruales,
                metodo_planificacion: gineco?.planificacion,
                riesgo_obstetrico: gineco?.riesgo_prenatal,
                plan_parto: gineco?.plan_parto_notas,
              },
              controles,
            )}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700">
            <Printer className="w-3.5 h-3.5" /> Carnet materno
          </button>
          <button type="button"
            onClick={() => imprimirHojaControlPrenatal(
              { codigo, nombre, apellido1, apellido2, fecha_nac: fechaNac ?? undefined },
              embarazo.fum, embarazo.fpp, controles,
            )}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-pink-600 text-white hover:bg-pink-700">
            <Printer className="w-3.5 h-3.5" /> Hoja control prenatal
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-xs">
          <thead className="bg-pink-50 text-pink-900">
            <tr>
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Sem</th>
              <th className="px-2 py-2">Peso</th>
              <th className="px-2 py-2">PA</th>
              <th className="px-2 py-2">FCF</th>
              <th className="px-2 py-2">AU</th>
              <th className="px-3 py-2 text-left">USG</th>
            </tr>
          </thead>
          <tbody>
            {controles.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">Sin controles registrados aún</td></tr>
            ) : controles.map((c, i) => (
              <tr key={i} className="border-t hover:bg-pink-50/30">
                <td className="px-3 py-2">{c.fecha}</td>
                <td className="text-center">{c.num_control ?? '—'}</td>
                <td className="text-center">{c.semanas_gestacion ?? '—'}</td>
                <td className="text-center">{c.peso_materno ?? '—'}</td>
                <td className="text-center">{c.presion_arterial ?? '—'}</td>
                <td className="text-center">{c.fcf ?? '—'}</td>
                <td className="text-center">{c.altura_uterina ?? '—'}</td>
                <td className="px-3 py-2 max-w-[200px] truncate">{c.usg_resumen ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
