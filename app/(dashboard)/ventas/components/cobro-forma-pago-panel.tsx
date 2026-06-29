'use client'

import { FORMAS_PAGO } from '@/lib/caja-constants'
import { BANCOS_HONDURAS } from '@/lib/caja-bancos'
import { calcularCambioEfectivo } from '@/lib/caja-pago-utils'

const ACCENT_STYLES = {
  green:  'border-green-500 bg-green-50 text-green-700 ring-1 ring-green-200',
  cyan:   'border-cyan-500 bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200',
  blue:   'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  violet: 'border-violet-500 bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  amber:  'border-amber-500 bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  orange: 'border-orange-500 bg-orange-50 text-orange-700 ring-1 ring-orange-200',
} as const

export type CobroFormaPagoAccent = keyof typeof ACCENT_STYLES

export interface CobroFormaPagoPanelProps {
  formaPago: string
  onChange: (fp: string) => void
  referencia: string
  onReferencia: (v: string) => void
  banco?: string
  onBanco?: (v: string) => void
  montoEfectivo?: string
  onMontoEfectivo?: (v: string) => void
  totalACobrar: number
  accent?: CobroFormaPagoAccent
  /** Ocultar opción a crédito (abonos, membresía, etc.) */
  sinCredito?: boolean
  /** Layout compacto para modales pequeños */
  compacto?: boolean
}

export default function CobroFormaPagoPanel({
  formaPago,
  onChange,
  referencia,
  onReferencia,
  banco = '',
  onBanco,
  montoEfectivo = '',
  onMontoEfectivo,
  totalACobrar,
  accent = 'green',
  sinCredito = false,
  compacto = false,
}: CobroFormaPagoPanelProps) {
  const active = ACCENT_STYLES[accent]
  const formas = sinCredito ? FORMAS_PAGO.filter(f => f.key !== 'CREDITO') : FORMAS_PAGO
  const cambio = calcularCambioEfectivo(totalACobrar, montoEfectivo)
  const falta = (() => {
    if (formaPago !== 'EFECTIVO' || totalACobrar <= 0 || !montoEfectivo.trim()) return null
    const recibido = Number(montoEfectivo)
    if (Number.isNaN(recibido) || recibido >= totalACobrar) return null
    return parseFloat((totalACobrar - recibido).toFixed(2))
  })()

  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-gray-800">Forma de pago</label>
      <div className={`grid gap-2 ${compacto ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {formas.map(fp => (
          <button
            key={fp.key}
            type="button"
            onClick={() => onChange(fp.key)}
            className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 px-3 py-3 rounded-xl border text-sm font-medium transition min-h-[52px] ${
              formaPago === fp.key ? active : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <fp.icon className="w-4 h-4 flex-shrink-0" />
            <span className="text-xs sm:text-sm">{fp.label}</span>
          </button>
        ))}
      </div>

      {formaPago === 'EFECTIVO' && totalACobrar > 0 && onMontoEfectivo && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
          <label className="block text-sm font-medium text-emerald-900">
            ¿Con cuánto paga el cliente?
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">L</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={montoEfectivo}
              onChange={e => onMontoEfectivo(e.target.value)}
              placeholder={totalACobrar.toFixed(2)}
              className="w-full border border-emerald-200 rounded-xl pl-8 pr-3 py-2.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
            />
          </div>
          {cambio != null && cambio > 0 && (
            <p className="text-sm font-bold text-emerald-800 flex items-center justify-between">
              <span>Cambio a entregar</span>
              <span className="text-lg tabular-nums">L {cambio.toFixed(2)}</span>
            </p>
          )}
          {cambio === 0 && montoEfectivo.trim() && Number(montoEfectivo) >= totalACobrar && (
            <p className="text-xs text-emerald-700">Pago exacto — sin cambio</p>
          )}
          {falta != null && (
            <p className="text-xs text-red-700 font-medium">Falta L {falta.toFixed(2)}</p>
          )}
        </div>
      )}

      {formaPago === 'TARJETA' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Número de voucher *</label>
          <input
            value={referencia}
            onChange={e => onReferencia(e.target.value)}
            placeholder="Últimos dígitos o código del voucher"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
      )}

      {formaPago === 'TRANSFERENCIA' && (
        <div className="space-y-2">
          {onBanco && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Banco destino *</label>
              <select
                value={banco}
                onChange={e => onBanco(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="">Seleccione banco…</option>
                {BANCOS_HONDURAS.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Referencia / comprobante *</label>
            <input
              value={referencia}
              onChange={e => onReferencia(e.target.value)}
              placeholder="Número de referencia o comprobante"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
        </div>
      )}
    </div>
  )
}
