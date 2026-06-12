import { imprimirReporte } from '@/lib/reporte-utils'
import { BRAND } from '@/lib/brand'

export interface CitaPrint {
  fecha: string
  hora: string
  estado: string
  nota?: string | null
  servicio_nombre?: string | null
  servicio?: { nombre: string; tipo?: string; precio?: number } | null
  paciente?: { nombre: string; apellido1: string; celular?: string; codigo?: string } | null
}

export function addDays(fecha: string, n: number) {
  const d = new Date(fecha + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export function lunesDe(fecha: string) {
  const d = new Date(fecha + 'T12:00:00')
  const dia = d.getDay() === 0 ? 6 : d.getDay() - 1
  d.setDate(d.getDate() - dia)
  return d.toISOString().split('T')[0]
}

export function fmtFecha(fecha: string) {
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y}`
}

export function fmtFechaLarga(fecha: string) {
  const d = new Date(fecha + 'T12:00:00')
  return d.toLocaleDateString('es-HN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function fmtPrecio(n: number) {
  return `L ${n.toLocaleString('es-HN', { minimumFractionDigits: 2 })}`
}

export function horaAMinutos(hora: string) {
  const [h, m] = hora.slice(0, 5).split(':').map(Number)
  return h * 60 + (m || 0)
}

export function minutosHastaCita(fecha: string, hora: string, ahora = new Date()) {
  const [h, m] = hora.slice(0, 5).split(':').map(Number)
  const target = new Date(fecha + 'T12:00:00')
  target.setHours(h, m, 0, 0)
  return Math.round((target.getTime() - ahora.getTime()) / 60000)
}

export function formatearCountdown(minutos: number) {
  if (minutos < 0) return 'en curso'
  if (minutos === 0) return 'ahora'
  if (minutos < 60) return `en ${minutos} min`
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return m > 0 ? `en ${h}h ${m}min` : `en ${h}h`
}

/** Días del mes para mini-calendario (null = celda vacía) */
export function celdasMes(anio: number, mes: number): (number | null)[] {
  const primero = new Date(anio, mes, 1)
  const ultimo  = new Date(anio, mes + 1, 0)
  const offset  = primero.getDay() === 0 ? 6 : primero.getDay() - 1
  const celdas: (number | null)[] = Array(offset).fill(null)
  for (let d = 1; d <= ultimo.getDate(); d++) celdas.push(d)
  while (celdas.length % 7 !== 0) celdas.push(null)
  return celdas
}

export function fechaDesdeCelda(anio: number, mes: number, dia: number) {
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

export function hayConflicto(
  citas: { id: number; fecha: string; hora: string; estado: string }[],
  fecha: string,
  hora: string,
  excluirId?: number,
) {
  const h = hora.slice(0, 5)
  return citas.some(c =>
    c.id !== excluirId &&
    c.fecha === fecha &&
    c.hora.slice(0, 5) === h &&
    c.estado === 'ACTIVO'
  )
}

export function limpiarCelular(cel?: string) {
  if (!cel) return ''
  const digits = cel.replace(/\D/g, '')
  if (digits.startsWith('504')) return digits
  if (digits.length === 8) return `504${digits}`
  return digits
}

export type RecordatorioEstado = 'pendiente' | 'llamado' | 'whatsapp' | 'confirmado' | 'no_contacto'

export const RECORDATORIO_CFG: Record<RecordatorioEstado, { label: string; badge: string; hint: string }> = {
  pendiente:    { label: 'Sin contactar',  badge: 'bg-amber-100 text-amber-800',  hint: 'Llamar o enviar WhatsApp' },
  llamado:      { label: 'Llamó recepción', badge: 'bg-sky-100 text-sky-800',      hint: 'Esperando confirmación' },
  whatsapp:     { label: 'WhatsApp enviado', badge: 'bg-emerald-100 text-emerald-800', hint: 'Mensaje enviado' },
  confirmado:   { label: 'Confirmada',     badge: 'bg-green-100 text-green-800',    hint: 'Paciente confirmó' },
  no_contacto:  { label: 'No contestó',    badge: 'bg-slate-100 text-slate-600',    hint: 'Reintentar más tarde' },
}

/** Citas que el personal debe contactar: mañana (1 día antes) o hoy en las próximas 3 h */
export function necesitaRecordatorio(
  cita: { fecha: string; hora: string; estado: string; recordatorio_estado?: string | null },
  fechaHoy: string,
  ahora = new Date(),
) {
  if (cita.estado !== 'ACTIVO') return false
  const est = (cita.recordatorio_estado ?? 'pendiente') as RecordatorioEstado
  if (est === 'confirmado') return false

  const manana = addDays(fechaHoy, 1)
  if (cita.fecha === manana) return true

  if (cita.fecha === fechaHoy) {
    const mins = minutosHastaCita(cita.fecha, cita.hora, ahora)
    return mins >= 0 && mins <= 180
  }
  return false
}

export function linkWhatsApp(cita: CitaPrint) {
  const cel = limpiarCelular(cita.paciente?.celular)
  if (!cel) return null
  const nombre = `${cita.paciente?.nombre ?? ''} ${cita.paciente?.apellido1 ?? ''}`.trim()
  const svc = cita.servicio?.nombre || cita.servicio_nombre
  const msg = [
    `Hola ${nombre},`,
    `le recordamos su cita en *${BRAND.nombre}*:`,
    `📅 ${fmtFecha(cita.fecha)} a las ${cita.hora.slice(0, 5)}`,
    svc ? `🩺 ${svc}` : '',
    '',
    'Por favor confirme su asistencia. ¡Gracias!',
  ].filter(Boolean).join('\n')
  return `https://wa.me/${cel}?text=${encodeURIComponent(msg)}`
}

const ESTADO_LABEL: Record<string, string> = {
  ACTIVO: 'Activa', 'ASISTIÓ': 'Asistió', ATENDIDO: 'Atendido',
  CANCELADO: 'Cancelada', 'NO ASISTIÓ': 'No asistió',
}

export function imprimirAgenda(opts: {
  citas: CitaPrint[]
  titulo: string
  subtitulo?: string
}) {
  const filas = opts.citas
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora))
    .map(c => `
      <tr>
        <td>${fmtFecha(c.fecha)}</td>
        <td>${c.hora.slice(0, 5)}</td>
        <td>${c.paciente?.nombre ?? ''} ${c.paciente?.apellido1 ?? ''}</td>
        <td>${c.paciente?.celular ?? '—'}</td>
        <td>${c.servicio?.nombre || c.servicio_nombre || '—'}</td>
        <td>${ESTADO_LABEL[c.estado] ?? c.estado}</td>
        <td>${c.nota ?? ''}</td>
      </tr>
    `).join('')

  imprimirReporte({
    titulo: opts.titulo,
    subtitulo: opts.subtitulo,
    orientacion: 'landscape',
    contenidoHtml: `
      <p class="sub">${opts.citas.length} citas · Generado ${new Date().toLocaleString('es-HN')}</p>
      <table>
        <thead><tr>
          <th>Fecha</th><th>Hora</th><th>Paciente</th><th>Teléfono</th>
          <th>Servicio</th><th>Estado</th><th>Nota</th>
        </tr></thead>
        <tbody>${filas || '<tr><td colspan="7">Sin citas</td></tr>'}</tbody>
      </table>
    `,
  })
}
