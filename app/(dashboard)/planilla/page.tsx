import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import PlanillaClient from './planilla-client'

export const metadata = { title: 'Planilla — Clínica Jerusalén' }
export const dynamic = 'force-dynamic'

export default async function PlanillaPage() {
  const supabase = await createClient()
  const { sucursalId, esSuperAdmin } = await getPerfilSucursal()

  const hoy = new Date()
  const anio = hoy.getFullYear()
  const mes  = hoy.getMonth() + 1
  const quincena = hoy.getDate() <= 15 ? 1 : 2

  const sucQ = supabase.from('sucursales').select('id, nombre').order('nombre')
  const perfQ = supabase
    .from('perfiles')
    .select('id, nombre, apellido, sucursal_id, sueldo_fijo, tipo_nomina, rol_id, roles(nombre)')
    .neq('tipo_nomina', 'NINGUNO')
    .order('nombre')
  const comQ = supabase.from('planilla_comisiones').select('*').eq('activo', true).order('orden')
  const perQ = supabase
    .from('planilla_periodos')
    .select('*')
    .eq('anio', anio)
    .eq('mes', mes)
    .order('quincena')

  if (!esSuperAdmin && sucursalId) {
    perfQ.eq('sucursal_id', sucursalId)
    perQ.or(`sucursal_id.eq.${sucursalId},sucursal_id.is.null`)
  }

  const [{ data: sucursales }, { data: empleados }, { data: comisiones }, { data: periodos }] =
    await Promise.all([sucQ, perfQ, comQ, perQ])

  return (
    <PlanillaClient
      sucursales={sucursales ?? []}
      empleados={empleados ?? []}
      comisiones={comisiones ?? []}
      periodos={periodos ?? []}
      sucursalDefault={esSuperAdmin ? null : sucursalId}
      esSuperAdmin={esSuperAdmin}
      anioInicial={anio}
      mesInicial={mes}
      quincenaInicial={quincena as 1 | 2}
    />
  )
}
