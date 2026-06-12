export interface ColoniaRow {
  id: number
  nombre: string
  activo: boolean
  created_at?: string
}

export function exportarColoniasCsv(
  rows: { nombre: string; activo: string; pacientes: number }[],
  filename = 'colonias.csv',
) {
  if (!rows.length) return
  const headers = ['nombre', 'activo', 'pacientes']
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => {
      const key = h as keyof typeof r
      return `"${String(r[key] ?? '').replace(/"/g, '""')}"`
    }).join(',')),
  ].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function parseColoniasImport(texto: string): string[] {
  return [...new Set(
    texto
      .split(/[\n,;]+/)
      .map(s => s.trim())
      .filter(s => s.length >= 2 && s !== '1'),
  )]
}

export function fmtFechaColonia(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-HN', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}
