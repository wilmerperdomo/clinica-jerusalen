/** Cédula / RTN sin espacios ni guiones, en mayúsculas */
export function normalizarCodigoPaciente(codigo: string | null | undefined): string {
  if (!codigo) return ''
  return codigo.trim().toUpperCase().replace(/[\s\-.]/g, '')
}

export interface PacienteBase {
  id: number
  codigo: string
  tipo: string
  nombre?: string | null
  apellido1?: string | null
  apellido2?: string | null
  nombre_empresa?: string | null
  rtn_empresa?: string | null
  contacto?: string | null
  fecha_nac?: string | null
  genero?: string | null
  foto_url?: string | null
}

export function nombreCompletoPaciente(p: PacienteBase): string {
  if ((p.tipo ?? '').toLowerCase() === 'empresa') {
    return (p.nombre_empresa ?? p.nombre ?? '').trim() || 'Empresa'
  }
  return [p.nombre, p.apellido1, p.apellido2].filter(Boolean).join(' ').trim() || '—'
}

export function edadPaciente(fechaNac?: string | null): number | null {
  if (!fechaNac) return null
  const hoy = new Date()
  const nac = new Date(fechaNac + 'T12:00:00')
  let edad = hoy.getFullYear() - nac.getFullYear()
  const m = hoy.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
  return edad >= 0 ? edad : null
}

export function textoBusquedaPacienteFull(p: {
  codigo?: string | null
  nombre?: string | null
  apellido1?: string | null
  apellido2?: string | null
  nombre_empresa?: string | null
  rtn_empresa?: string | null
  contacto?: string | null
  telefono?: string | null
  celular?: string | null
  correo?: string | null
  responsable?: string | null
}): string {
  return [
    p.codigo, p.nombre, p.apellido1, p.apellido2,
    p.nombre_empresa, p.rtn_empresa, p.contacto,
    p.telefono, p.celular, p.correo, p.responsable,
  ].filter(Boolean).join(' ').toLowerCase()
}

export function exportarPacientesCsv(
  rows: Record<string, string | number | null | undefined>[],
  filename = 'pacientes.csv',
) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => {
      const v = String(r[h] ?? '').replace(/"/g, '""')
      return `"${v}"`
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
