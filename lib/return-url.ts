/** Rutas internas seguras para redirigir tras login (evita open redirect). */
export function rutaRetornoSegura(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const path = decodeURIComponent(raw.trim())
    if (!path.startsWith('/') || path.startsWith('//')) return null
    if (path.startsWith('/login')) return null
    return path
  } catch {
    return null
  }
}

export function etiquetaRutaRetorno(path: string): string {
  if (path.startsWith('/ventas')) return 'Caja / Ventas'
  if (path.startsWith('/consultas')) return 'Consultas'
  if (path.startsWith('/laboratorio')) return 'Laboratorio'
  if (path.startsWith('/pacientes')) return 'Pacientes'
  const seg = path.split('/').filter(Boolean)[0]
  return seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : 'el sistema'
}

export const AUTH_RETURN_TO_KEY = 'auth_return_to'

export function guardarRutaRetorno(path: string) {
  try {
    sessionStorage.setItem(AUTH_RETURN_TO_KEY, path)
  } catch { /* privado / sin storage */ }
}

export function leerRutaRetornoGuardada(): string | null {
  try {
    return rutaRetornoSegura(sessionStorage.getItem(AUTH_RETURN_TO_KEY))
  } catch {
    return null
  }
}

export function limpiarRutaRetornoGuardada() {
  try {
    sessionStorage.removeItem(AUTH_RETURN_TO_KEY)
  } catch { /* silencioso */ }
}
