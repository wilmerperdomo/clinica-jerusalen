import type { ComponentProps } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import AgendaClient from './agenda-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Agenda de Citas' }

export default async function AgendaPage() {
  const supabase = await createClient()
  const { sucursalId, esSuperAdmin, sucursalNombre } = await getPerfilSucursal()

  const hoy = new Date().toISOString().split('T')[0]
  const manana = new Date(Date.now() + 86400000).toISOString().split('T')[0]

  // Semana actual: lunes → domingo
  const d    = new Date(hoy)
  const dia  = d.getDay() === 0 ? 6 : d.getDay() - 1
  const lunes = new Date(d); lunes.setDate(d.getDate() - dia)
  const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6)
  const semanaInicio = lunes.toISOString().split('T')[0]
  const semanaFin    = domingo.toISOString().split('T')[0]

  const citasQuery = supabase
    .from('citas')
    .select(`
      *,
      paciente:pacientes(id, codigo, nombre, apellido1, apellido2, celular, fecha_nac),
      servicio:servicios(id, nombre, tipo, precio)
    `)
    .gte('fecha', semanaInicio)
    .lte('fecha', semanaFin)
    .order('fecha')
    .order('hora')

  if (!esSuperAdmin && sucursalId) citasQuery.eq('sucursal_id', sucursalId)

  const recordatorioQuery = supabase
    .from('citas')
    .select(`
      *,
      paciente:pacientes(id, codigo, nombre, apellido1, apellido2, celular, fecha_nac),
      servicio:servicios(id, nombre, tipo, precio)
    `)
    .gte('fecha', hoy)
    .lte('fecha', manana)
    .eq('estado', 'ACTIVO')
    .order('fecha')
    .order('hora')
  if (!esSuperAdmin && sucursalId) recordatorioQuery.eq('sucursal_id', sucursalId)

  const [
    { data: citas },
    { data: citasRecordatorio },
    { data: pacientes },
    { data: sucursales },
    { data: servicios },
  ] = await Promise.all([
    citasQuery,
    recordatorioQuery,

    supabase
      .from('pacientes')
      .select('id, codigo, nombre, apellido1, apellido2, celular, fecha_nac')
      .eq('activo', true)
      .order('nombre')
      .limit(500),

    supabase
      .from('sucursales')
      .select('id, nombre')
      .order('nombre'),

    supabase
      .from('servicios')
      .select('id, nombre, tipo, precio')
      .eq('activo', true)
      .order('tipo')
      .order('nombre'),
  ])

  type CitaAgenda = { id: number; fecha: string; hora?: string | null; [key: string]: unknown }
  const citasMap = new Map<number, CitaAgenda>()
  for (const c of (citas ?? []) as CitaAgenda[]) citasMap.set(c.id, c)
  for (const c of (citasRecordatorio ?? []) as CitaAgenda[]) citasMap.set(c.id, c)
  const citasMerged = [...citasMap.values()].sort((a, b) =>
    a.fecha.localeCompare(b.fecha) || String(a.hora).localeCompare(String(b.hora))
  )

  return (
    <AgendaClient
      citas={citasMerged as unknown as ComponentProps<typeof AgendaClient>['citas']}
      pacientes={pacientes || []}
      sucursales={sucursales || []}
      servicios={servicios || []}
      sucursalUsuario={sucursalId}
      esSuperAdmin={esSuperAdmin}
      sucursalNombre={sucursalNombre ?? undefined}
      fechaHoy={hoy}
      semanaInicio={semanaInicio}
    />
  )
}
