import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizarCodigoPaciente, nombreCompletoPaciente, type PacienteBase } from './paciente-utils'

export interface PacienteDuplicado extends PacienteBase {
  apellido2?: string | null
}

export function mensajePacienteDuplicado(p: PacienteDuplicado, campo: 'codigo' | 'rtn' = 'codigo'): string {
  const nombre = nombreCompletoPaciente(p)
  return campo === 'rtn'
    ? `Ya existe un paciente/empresa con ese RTN: ${nombre} (${p.codigo}).`
    : `Ya existe un paciente con esa cédula/código: ${nombre} (${p.codigo}).`
}

/** Busca paciente existente por código o RTN normalizado */
export async function buscarPacienteDuplicado(
  supabase: SupabaseClient,
  opts: {
    codigo: string
    rtnEmpresa?: string | null
    excludeId?: number
  },
): Promise<{ paciente: PacienteDuplicado; campo: 'codigo' | 'rtn' } | null> {
  const codigoNorm = normalizarCodigoPaciente(opts.codigo)
  const rtnNorm = opts.rtnEmpresa ? normalizarCodigoPaciente(opts.rtnEmpresa) : ''

  if (!codigoNorm && !rtnNorm) return null

  const { data: rpcData, error: rpcError } = await supabase.rpc('fn_paciente_codigo_duplicado', {
    p_codigo: codigoNorm || opts.codigo,
    p_rtn: rtnNorm || null,
    p_exclude_id: opts.excludeId ?? null,
  })

  if (!rpcError && rpcData) {
    const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as PacienteDuplicado | undefined
    if (row?.id) {
      const campo =
        rtnNorm &&
        row.codigo !== codigoNorm &&
        normalizarCodigoPaciente(row.rtn_empresa) === rtnNorm
          ? 'rtn'
          : 'codigo'
      return { paciente: row, campo }
    }
  }

  if (codigoNorm) {
    let q = supabase
      .from('pacientes')
      .select('id, codigo, tipo, nombre, apellido1, apellido2, nombre_empresa, rtn_empresa')
      .eq('codigo', codigoNorm)
    if (opts.excludeId) q = q.neq('id', opts.excludeId)
    const { data } = await q.maybeSingle()
    if (data) return { paciente: data as PacienteDuplicado, campo: 'codigo' }
  }

  if (rtnNorm) {
    let q = supabase
      .from('pacientes')
      .select('id, codigo, tipo, nombre, apellido1, apellido2, nombre_empresa, rtn_empresa')
      .eq('rtn_empresa', rtnNorm)
    if (opts.excludeId) q = q.neq('id', opts.excludeId)
    const { data } = await q.maybeSingle()
    if (data) return { paciente: data as PacienteDuplicado, campo: 'rtn' }
  }

  return null
}
