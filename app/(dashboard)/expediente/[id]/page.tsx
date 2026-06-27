import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ExpedienteClient from './expediente-client'
import type { TimelineEvento } from '@/components/expediente-timeline'

export const metadata = { title: 'Expediente Clínico' }

export default async function ExpedientePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const pacienteId = parseInt(id)
  if (isNaN(pacienteId)) notFound()

  const supabase = await createClient()

  const [
    { data: paciente },
    { data: consultas },
    { data: analisisOrds },
    { data: antecedentes },
    { data: problemas },
    { data: membresiasPac },
  ] = await Promise.all([
    // datos completos del paciente
    supabase
      .from('pacientes')
      .select('*, colonias(id, nombre)')
      .eq('id', pacienteId)
      .single(),

    // todas las consultas del paciente (completas)
    supabase
      .from('consultas')
      .select(`
        id, fecha, hora, estado, tipo_nombre, doctor, enfoque_clinico,
        presion, temperatura, peso, talla, frecuencia, perim_cefalico, pulso,
        saturacion_oxigeno, dolor_eva, glucosa_capilar,
        cabeza, cuello, ojos, orl, pulmonar, abdomen,
        genito, extremidades, sistema, oste, piel,
        sintoma, historia, impresion, tratamiento,
        estudios_complementarios, dias_reposo, nota,
        consulta_detalle(
          id, no_producto, indicacion, cant, via
        ),
        consulta_diagnosticos(
          cie10_codigo, descripcion, principal
        )
      `)
      .eq('paciente_id', pacienteId)
      .in('estado', ['FINALIZADO', 'ATENDIENDO', 'SIGNOS'])
      .order('fecha', { ascending: false })
      .order('hora', { ascending: false })
      .limit(100),

    // órdenes de laboratorio del paciente
    supabase
      .from('consulta_analisis')
      .select(`
        id, id_consulta, no_analisis, fecha, fecha_resultado,
        estado_lab, pagado, entregado, resultado_resumen,
        resultados:lab_resultados(valor_resultado, unidad, rango_texto, observacion, anormal, fecha)
      `)
      .or(`id_cliente.eq.${pacienteId},paciente_id.eq.${pacienteId}`)
      .order('fecha', { ascending: false })
      .limit(100),

    supabase
      .from('paciente_antecedentes')
      .select('alergias, personal, familiares, hospitalario')
      .eq('paciente_id', pacienteId)
      .maybeSingle(),

    supabase
      .from('paciente_problema_activo')
      .select('descripcion, cie10_codigo, estado')
      .eq('paciente_id', pacienteId)
      .neq('estado', 'resuelto')
      .order('created_at', { ascending: false }),

    supabase
      .from('membresias')
      .select('id, fecha_inicio, fecha_fin, estado, numero_carnet, tipo:membresia_tipos(nombre)')
      .eq('paciente_id', pacienteId)
      .order('fecha_inicio', { ascending: false }),
  ])

  if (!paciente) notFound()

  const memIds = (membresiasPac ?? []).map(m => m.id)
  let pagosPlan: { id: number; numero_cuota: number; fecha_vencimiento: string; monto: number; estado: string; fecha_pago?: string | null }[] = []
  if (memIds.length) {
    const { data } = await supabase
      .from('membresia_pagos')
      .select('id, numero_cuota, fecha_vencimiento, monto, estado, fecha_pago')
      .in('membresia_id', memIds)
      .order('fecha_vencimiento', { ascending: false })
      .limit(50)
    pagosPlan = data ?? []
  }

  const coloniaJoin = paciente.colonias
  const coloniaNombre = Array.isArray(coloniaJoin)
    ? coloniaJoin[0]?.nombre
    : (coloniaJoin as { nombre: string } | null)?.nombre

  const pacienteConAntecedentes = {
    ...paciente,
    alergias: antecedentes?.alergias ?? null,
    tipo_sangre: paciente.grupo_sanguineo ?? null,
    colonia_nombre: coloniaNombre ?? null,
  }

  const timeline: TimelineEvento[] = []

  for (const c of consultas ?? []) {
    timeline.push({
      id: `c-${c.id}`,
      fecha: c.fecha,
      hora: c.hora,
      tipo: 'consulta',
      titulo: c.tipo_nombre || 'Consulta',
      detalle: [c.doctor, c.impresion].filter(Boolean).join(' · ').slice(0, 120),
      href: '/consultas',
    })
  }
  for (const a of analisisOrds ?? []) {
    timeline.push({
      id: `l-${a.id}`,
      fecha: a.fecha,
      tipo: 'lab',
      titulo: `Lab ${a.no_analisis || a.id}`,
      detalle: a.estado_lab || undefined,
      href: '/laboratorio',
    })
  }
  for (const m of membresiasPac ?? []) {
    const tipo = Array.isArray(m.tipo) ? m.tipo[0] : m.tipo
    timeline.push({
      id: `m-${m.id}`,
      fecha: m.fecha_inicio,
      tipo: 'plan',
      titulo: `Plan: ${(tipo as { nombre?: string })?.nombre || 'Médico'}`,
      detalle: `${m.fecha_inicio} → ${m.fecha_fin} · ${m.estado}`,
      href: '/membresias',
    })
  }
  for (const p of pagosPlan ?? []) {
    timeline.push({
      id: `p-${p.id}`,
      fecha: p.fecha_pago || p.fecha_vencimiento,
      tipo: 'pago',
      titulo: `Cuota #${p.numero_cuota} — ${p.estado}`,
      detalle: `L. ${Number(p.monto).toFixed(2)}`,
      href: p.estado !== 'pagado' ? `/ventas?membresia_pago=${p.id}` : '/membresias',
    })
  }

  return (
    <ExpedienteClient
      paciente={pacienteConAntecedentes}
      antecedentes={antecedentes}
      consultas={consultas || []}
      analisis={analisisOrds || []}
      problemasActivos={problemas || []}
      timeline={timeline}
    />
  )
}
