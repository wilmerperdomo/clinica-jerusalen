export type CajaCobroTab = 'cobrar' | 'lab_cobrar' | 'membresias_cobrar' | 'cot_cobrar' | 'cxc'

export interface CajaCobroPendiente {
  tipo: 'consulta' | 'lab' | 'membresia' | 'cotizacion' | 'cxc'
  id: number | string
  tab: CajaCobroTab
  label?: string
  savedAt: number
}

const KEY = 'caja_cobro_pendiente'
const MAX_EDAD_MS = 24 * 60 * 60 * 1000 // 24 h

export function guardarCobroPendiente(p: Omit<CajaCobroPendiente, 'savedAt'>) {
  try {
    const payload: CajaCobroPendiente = { ...p, savedAt: Date.now() }
    sessionStorage.setItem(KEY, JSON.stringify(payload))
  } catch { /* silencioso */ }
}

export function leerCobroPendiente(): CajaCobroPendiente | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as CajaCobroPendiente
    if (!p?.tipo || p.id == null || !p.savedAt) return null
    if (Date.now() - p.savedAt > MAX_EDAD_MS) {
      sessionStorage.removeItem(KEY)
      return null
    }
    return p
  } catch {
    return null
  }
}

export function limpiarCobroPendiente() {
  try {
    sessionStorage.removeItem(KEY)
  } catch { /* silencioso */ }
}
