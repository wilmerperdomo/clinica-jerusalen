import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal, getModulosPermitidos } from '@/lib/get-sucursal'
import { rangoMes } from '@/lib/control-financiero-utils'
import ControlFinancieroClient from './control-financiero-client'

export const metadata = { title: 'Control Financiero — Clínica Jerusalén' }
export const dynamic = 'force-dynamic'

export default async function ControlFinancieroPage() {
  const supabase = await createClient()
  if (!supabase) throw new Error('No se pudo inicializar Supabase')
  const perfil = await getPerfilSucursal()
  const modulos = await getModulosPermitidos(perfil.rolId, perfil.esSuperAdmin, perfil.esAdmin)

  if (!perfil.esSuperAdmin && !perfil.esAdmin && !modulos.includes('control-financiero')) {
    redirect('/')
  }

  const hoy = new Date()
  const anio = hoy.getFullYear()
  const mes = hoy.getMonth() + 1
  const { inicio, fin } = rangoMes(anio, mes)

  const [
    { data: sucursales },
    catRes,
    movRes,
    prestRes,
    tarjRes,
    deudRes,
    presRes,
    cuentRes,
    progRes,
    planillaRes,
  ] = await Promise.all([
    supabase.from('sucursales').select('id, nombre').order('nombre'),
    supabase.from('finanzas_categorias').select('*').eq('activo', true).order('orden'),
    supabase.from('finanzas_movimientos')
      .select('*, categoria:finanzas_categorias(id, tipo, clave, nombre, icono, orden, activo)')
      .gte('fecha', inicio).lte('fecha', fin)
      .order('fecha', { ascending: false }),
    supabase.from('finanzas_prestamos').select('*').order('activo', { ascending: false }).order('nombre'),
    supabase.from('finanzas_tarjetas').select('*').order('activo', { ascending: false }).order('alias'),
    supabase.from('finanzas_deudas').select('*').order('activo', { ascending: false }).order('nombre'),
    supabase.from('finanzas_presupuestos').select('*').eq('anio', anio).eq('mes', mes).eq('activo', true),
    supabase.from('finanzas_cuentas').select('*').eq('activo', true).order('nombre'),
    supabase.from('finanzas_pagos_programados').select('*').eq('activo', true).order('dia_mes'),
    supabase.from('planilla_liquidaciones')
      .select('total_pagar, estado, periodo:planilla_periodos(fecha_inicio, fecha_fin)')
      .in('estado', ['PAGADO', 'APROBADO', 'PENDIENTE']),
  ])

  const categorias = catRes.error ? [] : (catRes.data ?? [])
  const movimientosPersonal = movRes.error ? [] : (movRes.data ?? [])
  const prestamos = prestRes.error ? [] : (prestRes.data ?? [])
  const tarjetas = tarjRes.error ? [] : (tarjRes.data ?? [])
  const deudas = deudRes.error ? [] : (deudRes.data ?? [])
  const presupuestos = presRes.error ? [] : (presRes.data ?? [])
  const cuentas = cuentRes.error ? [] : (cuentRes.data ?? [])
  const programados = progRes.error ? [] : (progRes.data ?? [])

  let planillaMes = 0
  if (!planillaRes.error && planillaRes.data) {
    for (const l of planillaRes.data) {
      const per = l.periodo as { fecha_inicio?: string; fecha_fin?: string } | null
      if (per?.fecha_inicio && per.fecha_inicio >= inicio && per.fecha_fin && per.fecha_fin <= fin) {
        planillaMes += Number(l.total_pagar || 0)
      }
    }
  }

  return (
    <ControlFinancieroClient
      sucursales={sucursales ?? []}
      sucursalDefault={perfil.esSuperAdmin ? null : perfil.sucursalId}
      esSuperAdmin={perfil.esSuperAdmin}
      esAdmin={perfil.esAdmin}
      anioInicial={anio}
      mesInicial={mes}
      categoriasInicial={categorias}
      movimientosPersonalInicial={movimientosPersonal}
      prestamosInicial={prestamos}
      tarjetasInicial={tarjetas}
      deudasInicial={deudas}
      presupuestosInicial={presupuestos}
      cuentasInicial={cuentas}
      programadosInicial={programados}
      planillaReferenciaInicial={planillaMes}
    />
  )
}
