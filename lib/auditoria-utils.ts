/** Utilidades del módulo Auditoría y Respaldos */

export interface BitacoraRow {
  id: number
  tabla: string
  registro_id?: string | null
  operacion: string
  datos_antes?: Record<string, unknown> | null
  datos_despues?: Record<string, unknown> | null
  campos_cambiados?: string[] | null
  usuario_email?: string | null
  usuario_nombre?: string | null
  usuario_id?: string | null
  fecha: string
  ip_address?: string | null
  user_agent?: string | null
  sucursal_id?: number | null
}

export interface FacturaAuditoriaRow {
  id: number
  factura_id: number
  numero?: string | null
  accion: string
  motivo: string
  usuario_nombre?: string | null
  fecha: string
  datos_antes?: Record<string, unknown> | null
}

export interface RespaldoRow {
  id: number
  archivo: string
  tipo: string
  tablas: number
  registros: number
  tamano_bytes: number
  generado_por_nombre?: string | null
  nota?: string | null
  hash_sha256?: string | null
  comprimido?: boolean
  created_at: string
}

export interface ResumenAuditoria {
  totalEventos: number
  eliminacionesHoy: number
  eventosPorDia: { fecha: string; total: number }[]
  topUsuarios: { nombre: string; total: number }[]
  topTablas: { tabla: string; total: number }[]
  ultimoRespaldoAuto: RespaldoRow | null
  horasSinRespaldoAuto: number | null
  respaldoSaludable: boolean
}

export const TABLA_LABELS: Record<string, string> = {
  pacientes: 'Pacientes',
  facturas: 'Facturas',
  devoluciones: 'Devoluciones',
  autorizaciones: 'Autorizaciones',
  consultas: 'Consultas',
  consulta_detalle: 'Detalle consulta',
  productos: 'Productos',
  inventario: 'Inventario',
  inventario_movimientos: 'Kardex',
  inventario_conteos: 'Conteos físicos',
  inventario_transferencias: 'Transferencias',
  caja_movimientos: 'Movimientos caja',
  caja_sesiones: 'Sesiones caja',
  cotizaciones: 'Cotizaciones',
  membresias: 'Membresías',
  compras: 'Compras',
  cxc: 'Cuentas por cobrar',
  cxp: 'Cuentas por pagar',
  perfiles: 'Usuarios',
  roles: 'Roles',
  rol_permisos: 'Permisos',
  planilla_periodos: 'Planilla períodos',
  planilla_liquidaciones: 'Planilla liquidaciones',
  finanzas_movimientos: 'Finanzas personales',
  finanzas_tarjetas: 'Tarjetas crédito',
  promociones: 'Promociones',
  promocion_campanas: 'Campañas',
  laboratorio_ordenes: 'Órdenes laboratorio',
  citas: 'Citas',
  proveedores: 'Proveedores',
  servicios: 'Servicios',
  medicos: 'Médicos',
}

/** Tablas cuya eliminación se considera crítica */
export const TABLAS_CRITICAS = new Set([
  'facturas', 'perfiles', 'roles', 'pacientes', 'inventario',
  'caja_movimientos', 'finanzas_movimientos', 'planilla_liquidaciones',
])

export function labelTabla(tabla: string): string {
  return TABLA_LABELS[tabla] ?? tabla.replace(/_/g, ' ')
}

export function esCritico(b: Pick<BitacoraRow, 'tabla' | 'operacion'>): boolean {
  return b.operacion === 'DELETE' && TABLAS_CRITICAS.has(b.tabla)
}

export function linkRegistro(tabla: string, registroId?: string | null): string | null {
  if (!registroId) return null
  const id = registroId
  switch (tabla) {
    case 'pacientes': return `/pacientes/${id}`
    case 'facturas': return `/facturacion`
    case 'consultas': return `/consultas`
    case 'perfiles': return `/usuarios`
    case 'productos': return `/productos`
    case 'cotizaciones': return `/cotizaciones`
    case 'membresias': return `/membresias`
    case 'citas': return `/agenda`
    default: return null
  }
}

export const OP_LABEL: Record<string, string> = {
  INSERT: 'Creó',
  UPDATE: 'Modificó',
  DELETE: 'Eliminó',
}

export function fmtFechaAud(iso: string): string {
  return new Date(iso).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' })
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export function valorAud(v: unknown): string {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

export function bitacoraACsv(rows: BitacoraRow[]): string {
  const header = ['id', 'fecha', 'usuario', 'email', 'operacion', 'tabla', 'registro_id', 'campos_cambiados', 'sucursal_id']
  const lines = rows.map(r => [
    r.id,
    r.fecha,
    r.usuario_nombre ?? '',
    r.usuario_email ?? '',
    r.operacion,
    r.tabla,
    r.registro_id ?? '',
    (r.campos_cambiados ?? []).join('; '),
    r.sucursal_id ?? '',
  ].map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
  return [header.join(','), ...lines].join('\n')
}

export function calcularSaludRespaldo(ultimo: RespaldoRow | null): {
  saludable: boolean
  horas: number | null
  mensaje: string
} {
  if (!ultimo) {
    return { saludable: false, horas: null, mensaje: 'No hay respaldos automáticos registrados' }
  }
  const horas = (Date.now() - new Date(ultimo.created_at).getTime()) / 3_600_000
  const saludable = horas <= 26
  return {
    saludable,
    horas: Math.round(horas),
    mensaje: saludable
      ? `Último respaldo automático hace ${Math.round(horas)} h`
      : `⚠ Sin respaldo automático en ${Math.round(horas)} h (revisar cron)`,
  }
}
