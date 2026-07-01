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
