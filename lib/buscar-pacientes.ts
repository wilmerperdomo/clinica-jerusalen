import type { SupabaseClient } from '@supabase/supabase-js'
import {
  PACIENTE_CONSULTA_SELECT,
  textoBusquedaPaciente,
  type PacienteConsulta,
} from '@/lib/consultas-utils'

/** Columnas reales en `pacientes` (genero, no sexo) */
export const PACIENTE_BUSQUEDA_SELECT = `${PACIENTE_CONSULTA_SELECT},genero,activo`

export type PacienteBusquedaRow = PacienteConsulta & {
  id: number
  codigo: string
  genero?: string
  activo?: boolean | null
}

function sanitizarTermino(term: string): string {
  return term.replace(/[%_\\,().]/g, '').trim()
}

function filtroOrIlike(patron: string): string {
  const p = `%${patron}%`
  return [
    `codigo.ilike.${p}`,
    `nombre.ilike.${p}`,
    `apellido1.ilike.${p}`,
    `apellido2.ilike.${p}`,
    `nombre_empresa.ilike.${p}`,
    `rtn_empresa.ilike.${p}`,
    `contacto.ilike.${p}`,
    `celular.ilike.${p}`,
    `telefono.ilike.${p}`,
    `correo.ilike.${p}`,
  ].join(',')
}

function pacienteActivo(p: PacienteBusquedaRow): boolean {
  if (p.activo === false) return false
  const a = p.activo as boolean | string | null | undefined
  if (a === '0' || a === 'false') return false
  return true
}

function normalizarBusqueda(s: string): string {
  return s.toLowerCase().replace(/[-\s./]/g, '')
}

function coincideBusqueda(p: PacienteConsulta, termFull: string, palabras: string[]): boolean {
  const texto = textoBusquedaPaciente(p)
  if (texto.includes(termFull)) return true

  const textoNorm = normalizarBusqueda(texto)
  const termNorm = normalizarBusqueda(termFull)
  if (termNorm.length >= 2 && textoNorm.includes(termNorm)) return true

  if (palabras.length > 1) {
    return palabras.every(w => texto.includes(w) || textoNorm.includes(normalizarBusqueda(w)))
  }
  return false
}

async function consultarPorPatron(
  supabase: SupabaseClient,
  patron: string,
): Promise<PacienteBusquedaRow[]> {
  const { data, error } = await supabase
    .from('pacientes')
    .select(PACIENTE_BUSQUEDA_SELECT)
    .or(filtroOrIlike(patron))
    .order('nombre')
    .limit(80)

  if (error) {
    console.error('buscarPacientesActivos:', error.message)
    return []
  }
  return (data ?? []) as PacienteBusquedaRow[]
}

/** Búsqueda en servidor sobre pacientes registrados */
export async function buscarPacientesActivos(
  supabase: SupabaseClient,
  termino: string,
  limite = 25,
): Promise<PacienteBusquedaRow[]> {
  const term = termino.trim()
  if (term.length < 2) return []

  const palabras = term.toLowerCase().split(/\s+/).filter(Boolean)
  const patrones = [...new Set(
    palabras
      .map(sanitizarTermino)
      .filter(p => p.length >= 2)
      .concat(sanitizarTermino(term).length >= 2 ? [sanitizarTermino(term)] : []),
  )]

  if (!patrones.length) return []

  const map = new Map<number, PacienteBusquedaRow>()
  for (const patron of patrones) {
    const rows = await consultarPorPatron(supabase, patron)
    for (const row of rows) {
      if (pacienteActivo(row)) map.set(row.id, row)
    }
  }

  const termFull = term.toLowerCase()
  const filtrados = [...map.values()].filter(p =>
    coincideBusqueda(p, termFull, palabras),
  )

  return filtrados.slice(0, limite)
}
