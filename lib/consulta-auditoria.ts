/** Auditoría de calidad de la consulta en curso */

export type TipoAuditoria = 'error' | 'warning' | 'info'

export interface ItemAuditoria {
  id: string
  tipo: TipoAuditoria
  mensaje: string
}

export function auditarConsulta(opts: {
  sintoma: string
  historia: string
  impresion: string
  tratamiento: string
  tieneDiagnosticos: boolean
  recetaItems: { no_producto: string; indicacion: string }[]
  labItems: { no_analisis: string }[]
  embarazoActivo?: boolean
  fpp?: string | null
  fum?: string | null
  fechaNac?: string | null
  catalogoVacunasCargado?: boolean
  edadMeses?: number | null
}): ItemAuditoria[] {
  const items: ItemAuditoria[] = []

  if (!opts.sintoma.trim()) items.push({ id: 'sintoma', tipo: 'error', mensaje: 'Falta síntoma principal.' })
  if (!opts.historia.trim()) items.push({ id: 'historia', tipo: 'error', mensaje: 'Falta historia clínica.' })
  if (!opts.impresion.trim() && !opts.tieneDiagnosticos) {
    items.push({ id: 'dx', tipo: 'error', mensaje: 'Sin diagnóstico ni impresión diagnóstica.' })
  }
  if (!opts.tratamiento.trim()) items.push({ id: 'tx', tipo: 'warning', mensaje: 'Sin tratamiento documentado.' })

  const sinIndicacion = opts.recetaItems.filter(r => r.no_producto.trim() && !r.indicacion.trim())
  if (sinIndicacion.length) {
    items.push({
      id: 'receta-indicacion',
      tipo: 'warning',
      mensaje: `${sinIndicacion.length} medicamento(s) sin indicación/dosis en receta.`,
    })
  }

  if (opts.labItems.length > 0 && !opts.tieneDiagnosticos && !opts.impresion.trim()) {
    items.push({
      id: 'lab-sin-dx',
      tipo: 'warning',
      mensaje: 'Laboratorio pedido sin diagnóstico que lo justifique.',
    })
  }

  if (opts.embarazoActivo) {
    if (!opts.fum) items.push({ id: 'fum', tipo: 'warning', mensaje: 'Embarazo activo sin FUM registrada.' })
    if (!opts.fpp) items.push({ id: 'fpp', tipo: 'warning', mensaje: 'Embarazo activo sin FPP calculada.' })
  }

  if (opts.edadMeses != null && opts.edadMeses <= 216 && opts.catalogoVacunasCargado === false) {
    items.push({ id: 'vacunas', tipo: 'info', mensaje: 'Revise esquema de vacunación del menor.' })
  }

  return items
}

export function claseAuditoria(t: TipoAuditoria): string {
  const map: Record<TipoAuditoria, string> = {
    error: 'bg-red-50 border-red-200 text-red-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    info: 'bg-sky-50 border-sky-200 text-sky-800',
  }
  return map[t]
}
