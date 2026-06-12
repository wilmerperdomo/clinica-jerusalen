'use client'

import type { LucideIcon } from 'lucide-react'
import { X } from 'lucide-react'

import { BRAND } from '@/lib/brand'

export type CajaModalSize = 'sm' | 'md' | 'wide' | 'xl' | 'full'
export type CajaModalAccent = 'default' | 'green' | 'cyan' | 'indigo'

const MODAL_MAX_W: Record<CajaModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  wide: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  full: 'sm:max-w-5xl lg:max-w-6xl xl:max-w-[min(96vw,72rem)]',
}

const MODAL_ACCENT_BG: Record<Exclude<CajaModalAccent, 'default'>, string> = {
  green: `linear-gradient(135deg, ${BRAND.navy} 0%, #0d4a3a 100%)`,
  cyan: `linear-gradient(135deg, ${BRAND.navy} 0%, #0c4a6e 100%)`,
  indigo: `linear-gradient(135deg, ${BRAND.navy} 0%, #3730a3 100%)`,
}

interface CajaModalProps {
  title: string
  subtitle?: string
  children: React.ReactNode
  onClose: () => void
  wide?: boolean
  size?: CajaModalSize
  accent?: CajaModalAccent
  icon?: LucideIcon
  footer?: React.ReactNode
}

export function CajaModal({
  title, subtitle, children, onClose, wide = false, size, accent = 'default',
  icon: Icon, footer,
}: CajaModalProps) {
  const resolvedSize = size ?? (wide ? 'wide' : 'md')
  const hasAccent = accent !== 'default'

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-3 md:p-4 bg-black/55 backdrop-blur-[2px]"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className={`bg-white w-full ${MODAL_MAX_W[resolvedSize]} rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[96dvh] sm:max-h-[94vh]`}
        role="dialog"
        aria-modal="true"
      >
        <div className="sm:hidden flex justify-center pt-2.5 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {hasAccent ? (
          <div
            className="flex items-center justify-between px-4 sm:px-6 py-4 flex-shrink-0 text-white rounded-t-2xl sm:rounded-t-2xl"
            style={{ background: MODAL_ACCENT_BG[accent] }}
          >
            <div className="flex items-center gap-3 min-w-0">
              {Icon && (
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5" style={{ color: BRAND.goldLight }} />
                </div>
              )}
              <div className="min-w-0">
                <h3 className="font-bold text-base sm:text-lg truncate">{title}</h3>
                {subtitle && <p className="text-xs sm:text-sm text-white/70 truncate mt-0.5">{subtitle}</p>}
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Cerrar"
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-white/70 hover:text-white hover:bg-white/10 flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b flex-shrink-0 bg-white">
            <div className="min-w-0 pr-2">
              <h3 className="font-semibold text-gray-900 truncate">{title}</h3>
              {subtitle && <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Cerrar"
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1 min-h-0 overscroll-contain scroll-touch">
          {children}
        </div>

        {footer && (
          <div className="flex-shrink-0 border-t border-gray-100 bg-gray-50/90 px-4 sm:px-6 py-3 sm:py-4 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** Alias para compatibilidad con el resto de caja-client */
export const Modal = CajaModal
