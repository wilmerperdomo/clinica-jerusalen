import type { SupabaseClient } from '@supabase/supabase-js'
import {
  clasificarServicio,
  porcentajeComision,
  calcularComision,
  type CategoriaComision,
  type ReglaComision,
} from '@/lib/planilla-utils'

export interface LineaComisionCaja {
  doctor_id: string
  doctor_nombre: string
  categoria_comision: CategoriaComision
  descripcion: string
  monto_neto: number
  comision_monto: number
  porcentaje_comision: number
  fecha: string
  movimiento_id: number
}

export async function importarComisionesDesdeCaja(
  supabase: SupabaseClient,
  opts: {
    sucursalId?: number | null
    desde: string
    hasta: string
    esSuperAdmin?: boolean
  },
): Promise<LineaComisionCaja[]> {
  const { desde, hasta, sucursalId, esSuperAdmin } = opts

  let q = supabase
    .from('caja_movimientos')
    .select('id, fecha, concepto, monto, monto_bruto, tipo, sucursal_id, consulta_id')
    .eq('tipo', 'INGRESO')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha')

  if (!esSuperAdmin && sucursalId) q = q.eq('sucursal_id', sucursalId)

  const { data: movs } = await q
  if (!movs?.length) return []

  const consultaIds = [...new Set(movs.map(m => m.consulta_id).filter((id): id is number => id != null))]
  const consultaMedico = new Map<number, { medico_id?: string; medico_nombre?: string }>()
  if (consultaIds.length) {
    const { data: cons } = await supabase
      .from('consultas')
      .select('id, medico_id, medico_nombre')
      .in('id', consultaIds)
    for (const c of cons ?? []) {
      consultaMedico.set(c.id, { medico_id: c.medico_id, medico_nombre: c.medico_nombre })
    }
  }

  const { data: reglasDb } = await supabase
    .from('planilla_comisiones')
    .select('clave, nombre, porcentaje')
    .eq('activo', true)

  const reglas: ReglaComision[] = (reglasDb ?? []).map(r => ({
    clave: r.clave as CategoriaComision,
    nombre: r.nombre,
    porcentaje: Number(r.porcentaje),
  }))

  const lineas: LineaComisionCaja[] = []

  for (const m of movs) {
    const neto = Number(m.monto ?? 0)
    if (neto <= 0) continue
    const cons = m.consulta_id ? consultaMedico.get(m.consulta_id) : null
    const doctorId = cons?.medico_id
    if (!doctorId) continue

    const cat = clasificarServicio(m.concepto || '')
    const pct = porcentajeComision(cat, reglas.length ? reglas : undefined)
    lineas.push({
      doctor_id: doctorId,
      doctor_nombre: cons?.medico_nombre || 'Médico',
      categoria_comision: cat,
      descripcion: m.concepto || 'Ingreso caja',
      monto_neto: neto,
      porcentaje_comision: pct,
      comision_monto: calcularComision(neto, pct),
      fecha: m.fecha,
      movimiento_id: m.id,
    })
  }

  return lineas
}
