/** Prefijo Dr. / Dra. según género del perfil (M = Dr., F = Dra.) */
export function prefijoMedico(genero?: string | null): 'Dr.' | 'Dra.' {
  if (genero === 'F') return 'Dra.'
  return 'Dr.'
}

/** Nombre del médico con prefijo: Dr. Juan Pérez / Dra. María López */
export function formatearNombreMedico(
  nombre?: string | null,
  apellido?: string | null,
  genero?: string | null,
): string {
  const full = `${nombre ?? ''} ${apellido ?? ''}`.trim()
  if (!full) return ''
  const yaTienePrefijo = /^(dr\.?|dra\.?)\s/i.test(full)
  if (yaTienePrefijo) return full
  return `${prefijoMedico(genero)} ${full}`
}

/**
 * Línea "Atendido por" — cajero/enfermero y médico cuando aplica consulta.
 * Ej: "María López y Dr. Carlos Pérez"
 */
export function lineaAtendidoPor(
  cajero?: string | null,
  medico?: string | null,
): string {
  const partes: string[] = []
  const c = cajero?.trim()
  const m = medico?.trim()
  if (c) partes.push(c)
  if (m) partes.push(m)
  return partes.join(' y ')
}
