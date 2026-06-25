import type { SupabaseClient } from '@supabase/supabase-js'
import type { LabInsumo } from '@/lib/lab-insumos'

export type ProcesamientoLab = 'INTERNA' | 'MAQUILADA' | 'MIXTA'

export interface LabCostoOrden {
  id: number
  orden_id: number
  prueba_id: number
  ingreso: number
  costo_insumos: number
  costo_maquila: number
  comision: number
  utilidad: number
  margen_pct?: number | null
  procesamiento?: ProcesamientoLab | null
  proveedor_id?: number | null
  created_at?: string
}

export interface LabConsumoOrden {
  id: number
  orden_id: number
  prueba_id: number
  producto_id: number
  cantidad: number
  costo_unitario: number
  costo_total: number
}

export interface PruebaCostoInfo {
  id: number
  costo: number
  comision?: number
  procesamiento?: ProcesamientoLab
  costo_maquila?: number
  proveedor_id?: number | null
}

export interface LabRentabilidadStats {
  ingresos: number
  costoInsumos: number
  costoMaquila: number
  comisiones: number
  utilidad: number
  margenPct: number | null
  ordenesConCosto: number
  internas: { ingresos: number; utilidad: number; count: number }
  maquiladas: { ingresos: number; utilidad: number; count: number }
  mixtas: { ingresos: number; utilidad: number; count: number }
  topRentables: { nombre: string; utilidad: number; ingresos: number; count: number }[]
  topProveedores: { nombre: string; costo: number; count: number }[]
}

export function labelProcesamiento(p?: ProcesamientoLab | string | null): string {
  if (p === 'MAQUILADA') return 'Maquilada'
  if (p === 'MIXTA') return 'Mixta'
  return 'Interna'
}

export function claseProcesamiento(p?: ProcesamientoLab | string | null): string {
  if (p === 'MAQUILADA') return 'bg-amber-100 text-amber-800'
  if (p === 'MIXTA') return 'bg-violet-100 text-violet-800'
  return 'bg-emerald-100 text-emerald-800'
}

export function calcularCostoEstimadoInsumos(
  insumos: LabInsumo[],
  costosProducto: Record<number, number>,
): number {
  return insumos.reduce((sum, ins) => {
    const unit = costosProducto[ins.producto_id] ?? 0
    return sum + unit * (Number(ins.cantidad) || 1)
  }, 0)
}

export function calcularMargenEstimado(
  precioVenta: number,
  costoInsumos: number,
  costoMaquila: number,
  comisionPct = 0,
): { costoTotal: number; utilidad: number; margenPct: number | null } {
  const comision = precioVenta * (Number(comisionPct) || 0) / 100
  const costoTotal = costoInsumos + costoMaquila + comision
  const utilidad = precioVenta - costoTotal
  const margenPct = precioVenta > 0 ? Math.round((utilidad / precioVenta) * 10000) / 100 : null
  return { costoTotal, utilidad, margenPct }
}

export function costoMaquilaAplicable(prueba: PruebaCostoInfo): number {
  const proc = prueba.procesamiento ?? 'INTERNA'
  if (proc === 'INTERNA') return 0
  return Number(prueba.costo_maquila) || 0
}

export function debeDescontarInsumos(prueba: PruebaCostoInfo): boolean {
  const proc = prueba.procesamiento ?? 'INTERNA'
  return proc === 'INTERNA' || proc === 'MIXTA'
}

export async function upsertCostoOrden(
  supabase: SupabaseClient,
  params: {
    ordenId: number
    prueba: PruebaCostoInfo
    ingreso: number
    costoInsumos: number
    costoMaquila?: number
  },
): Promise<{ error: string | null }> {
  const costoMaquila = params.costoMaquila ?? costoMaquilaAplicable(params.prueba)
  const comision = params.ingreso * (Number(params.prueba.comision) || 0) / 100
  const utilidad = params.ingreso - params.costoInsumos - costoMaquila - comision
  const margenPct = params.ingreso > 0
    ? Math.round((utilidad / params.ingreso) * 10000) / 100
    : null

  const payload = {
    orden_id: params.ordenId,
    prueba_id: params.prueba.id,
    ingreso: params.ingreso,
    costo_insumos: params.costoInsumos,
    costo_maquila: costoMaquila,
    comision,
    utilidad,
    margen_pct: margenPct,
    procesamiento: params.prueba.procesamiento ?? 'INTERNA',
    proveedor_id: params.prueba.proveedor_id ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data: existente } = await supabase
    .from('lab_costos_orden')
    .select('id')
    .eq('orden_id', params.ordenId)
    .maybeSingle()

  if (existente?.id) {
    const { error } = await supabase.from('lab_costos_orden').update(payload).eq('id', existente.id)
    return { error: error?.message ?? null }
  }

  const { error } = await supabase.from('lab_costos_orden').insert(payload)
  return { error: error?.message ?? null }
}

export function calcularReporteRentabilidad(
  costos: LabCostoOrden[],
  pruebasMap: Record<number, { nombre: string }>,
  proveedoresMap: Record<number, string>,
): LabRentabilidadStats {
  const base: LabRentabilidadStats = {
    ingresos: 0,
    costoInsumos: 0,
    costoMaquila: 0,
    comisiones: 0,
    utilidad: 0,
    margenPct: null,
    ordenesConCosto: costos.length,
    internas: { ingresos: 0, utilidad: 0, count: 0 },
    maquiladas: { ingresos: 0, utilidad: 0, count: 0 },
    mixtas: { ingresos: 0, utilidad: 0, count: 0 },
    topRentables: [],
    topProveedores: [],
  }

  const porPrueba = new Map<number, { nombre: string; utilidad: number; ingresos: number; count: number }>()
  const porProveedor = new Map<number, { nombre: string; costo: number; count: number }>()

  for (const c of costos) {
    const ingreso = Number(c.ingreso) || 0
    const insumos = Number(c.costo_insumos) || 0
    const maquila = Number(c.costo_maquila) || 0
    const comision = Number(c.comision) || 0
    const utilidad = Number(c.utilidad) || 0

    base.ingresos += ingreso
    base.costoInsumos += insumos
    base.costoMaquila += maquila
    base.comisiones += comision
    base.utilidad += utilidad

    const proc = c.procesamiento ?? 'INTERNA'
    if (proc === 'MAQUILADA') {
      base.maquiladas.ingresos += ingreso
      base.maquiladas.utilidad += utilidad
      base.maquiladas.count++
    } else if (proc === 'MIXTA') {
      base.mixtas.ingresos += ingreso
      base.mixtas.utilidad += utilidad
      base.mixtas.count++
    } else {
      base.internas.ingresos += ingreso
      base.internas.utilidad += utilidad
      base.internas.count++
    }

    const nombrePrueba = pruebasMap[c.prueba_id]?.nombre ?? `Prueba #${c.prueba_id}`
    const prevP = porPrueba.get(c.prueba_id) ?? { nombre: nombrePrueba, utilidad: 0, ingresos: 0, count: 0 }
    prevP.utilidad += utilidad
    prevP.ingresos += ingreso
    prevP.count++
    porPrueba.set(c.prueba_id, prevP)

    if (c.proveedor_id && maquila > 0) {
      const nombreProv = proveedoresMap[c.proveedor_id] ?? `Proveedor #${c.proveedor_id}`
      const prevV = porProveedor.get(c.proveedor_id) ?? { nombre: nombreProv, costo: 0, count: 0 }
      prevV.costo += maquila
      prevV.count++
      porProveedor.set(c.proveedor_id, prevV)
    }
  }

  base.margenPct = base.ingresos > 0
    ? Math.round((base.utilidad / base.ingresos) * 10000) / 100
    : null

  base.topRentables = [...porPrueba.values()]
    .sort((a, b) => b.utilidad - a.utilidad)
    .slice(0, 8)

  base.topProveedores = [...porProveedor.values()]
    .sort((a, b) => b.costo - a.costo)
    .slice(0, 6)

  return base
}
