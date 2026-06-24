import type { SupabaseClient } from '@supabase/supabase-js'

export type TipoDocCorrelativo = 'RECETA' | 'CONSTANCIA' | 'DEFUNCION' | 'REFERENCIA'

const PREFIJOS: Record<TipoDocCorrelativo, string> = {
  RECETA: 'REC',
  CONSTANCIA: 'CM',
  DEFUNCION: 'CD',
  REFERENCIA: 'RM',
}

export function formatearNumeroDocumento(
  tipo: TipoDocCorrelativo,
  correlativo: number,
  sucursalId: number,
): string {
  const suc = String(sucursalId).padStart(2, '0')
  const num = String(correlativo).padStart(6, '0')
  return `${PREFIJOS[tipo]}-${suc}-${num}`
}

/** Reserva el siguiente correlativo para receta / constancia / acta de defunción */
export async function reservarCorrelativoDocumento(
  supabase: SupabaseClient,
  sucursalId: number,
  tipo: TipoDocCorrelativo,
): Promise<{ correlativo: number; numero_doc: string }> {
  const { data: row } = await supabase
    .from('documento_correlativos')
    .select('ultimo_numero')
    .eq('sucursal_id', sucursalId)
    .eq('tipo', tipo)
    .maybeSingle()

  const { data: maxRow } = await supabase
    .from('consulta_documentos')
    .select('correlativo')
    .eq('sucursal_id', sucursalId)
    .eq('tipo', tipo)
    .order('correlativo', { ascending: false })
    .limit(1)
    .maybeSingle()

  const fromTable = Number(row?.ultimo_numero ?? 0)
  const fromDocs = Number(maxRow?.correlativo ?? 0)
  const correlativo = Math.max(fromTable, fromDocs) + 1
  const numero_doc = formatearNumeroDocumento(tipo, correlativo, sucursalId)

  await supabase.from('documento_correlativos').upsert(
    { sucursal_id: sucursalId, tipo, ultimo_numero: correlativo },
    { onConflict: 'sucursal_id,tipo' },
  )

  return { correlativo, numero_doc }
}
