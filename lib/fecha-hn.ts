/**
 * Utilidades de fecha en hora local de Honduras (America/Tegucigalpa, UTC-6).
 *
 * IMPORTANTE: no usar `new Date().toISOString().split('T')[0]` para obtener
 * "hoy", porque devuelve la fecha en UTC. Después de las 6:00 PM hora local
 * la fecha UTC ya pertenece al día siguiente, lo que provoca, por ejemplo,
 * que una sesión de caja abierta "desaparezca" al recargar (parece cerrada).
 */

const ZONA_HN = 'America/Tegucigalpa'

/** Fecha de hoy en Honduras como `YYYY-MM-DD`. */
export function fechaHoyHN(): string {
  // 'en-CA' produce el formato YYYY-MM-DD.
  return new Date().toLocaleDateString('en-CA', { timeZone: ZONA_HN })
}

/** Fecha de Honduras (YYYY-MM-DD) para un `Date` dado. */
export function fechaHN(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: ZONA_HN })
}

/** Suma días a una fecha base (YYYY-MM-DD) y devuelve fecha HN. */
export function fechaSumarDias(dias: number, base?: string): string {
  const ref = base ?? fechaHoyHN()
  const d = new Date(`${ref}T12:00:00`)
  d.setDate(d.getDate() + dias)
  return fechaHN(d)
}

const DIAS_SEMANA_HN: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

/** Hora local Honduras — para horarios de atención del bot. */
export function horaLocalHN(ahora = new Date()): {
  diaSemana: number
  minutosDesdeMedianoche: number
} {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HN,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(ahora)

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0'
  const diaSemana = DIAS_SEMANA_HN[get('weekday')] ?? 0
  const hora = Number(get('hour'))
  const minuto = Number(get('minute'))
  return { diaSemana, minutosDesdeMedianoche: hora * 60 + minuto }
}
