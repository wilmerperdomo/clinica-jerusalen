/** Formato monetario estándar del módulo caja */
export function fmtCaja(n: number): string {
  return `L. ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
