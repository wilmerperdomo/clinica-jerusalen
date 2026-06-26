/** Normaliza texto para búsqueda sin acentos */
export function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
}

export function contieneTexto(haystack: string, needle: string): boolean {
  const h = normalizarTexto(haystack)
  const n = normalizarTexto(needle)
  if (!n) return false
  return h.includes(n)
}

export function tokensAlergia(texto?: string | null): string[] {
  if (!texto?.trim()) return []
  return texto
    .split(/[,;|\n]+/)
    .map(s => normalizarTexto(s))
    .filter(s => s.length >= 3)
}
