import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number | string, symbol = 'L. '): string {
  const num = typeof value === 'string' ? parseFloat(value) || 0 : value
  return `${symbol}${num.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('es-HN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('')
}
