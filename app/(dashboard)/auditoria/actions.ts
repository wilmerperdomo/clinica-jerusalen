'use server'

import { headers } from 'next/headers'
import { getPerfilSucursal } from '@/lib/get-sucursal'
import { createAdminClient, createClient } from '@/lib/supabase/server'
import { crearRespaldo } from '@/lib/respaldos'
import {
  bitacoraACsv,
  type BitacoraRow,
  type FacturaAuditoriaRow,
  type RespaldoRow,
  type ResumenAuditoria,
  calcularSaludRespaldo,
} from '@/lib/auditoria-utils'

async function requireSuperAdmin() {
  const perfil = await getPerfilSucursal()
  if (!perfil.esSuperAdmin) return { ok: false as const, error: 'No autorizado', perfil: null }
  return { ok: true as const, perfil }
}

async function metaRequest() {
  const h = await headers()
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null,
    userAgent: h.get('user-agent') ?? null,
  }
}

export async function registrarAccesoAuditoria(accion: string, detalle?: string) {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return
    const { ip, userAgent } = await metaRequest()
    const admin = createAdminClient()
    if (!admin) return
    await admin.from('auditoria_accesos').insert({
      accion,
      detalle: detalle ?? null,
      usuario_id: auth.perfil!.userId,
      usuario_nombre: auth.perfil!.nombre,
      usuario_email: null,
      ip_address: ip,
      user_agent: userAgent,
    })
  } catch {
    /* tabla auditoria_accesos puede no existir hasta aplicar migración 097 */
  }
}

export async function generarRespaldoManual(nota?: string) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false as const, error: auth.error }
  await registrarAccesoAuditoria('RESPALDO_MANUAL', nota?.trim() || 'Generación manual')
  return crearRespaldo({
    tipo: 'MANUAL',
    userId: auth.perfil!.userId,
    userNombre: auth.perfil!.nombre,
    nota: nota?.trim() || null,
  })
}

export async function urlDescargaRespaldo(archivo: string) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false as const, error: auth.error }
  await registrarAccesoAuditoria('RESPALDO_DESCARGA', archivo)
  const admin = createAdminClient()
  if (!admin) return { ok: false as const, error: 'Service role no configurado' }
  const { data, error } = await admin.storage.from('respaldos').createSignedUrl(archivo, 300, { download: true })
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, url: data.signedUrl }
}

export async function eliminarRespaldo(id: number, archivo: string) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false as const, error: auth.error }
  await registrarAccesoAuditoria('RESPALDO_ELIMINAR', archivo)
  const admin = createAdminClient()
  if (!admin) return { ok: false as const, error: 'Service role no configurado' }
  await admin.storage.from('respaldos').remove([archivo])
  const { error } = await admin.from('respaldos').delete().eq('id', id)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

export interface FiltrosBitacora {
  buscar?: string
  tabla?: string
  operacion?: string
  usuario?: string
  fechaDesde?: string
  fechaHasta?: string
  page?: number
  pageSize?: number
}

export async function fetchBitacora(filtros: FiltrosBitacora = {}) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false as const, error: auth.error }

  const supabase = await createClient()
  if (!supabase) return { ok: false as const, error: 'Sin conexión' }

  const page = filtros.page ?? 1
  const pageSize = filtros.pageSize ?? 50
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let q = supabase
    .from('auditoria_general')
    .select(
      'id, tabla, registro_id, operacion, datos_antes, datos_despues, campos_cambiados, usuario_email, usuario_nombre, usuario_id, fecha, ip_address, user_agent, sucursal_id',
      { count: 'exact' },
    )
    .order('fecha', { ascending: false })

  if (filtros.tabla) q = q.eq('tabla', filtros.tabla)
  if (filtros.operacion) q = q.eq('operacion', filtros.operacion)
  if (filtros.fechaDesde) q = q.gte('fecha', filtros.fechaDesde)
  if (filtros.fechaHasta) q = q.lte('fecha', `${filtros.fechaHasta}T23:59:59`)
  if (filtros.usuario) q = q.ilike('usuario_nombre', `%${filtros.usuario}%`)

  const buscar = filtros.buscar?.trim()
  if (buscar) {
    q = q.or(`tabla.ilike.%${buscar}%,usuario_nombre.ilike.%${buscar}%,usuario_email.ilike.%${buscar}%,registro_id.ilike.%${buscar}%`)
  }

  const { data, count, error } = await q.range(from, to)
  if (error) return { ok: false as const, error: error.message }

  return {
    ok: true as const,
    rows: (data ?? []) as BitacoraRow[],
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  }
}

export async function exportarBitacoraCSV(filtros: Omit<FiltrosBitacora, 'page' | 'pageSize'> = {}) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false as const, error: auth.error }
  await registrarAccesoAuditoria('BITACORA_EXPORTAR', JSON.stringify(filtros))

  const supabase = await createClient()
  if (!supabase) return { ok: false as const, error: 'Sin conexión' }

  let q = supabase
    .from('auditoria_general')
    .select('id, tabla, registro_id, operacion, campos_cambiados, usuario_email, usuario_nombre, fecha, sucursal_id')
    .order('fecha', { ascending: false })
    .limit(5000)

  if (filtros.tabla) q = q.eq('tabla', filtros.tabla)
  if (filtros.operacion) q = q.eq('operacion', filtros.operacion)
  if (filtros.fechaDesde) q = q.gte('fecha', filtros.fechaDesde)
  if (filtros.fechaHasta) q = q.lte('fecha', `${filtros.fechaHasta}T23:59:59`)
  if (filtros.usuario) q = q.ilike('usuario_nombre', `%${filtros.usuario}%`)
  const buscar = filtros.buscar?.trim()
  if (buscar) {
    q = q.or(`tabla.ilike.%${buscar}%,usuario_nombre.ilike.%${buscar}%,registro_id.ilike.%${buscar}%`)
  }

  const { data, error } = await q
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, csv: bitacoraACsv((data ?? []) as BitacoraRow[]) }
}

export async function fetchFacturasAuditoria(page = 1, pageSize = 50) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false as const, error: auth.error }

  const supabase = await createClient()
  if (!supabase) return { ok: false as const, error: 'Sin conexión' }

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, count, error } = await supabase
    .from('facturas_auditoria')
    .select('id, factura_id, numero, accion, motivo, usuario_nombre, fecha, datos_antes', { count: 'exact' })
    .order('fecha', { ascending: false })
    .range(from, to)

  if (error) return { ok: false as const, error: error.message }
  return {
    ok: true as const,
    rows: (data ?? []) as FacturaAuditoriaRow[],
    total: count ?? 0,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  }
}

export async function fetchResumenAuditoria(): Promise<{ ok: boolean; resumen?: ResumenAuditoria; error?: string }> {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false, error: auth.error }

  const supabase = await createClient()
  if (!supabase) return { ok: false, error: 'Sin conexión' }

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)

  const [{ count: totalEventos }, { count: elimHoy }, { data: ultimos7 }, { data: usuarios }, { data: tablas }, { data: respaldos }] =
    await Promise.all([
      supabase.from('auditoria_general').select('*', { count: 'exact', head: true }),
      supabase.from('auditoria_general').select('*', { count: 'exact', head: true }).eq('operacion', 'DELETE').gte('fecha', hoy.toISOString()),
      supabase.from('auditoria_general').select('fecha').gte('fecha', new Date(Date.now() - 7 * 86400000).toISOString()).limit(3000),
      supabase.from('auditoria_general').select('usuario_nombre').not('usuario_nombre', 'is', null).limit(3000),
      supabase.from('auditoria_general').select('tabla').limit(3000),
      supabase.from('respaldos').select('id, archivo, tipo, tablas, registros, tamano_bytes, generado_por_nombre, nota, hash_sha256, comprimido, created_at').order('created_at', { ascending: false }).limit(100),
    ])

  const porDia = new Map<string, number>()
  for (const r of ultimos7 ?? []) {
    const d = (r.fecha as string).slice(0, 10)
    porDia.set(d, (porDia.get(d) ?? 0) + 1)
  }
  const eventosPorDia = Array.from(porDia.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, total]) => ({ fecha, total }))

  const usrMap = new Map<string, number>()
  for (const r of usuarios ?? []) {
    const n = (r.usuario_nombre as string) || '—'
    usrMap.set(n, (usrMap.get(n) ?? 0) + 1)
  }
  const topUsuarios = Array.from(usrMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([nombre, total]) => ({ nombre, total }))

  const tabMap = new Map<string, number>()
  for (const r of tablas ?? []) {
    const t = r.tabla as string
    tabMap.set(t, (tabMap.get(t) ?? 0) + 1)
  }
  const topTablas = Array.from(tabMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tabla, total]) => ({ tabla, total }))

  const listaResp = (respaldos ?? []) as RespaldoRow[]
  const ultimoRespaldoAuto = listaResp.find(r => r.tipo === 'AUTOMATICO') ?? null
  const salud = calcularSaludRespaldo(ultimoRespaldoAuto)

  return {
    ok: true,
    resumen: {
      totalEventos: totalEventos ?? 0,
      eliminacionesHoy: elimHoy ?? 0,
      eventosPorDia,
      topUsuarios,
      topTablas,
      ultimoRespaldoAuto,
      horasSinRespaldoAuto: salud.horas,
      respaldoSaludable: salud.saludable,
    },
  }
}

export async function fetchUsuariosBitacora() {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false as const, error: auth.error, usuarios: [] as string[] }
  const supabase = await createClient()
  if (!supabase) return { ok: false as const, error: 'Sin conexión', usuarios: [] as string[] }
  const { data } = await supabase
    .from('auditoria_general')
    .select('usuario_nombre')
    .not('usuario_nombre', 'is', null)
    .limit(500)
  const set = new Set((data ?? []).map(r => r.usuario_nombre as string).filter(Boolean))
  return { ok: true as const, usuarios: Array.from(set).sort() }
}

export async function fetchAccesosModulo(limit = 15) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false as const, error: auth.error, rows: [] }

  const admin = createAdminClient()
  if (!admin) return { ok: false as const, error: 'Sin service role', rows: [] }

  const { data, error } = await admin
    .from('auditoria_accesos')
    .select('id, accion, detalle, usuario_nombre, ip_address, fecha')
    .order('fecha', { ascending: false })
    .limit(limit)

  if (error) return { ok: false as const, error: error.message, rows: [] }
  return { ok: true as const, rows: data ?? [] }
}

export async function fetchTablasBitacora() {
  const auth = await requireSuperAdmin()
  if (!auth.ok) return { ok: false as const, error: auth.error, tablas: [] as string[] }
  const supabase = await createClient()
  if (!supabase) return { ok: false as const, error: 'Sin conexión', tablas: [] as string[] }
  const { data } = await supabase.from('auditoria_general').select('tabla').limit(1000)
  const set = new Set((data ?? []).map(r => r.tabla as string))
  return { ok: true as const, tablas: Array.from(set).sort() }
}
