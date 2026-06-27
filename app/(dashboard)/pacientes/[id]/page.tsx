import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import PacienteDetalleClient from './paciente-detalle-client'
import type { HistorialMembresia, HistorialPago } from '@/components/paciente-plan-historial'

export const metadata = { title: 'Ficha del Paciente' }

export default async function PacienteDetallePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const pacienteId = parseInt(id)
  if (isNaN(pacienteId)) notFound()

  const supabase = await createClient()
  const hoy = new Date().toISOString().split('T')[0]

  const [
    { data: paciente },
    { data: listas },
    { data: antecedentes },
    { data: antecedentesGo },
    { data: membresia },
    { data: historialMembresias },
    { data: colonias },
    { count: totalConsultas },
  ] = await Promise.all([
    supabase
      .from('pacientes')
      .select(`
        *,
        listas_precio(id, nombre),
        colonias(id, nombre)
      `)
      .eq('id', pacienteId)
      .single(),

    supabase.from('listas_precio').select('id, nombre').eq('activo', true),

    supabase
      .from('paciente_antecedentes')
      .select('*')
      .eq('paciente_id', pacienteId)
      .maybeSingle(),

    supabase
      .from('paciente_antecedentes_go')
      .select('*')
      .eq('paciente_id', pacienteId)
      .maybeSingle(),

    supabase
      .from('membresias')
      .select('id, tipo_id, fecha_inicio, fecha_fin, estado, numero_carnet, tipo:membresia_tipos(nombre)')
      .eq('paciente_id', pacienteId)
      .eq('estado', 'activo')
      .gte('fecha_fin', hoy)
      .maybeSingle(),

    supabase
      .from('membresias')
      .select(`
        id, tipo_id, fecha_inicio, fecha_fin, estado, numero_carnet, comentarios, created_at,
        tipo:membresia_tipos(nombre, precio, duracion_dias),
        beneficiarios:membresia_beneficiarios(nombre, parentesco, activo)
      `)
      .eq('paciente_id', pacienteId)
      .order('created_at', { ascending: false }),

    supabase
      .from('colonias')
      .select('id, nombre, activo')
      .order('nombre'),

    supabase
      .from('consultas')
      .select('id', { count: 'exact', head: true })
      .eq('paciente_id', pacienteId),
  ])

  if (!paciente) notFound()

  const memIds = (historialMembresias ?? []).map(m => m.id)
  let historialPagos: HistorialPago[] = []
  if (memIds.length > 0) {
    const { data: pagosData } = await supabase
      .from('membresia_pagos')
      .select('id, membresia_id, numero_cuota, fecha_vencimiento, monto, estado, fecha_pago')
      .in('membresia_id', memIds)
      .order('fecha_vencimiento')
    historialPagos = (pagosData ?? []) as HistorialPago[]
  }

  const tipoMembresia = membresia?.tipo
    ? (Array.isArray(membresia.tipo) ? membresia.tipo[0]?.nombre : (membresia.tipo as { nombre: string }).nombre)
    : null

  return (
    <PacienteDetalleClient
        paciente={paciente}
        listas={listas ?? []}
        antecedentes={antecedentes}
        antecedentesGo={antecedentesGo}
        membresia={membresia ? { ...membresia, tipo_nombre: tipoMembresia } : null}
        historialMembresias={(historialMembresias ?? []) as HistorialMembresia[]}
        historialPagos={historialPagos}
        colonias={colonias ?? []}
        totalConsultas={totalConsultas ?? 0}
    />
  )
}
