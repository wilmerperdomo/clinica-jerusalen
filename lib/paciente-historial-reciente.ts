/** Historial reciente de un paciente — para pantalla post-registro */

import type { SupabaseClient } from '@supabase/supabase-js'

export type ConsultaReciente = {
  id: number
  fecha: string
  hora?: string | null
  estado: string
  tipo?: { nombre: string } | { nombre: string }[] | null
}

export type CompraReciente = {
  id: number
  fecha: string
  concepto?: string | null
  monto: number
  forma_pago?: string | null
}

export type CxcReciente = {
  id: number
  concepto?: string | null
  saldo: number
  estado: string
  fecha: string
}

export type MembresiaActiva = {
  id: number
  fecha_fin: string
  estado: string
  numero_carnet?: string | null
  tipo?: { nombre: string } | { nombre: string }[] | null
}

export type HistorialPacienteReciente = {
  consultas: ConsultaReciente[]
  compras: CompraReciente[]
  deudas: CxcReciente[]
  membresia: MembresiaActiva | null
}

function nombreTipo(tipo: ConsultaReciente['tipo'] | MembresiaActiva['tipo']): string | null {
  if (!tipo) return null
  if (Array.isArray(tipo)) return tipo[0]?.nombre ?? null
  return tipo.nombre ?? null
}

export function etiquetaConsulta(c: ConsultaReciente): string {
  const tipo = nombreTipo(c.tipo)
  return tipo ? `${tipo} · ${c.fecha}` : c.fecha
}

export function etiquetaMembresia(m: MembresiaActiva): string {
  const tipo = nombreTipo(m.tipo) ?? 'Plan médico'
  return `${tipo} · vence ${m.fecha_fin}`
}

export async function cargarHistorialPaciente(
  supabase: SupabaseClient,
  pacienteId: number,
): Promise<HistorialPacienteReciente> {
  const hoy = new Date().toISOString().split('T')[0]

  const [consultasRes, comprasRes, cxcRes, membRes] = await Promise.all([
    supabase
      .from('consultas')
      .select('id, fecha, hora, estado, tipo:consulta_tipo(nombre)')
      .eq('paciente_id', pacienteId)
      .order('fecha', { ascending: false })
      .limit(5),
    supabase
      .from('caja_movimientos')
      .select('id, fecha, concepto, monto, forma_pago')
      .eq('paciente_id', pacienteId)
      .eq('tipo', 'INGRESO')
      .order('fecha', { ascending: false })
      .limit(5),
    supabase
      .from('cxc')
      .select('id, concepto, saldo, estado, fecha')
      .eq('paciente_id', pacienteId)
      .in('estado', ['PENDIENTE', 'PARCIAL'])
      .order('fecha', { ascending: false })
      .limit(5),
    supabase
      .from('membresias')
      .select('id, fecha_fin, estado, numero_carnet, tipo:membresia_tipos(nombre)')
      .eq('paciente_id', pacienteId)
      .eq('estado', 'activo')
      .gte('fecha_fin', hoy)
      .maybeSingle(),
  ])

  return {
    consultas: (consultasRes.data ?? []) as ConsultaReciente[],
    compras: (comprasRes.data ?? []) as CompraReciente[],
    deudas: (cxcRes.data ?? []) as CxcReciente[],
    membresia: (membRes.data ?? null) as MembresiaActiva | null,
  }
}
