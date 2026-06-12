'use client'

import Link from 'next/link'
import { Sparkles, type LucideIcon } from 'lucide-react'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'

export type ModuleGradient = 'default' | 'violet' | 'emerald' | 'amber' | 'rose' | 'cyan'

const GRADIENTS: Record<ModuleGradient, string> = {
  default: `linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.navyMid} 50%, #002244 100%)`,
  violet:  `linear-gradient(135deg, ${BRAND.navy} 0%, #1a4a6e 45%, #2d1b4e 100%)`,
  emerald: `linear-gradient(135deg, ${BRAND.navy} 0%, #0d4a3a 50%, #064e3b 100%)`,
  amber:   `linear-gradient(135deg, ${BRAND.navy} 0%, #5c4a1a 50%, #78350f 100%)`,
  rose:    `linear-gradient(135deg, ${BRAND.navy} 0%, #4a1a2e 50%, #831843 100%)`,
  cyan:    `linear-gradient(135deg, ${BRAND.navy} 0%, ${BRAND.navyMid} 40%, #0c4a6e 100%)`,
}

export interface ModuleKpi {
  label: string
  value: string | number
  icon?: LucideIcon
  onClick?: () => void
}

interface ModuleShellProps {
  children: React.ReactNode
  tint?: 'sky' | 'violet' | 'emerald' | 'amber' | 'rose' | 'cyan' | 'none'
  className?: string
}

export function ModuleShell({ children, tint = 'sky', className }: ModuleShellProps) {
  const bg = tint === 'none'
    ? 'bg-slate-50'
    : {
        sky: 'bg-gradient-to-br from-slate-50 via-white to-sky-50/30',
        violet: 'bg-gradient-to-br from-slate-50 via-white to-violet-50/20',
        emerald: 'bg-gradient-to-br from-slate-50 via-white to-emerald-50/25',
        amber: 'bg-gradient-to-br from-slate-50 via-white to-amber-50/20',
        rose: 'bg-gradient-to-br from-slate-50 via-white to-rose-50/20',
        cyan: 'bg-gradient-to-br from-slate-50 via-white to-cyan-50/25',
      }[tint]

  return (
    <div className={cn('min-h-full min-w-0 w-full overflow-x-hidden', bg, className)}>
      {children}
    </div>
  )
}

interface ModuleHeroProps {
  title: string
  subtitle?: string
  badge?: string
  icon: LucideIcon
  gradient?: ModuleGradient
  backLink?: { href: string; label: string }
  actions?: React.ReactNode
  kpis?: ModuleKpi[]
  banner?: React.ReactNode
  children?: React.ReactNode
}

export function ModuleHero({
  title, subtitle, badge, icon: Icon, gradient = 'default',
  backLink, actions, kpis, banner, children,
}: ModuleHeroProps) {
  return (
    <div className="relative overflow-hidden shadow-xl" style={{ background: GRADIENTS[gradient] }}>
      <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full opacity-10 bg-white blur-3xl" />
      <div className="absolute -left-10 bottom-0 w-48 h-48 rounded-full opacity-10"
        style={{ backgroundColor: BRAND.gold }} />

      <div className="relative px-4 sm:px-6 py-6 sm:py-7">
        {backLink && (
          <Link href={backLink.href}
            className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white/80 mb-2 transition">
            {backLink.label}
          </Link>
        )}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4" style={{ color: BRAND.gold }} />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">
                {badge ?? BRAND.nombreCorto}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <Icon className="w-8 h-8 flex-shrink-0" style={{ color: BRAND.goldLight }} />
              {title}
            </h1>
            {subtitle && <p className="text-white/60 text-sm mt-1">{subtitle}</p>}
          </div>
          {actions && (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          )}
        </div>

        {banner}

        {kpis && kpis.length > 0 && (
          <div className={cn(
            'grid gap-2 sm:gap-3 mt-5',
            kpis.length <= 4 ? 'grid-cols-2 sm:grid-cols-4' :
            kpis.length <= 5 ? 'grid-cols-2 sm:grid-cols-5' :
            'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
          )}>
            {kpis.map(k => {
              const KIcon = k.icon
              const inner = (
                <>
                  {KIcon && <KIcon className="w-4 h-4 text-white/60 flex-shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-xl sm:text-2xl font-black text-white leading-none">{k.value}</p>
                    <p className="text-[10px] text-white/50 uppercase tracking-wide mt-0.5 truncate">{k.label}</p>
                  </div>
                </>
              )
              const cls = 'rounded-2xl p-3 bg-white/10 backdrop-blur border border-white/15 flex items-center gap-2 text-left w-full hover:bg-white/15 transition'
              return k.onClick ? (
                <button key={k.label} type="button" onClick={k.onClick} className={cls}>{inner}</button>
              ) : (
                <div key={k.label} className={cls}>{inner}</div>
              )
            })}
          </div>
        )}

        {children}
      </div>
    </div>
  )
}

interface ModuleContentProps {
  children: React.ReactNode
  maxWidth?: 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '5xl' | 'full' | '1600'
  className?: string
}

const MAX_W: Record<NonNullable<ModuleContentProps['maxWidth']>, string> = {
  md: 'max-w-3xl', lg: 'max-w-4xl', xl: 'max-w-5xl', '2xl': 'max-w-6xl',
  '3xl': 'max-w-7xl', '5xl': 'max-w-5xl', full: 'max-w-full', '1600': 'max-w-[1600px]',
}

export function ModuleContent({ children, maxWidth = '1600', className }: ModuleContentProps) {
  return (
    <div className={cn('p-4 sm:p-6 space-y-4 mx-auto w-full', MAX_W[maxWidth], className)}>
      {children}
    </div>
  )
}

/** Botón primario dorado (CTA principal) */
export function ModuleBtnPrimary({
  children, onClick, className, disabled, type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={cn(
        'flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg',
        'hover:shadow-xl hover:scale-[1.02] transition disabled:opacity-50 disabled:hover:scale-100',
        className,
      )}
      style={{ backgroundColor: BRAND.gold, color: BRAND.navy }}>
      {children}
    </button>
  )
}

/** Botón secundario glass en hero */
export function ModuleBtnGhost({
  children, onClick, className, disabled, type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={cn(
        'px-3 py-2 rounded-xl text-sm text-white/90 bg-white/10 hover:bg-white/20',
        'border border-white/20 flex items-center gap-1.5 backdrop-blur transition disabled:opacity-50',
        className,
      )}>
      {children}
    </button>
  )
}

/** Cabecera de modal institucional */
export function ModuleModalHeader({
  title, icon: Icon, onClose,
}: {
  title: string
  icon?: LucideIcon
  onClose: () => void
}) {
  return (
    <div className="flex items-center justify-between px-5 py-4 text-white rounded-t-2xl flex-shrink-0"
      style={{ background: `linear-gradient(135deg, ${BRAND.navy}, ${BRAND.navyMid})` }}>
      <h3 className="font-bold flex items-center gap-2 truncate pr-2">
        {Icon && <Icon className="w-5 h-5 flex-shrink-0" style={{ color: BRAND.goldLight }} />}
        {title}
      </h3>
      <button type="button" onClick={onClose} className="text-white/70 hover:text-white p-1 flex-shrink-0">
        <span className="sr-only">Cerrar</span>
        ✕
      </button>
    </div>
  )
}

/** Pestañas con estilo navy */
export function ModuleTabs<T extends string>({
  tabs, active, onChange,
}: {
  tabs: { id: T; label: string; icon?: LucideIcon }[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div className="flex gap-1 bg-white border rounded-xl p-1 overflow-x-auto shadow-sm">
      {tabs.map(t => (
        <button key={t.id} type="button" onClick={() => onChange(t.id)}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition',
            active === t.id ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50',
          )}
          style={active === t.id ? { backgroundColor: BRAND.navy } : undefined}>
          {t.icon && <t.icon className="w-4 h-4" />}
          {t.label}
        </button>
      ))}
    </div>
  )
}

export { BRAND }
