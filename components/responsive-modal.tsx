'use client'

import { useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { BRAND } from '@/lib/brand'

type ModalSize = 'md' | 'lg' | 'xl' | 'full'

interface Props {
  title: string
  subtitle?: string
  onClose: () => void
  children: React.ReactNode
  /** Barra fija inferior — ideal para botones de acción en móvil */
  footer?: React.ReactNode
  size?: ModalSize
}

const SIZE_CLASS: Record<ModalSize, string> = {
  md:   'sm:max-w-lg',
  lg:   'sm:max-w-2xl',
  xl:   'sm:max-w-4xl',
  full: 'sm:max-w-[min(96vw,1440px)]',
}

const HEIGHT_CLASS: Record<ModalSize, string> = {
  md:   'max-h-[min(92dvh,100%)] sm:max-h-[min(88vh,900px)]',
  lg:   'max-h-[min(92dvh,100%)] sm:max-h-[min(88vh,900px)]',
  xl:   'max-h-[min(92dvh,100%)] sm:max-h-[min(90vh,960px)]',
  full: 'h-[96dvh] sm:h-auto max-h-[96dvh] sm:max-h-[min(94vh,100%)]',
}

export default function ResponsiveModal({
  title, subtitle, onClose, children, footer, size = 'md',
}: Props) {
  const isFull = size === 'full'

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onKeyDown])

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center
        ${isFull ? 'p-0 sm:p-3 md:p-4' : 'p-0 sm:p-4 md:p-6'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="responsive-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] cursor-default"
        onClick={onClose}
        aria-label="Cerrar ventana"
      />

      <div
        className={`relative bg-white w-full ${SIZE_CLASS[size]} shadow-2xl flex flex-col min-h-0 animate-fade-in
          ${HEIGHT_CLASS[size]}
          ${isFull ? 'rounded-t-2xl sm:rounded-2xl' : 'rounded-t-2xl sm:rounded-2xl'}
          pb-[env(safe-area-inset-bottom,0px)]`}
      >
        {/* Asa inferior — patrón móvil */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-0 flex-shrink-0" aria-hidden>
          <div className="w-9 h-1 rounded-full bg-slate-300" />
        </div>

        <header
          className="flex items-center gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex-shrink-0"
          style={{ background: `linear-gradient(90deg, ${BRAND.navy}0c, transparent)` }}
        >
          <div className="min-w-0 flex-1">
            <h2 id="responsive-modal-title" className="font-bold text-slate-900 text-base sm:text-lg leading-tight truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 sm:line-clamp-1">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex-shrink-0 p-2.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        <div className={`overflow-y-auto overflow-x-hidden flex-1 min-h-0 overscroll-contain [-webkit-overflow-scrolling:touch]
          ${isFull ? 'px-4 sm:px-6 lg:px-8 py-4 sm:py-5' : 'px-4 sm:px-5 py-4'}`}>
          {children}
        </div>

        {footer && (
          <footer className="flex-shrink-0 border-t border-slate-100 bg-white/95 backdrop-blur-sm px-4 sm:px-5 py-3 sm:py-4">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
