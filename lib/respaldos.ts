import { createAdminClient } from '@/lib/supabase/server'

/** Tablas de negocio que se incluyen en cada respaldo. */
export const TABLAS_RESPALDO = [
  'sucursales', 'modulos', 'roles', 'permisos', 'rol_permisos', 'perfiles', 'perfil_roles',
  'pacientes', 'paciente_antecedentes', 'colonias',
  'consultas', 'consulta_detalle', 'consulta_servicios', 'citas',
  'productos', 'producto_categorias', 'inventario', 'inventario_movimientos',
  'proveedores', 'compras', 'compra_detalles',
  'caja_sesiones', 'caja_movimientos', 'cxc', 'cxc_abonos',
  'facturas', 'factura_correlativos', 'facturas_auditoria',
  'devoluciones', 'autorizaciones',
  'membresias', 'membresia_tipos', 'membresia_pagos',
  'cotizaciones',
  'paciente_puntos_movimientos', 'paciente_saldo_movimientos',
]

const BUCKET = 'respaldos'
const RETENCION_AUTOMATICOS = 14

export interface ResultadoRespaldo {
  ok: boolean
  error?: string
  respaldo?: {
    id: number; archivo: string; tipo: string; tablas: number
    registros: number; tamano_bytes: number; created_at: string
    generado_por_nombre?: string | null
  }
}

/**
 * Genera un respaldo completo (JSON) de las tablas de negocio, lo sube al
 * bucket privado `respaldos` de Storage y registra los metadatos.
 * Usa el service role (bypassa RLS); la autorización se valida en el llamador.
 */
export async function crearRespaldo(opts: {
  tipo: 'MANUAL' | 'AUTOMATICO'
  userId?: string | null
  userNombre?: string | null
}): Promise<ResultadoRespaldo> {
  const admin = createAdminClient()
  if (!admin) {
    return { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY no está configurado en el servidor.' }
  }

  const generado = new Date().toISOString()
  const data: Record<string, unknown[]> = {}
  let totalRegistros = 0
  let tablasOk = 0

  for (const tabla of TABLAS_RESPALDO) {
    const { data: filas, error } = await admin.from(tabla).select('*').limit(100000)
    if (error) continue // tabla inexistente en BD legacy: se omite
    data[tabla] = filas ?? []
    totalRegistros += (filas ?? []).length
    tablasOk += 1
  }

  const payload = {
    meta: {
      generado,
      tipo: opts.tipo,
      generado_por: opts.userNombre ?? null,
      version: '2.0',
      tablas: tablasOk,
      registros: totalRegistros,
    },
    data,
  }

  const json = JSON.stringify(payload)
  const tamano = Buffer.byteLength(json, 'utf8')
  const stamp = generado.replace(/[:.]/g, '-')
  const archivo = `${opts.tipo.toLowerCase()}/respaldo-${stamp}.json`

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(archivo, json, { contentType: 'application/json', upsert: true })
  if (upErr) {
    return { ok: false, error: `No se pudo subir el respaldo a Storage: ${upErr.message}` }
  }

  const { data: row, error: insErr } = await admin
    .from('respaldos')
    .insert({
      archivo, bucket: BUCKET, tipo: opts.tipo,
      tablas: tablasOk, registros: totalRegistros, tamano_bytes: tamano,
      generado_por: opts.userId ?? null,
      generado_por_nombre: opts.userNombre ?? (opts.tipo === 'AUTOMATICO' ? 'Sistema (automático)' : null),
    })
    .select('id, archivo, tipo, tablas, registros, tamano_bytes, created_at, generado_por_nombre')
    .single()
  if (insErr) {
    return { ok: false, error: `Respaldo subido pero no se registró: ${insErr.message}` }
  }

  // Retención: conservar solo los últimos N respaldos automáticos
  if (opts.tipo === 'AUTOMATICO') {
    const { data: viejos } = await admin
      .from('respaldos')
      .select('id, archivo')
      .eq('tipo', 'AUTOMATICO')
      .order('created_at', { ascending: false })
      .range(RETENCION_AUTOMATICOS, RETENCION_AUTOMATICOS + 200)
    if (viejos && viejos.length > 0) {
      await admin.storage.from(BUCKET).remove(viejos.map(v => v.archivo))
      await admin.from('respaldos').delete().in('id', viejos.map(v => v.id))
    }
  }

  return { ok: true, respaldo: row as ResultadoRespaldo['respaldo'] }
}
