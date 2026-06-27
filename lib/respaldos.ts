import { createHash } from 'crypto'
import { gzipSync } from 'zlib'
import { createAdminClient } from '@/lib/supabase/server'

/** Tablas de negocio incluidas en cada respaldo. */
export const TABLAS_RESPALDO = [
  'sucursales', 'modulos', 'roles', 'permisos', 'rol_permisos', 'perfiles', 'perfil_roles',
  'pacientes', 'paciente_antecedentes', 'paciente_antecedentes_go', 'colonias',
  'consultas', 'consulta_detalle', 'consulta_servicios', 'consulta_diagnosticos', 'citas',
  'productos', 'producto_categorias', 'inventario', 'inventario_movimientos',
  'inventario_conteos', 'inventario_conteo_detalles', 'inventario_transferencias',
  'proveedores', 'compras', 'compra_detalles',
  'caja_sesiones', 'caja_movimientos', 'cxc', 'cxc_abonos', 'cxp', 'cxp_abonos',
  'facturas', 'factura_correlativos', 'facturas_auditoria', 'devoluciones', 'autorizaciones',
  'membresias', 'membresia_tipos', 'membresia_pagos', 'membresia_beneficiarios', 'membresia_beneficios',
  'cotizaciones', 'cotizacion_detalles',
  'paciente_puntos_movimientos', 'paciente_saldo_movimientos', 'fidelidad_config',
  'planilla_periodos', 'planilla_liquidaciones', 'planilla_liquidacion_detalle',
  'planilla_liquidacion_ajustes', 'planilla_comisiones', 'planilla_sueldo_historial',
  'laboratorio_ordenes', 'laboratorio_detalle', 'lab_perfiles', 'lab_perfil_pruebas',
  'lab_pruebas', 'lab_rangos', 'medicos',
  'finanzas_categorias', 'finanzas_movimientos', 'finanzas_prestamos', 'finanzas_prestamo_pagos',
  'finanzas_tarjetas', 'finanzas_tarjeta_pagos', 'finanzas_deudas', 'finanzas_deuda_pagos',
  'finanzas_presupuestos', 'finanzas_cuentas', 'finanzas_cuenta_movimientos', 'finanzas_pagos_programados',
  'promociones', 'promocion_campanas', 'promocion_contactos', 'promocion_plantillas', 'promocion_reglas',
  'servicios', 'auditoria_general',
]

const BUCKET = 'respaldos'
const RETENCION_AUTOMATICOS = 14

export interface ResultadoRespaldo {
  ok: boolean
  error?: string
  respaldo?: {
    id: number
    archivo: string
    tipo: string
    tablas: number
    registros: number
    tamano_bytes: number
    created_at: string
    generado_por_nombre?: string | null
    nota?: string | null
    hash_sha256?: string | null
    comprimido?: boolean
  }
}

/**
 * Genera respaldo JSON comprimido (gzip), hash SHA-256, sube a Storage privado.
 */
export async function crearRespaldo(opts: {
  tipo: 'MANUAL' | 'AUTOMATICO'
  userId?: string | null
  userNombre?: string | null
  nota?: string | null
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
    if (error) continue
    data[tabla] = filas ?? []
    totalRegistros += (filas ?? []).length
    tablasOk += 1
  }

  const payload = {
    meta: {
      generado,
      tipo: opts.tipo,
      generado_por: opts.userNombre ?? null,
      version: '3.0',
      tablas: tablasOk,
      registros: totalRegistros,
      comprimido: true,
    },
    data,
  }

  const json = JSON.stringify(payload)
  const raw = Buffer.from(json, 'utf8')
  const compressed = gzipSync(raw)
  const hash = createHash('sha256').update(compressed).digest('hex')
  const stamp = generado.replace(/[:.]/g, '-')
  const archivo = `${opts.tipo.toLowerCase()}/respaldo-${stamp}.json.gz`

  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(archivo, compressed, { contentType: 'application/gzip', upsert: true })
  if (upErr) {
    return { ok: false, error: `No se pudo subir el respaldo a Storage: ${upErr.message}` }
  }

  const { data: row, error: insErr } = await admin
    .from('respaldos')
    .insert({
      archivo,
      bucket: BUCKET,
      tipo: opts.tipo,
      tablas: tablasOk,
      registros: totalRegistros,
      tamano_bytes: compressed.length,
      hash_sha256: hash,
      comprimido: true,
      nota: opts.nota?.trim() || null,
      generado_por: opts.userId ?? null,
      generado_por_nombre: opts.userNombre ?? (opts.tipo === 'AUTOMATICO' ? 'Sistema (automático)' : null),
    })
    .select('id, archivo, tipo, tablas, registros, tamano_bytes, created_at, generado_por_nombre, nota, hash_sha256, comprimido')
    .single()
  if (insErr) {
    return { ok: false, error: `Respaldo subido pero no se registró: ${insErr.message}` }
  }

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
