import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'

interface AppFooterProps {
  /** fixed = pie fijo como el sistema viejo (login); inline = al final del contenido */
  variant?: 'fixed' | 'inline'
  className?: string
}

export default function AppFooter({ variant = 'inline', className }: AppFooterProps) {
  const year = new Date().getFullYear()

  return (
    <footer
      className={cn(
        'text-center text-white/90 border-t-2',
        variant === 'fixed'
          ? 'fixed bottom-0 left-0 right-0 z-50 py-2.5 px-4 text-[13px]'
          : 'py-2.5 px-4 text-xs shrink-0',
        className,
      )}
      style={{
        background: `linear-gradient(to right, ${BRAND.footerFrom}, ${BRAND.footerTo})`,
        borderTopColor: BRAND.gold,
      }}
    >
      <p className="m-0">
        <strong className="text-[#e8c547]">{BRAND.nombre}</strong>
        <span className="text-white/75"> © {year}. {BRAND.derechosReservados}</span>
      </p>
    </footer>
  )
}
