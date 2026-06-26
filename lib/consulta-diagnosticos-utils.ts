/** Diagnósticos estructurados con CIE-10 por consulta */

export interface DiagnosticoItem {
  id?: number
  cie10_codigo: string | null
  descripcion: string
  principal: boolean
}

export interface Cie10Entry {
  codigo: string
  descripcion: string
  capitulo?: string | null
}

export function diagnosticosVacios(): DiagnosticoItem[] {
  return []
}

export function mapDiagnosticosFromDb(rows: Record<string, unknown>[]): DiagnosticoItem[] {
  return rows
    .sort((a, b) => Number(a.orden ?? 0) - Number(b.orden ?? 0))
    .map(r => ({
      id: r.id as number,
      cie10_codigo: r.cie10_codigo ? String(r.cie10_codigo) : null,
      descripcion: String(r.descripcion ?? ''),
      principal: Boolean(r.principal),
    }))
}

export function payloadDiagnosticos(consultaId: number, items: DiagnosticoItem[]) {
  return items
    .filter(d => d.descripcion.trim())
    .map((d, i) => ({
      consulta_id: consultaId,
      cie10_codigo: d.cie10_codigo?.trim() || null,
      descripcion: d.descripcion.trim(),
      principal: d.principal,
      orden: i,
    }))
}

/** Texto para impresión / impresion diagnóstica */
export function textoImpresionDiagnosticos(items: DiagnosticoItem[]): string {
  const validos = items.filter(d => d.descripcion.trim())
  if (!validos.length) return ''
  const principal = validos.find(d => d.principal) ?? validos[0]
  const secundarios = validos.filter(d => d !== principal)
  const fmt = (d: DiagnosticoItem) =>
    d.cie10_codigo ? `${d.cie10_codigo} — ${d.descripcion}` : d.descripcion
  const lineas = [`Principal: ${fmt(principal)}`]
  if (secundarios.length) {
    lineas.push(`Secundarios: ${secundarios.map(fmt).join('; ')}`)
  }
  return lineas.join('\n')
}

/** Sincroniza campos legacy de consulta_general */
export function denormalizarDiagnosticosGeneral(items: DiagnosticoItem[]): {
  diagnostico_principal: string
  diagnosticos_secundarios: string
} {
  const validos = items.filter(d => d.descripcion.trim())
  const principal = validos.find(d => d.principal) ?? validos[0]
  const secundarios = validos.filter(d => d !== principal)
  const fmt = (d: DiagnosticoItem) =>
    d.cie10_codigo ? `${d.cie10_codigo} ${d.descripcion}` : d.descripcion
  return {
    diagnostico_principal: principal ? fmt(principal) : '',
    diagnosticos_secundarios: secundarios.map(fmt).join('; '),
  }
}

export function agregarDiagnostico(
  items: DiagnosticoItem[],
  entry: { cie10_codigo?: string | null; descripcion: string; principal?: boolean },
): DiagnosticoItem[] {
  const desc = entry.descripcion.trim()
  if (!desc) return items
  const principal = entry.principal ?? items.length === 0
  const nuevos = principal
    ? items.map(d => ({ ...d, principal: false }))
    : [...items]
  nuevos.push({
    cie10_codigo: entry.cie10_codigo?.trim() || null,
    descripcion: desc,
    principal,
  })
  return nuevos
}

export function marcarPrincipal(items: DiagnosticoItem[], idx: number): DiagnosticoItem[] {
  return items.map((d, i) => ({ ...d, principal: i === idx }))
}

export function quitarDiagnostico(items: DiagnosticoItem[], idx: number): DiagnosticoItem[] {
  const rest = items.filter((_, i) => i !== idx)
  if (rest.length && !rest.some(d => d.principal)) {
    rest[0] = { ...rest[0], principal: true }
  }
  return rest
}
