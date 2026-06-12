import { BRAND } from '@/lib/brand'
import { LOGO_TICKET_CLASS, logoTicketPx } from '@/lib/brand-logo'
import type { LogoTicketSize } from '@/lib/brand-logo'
import { cn } from '@/lib/utils'

type Variant = 'full' | 'compact' | 'icon' | 'stacked'

interface ClinicaLogoProps {
  variant?: Variant
  className?: string
  dark?: boolean
}

/** Igual que factura.php: <img src="ticket.png" width="150px"> — solo ancho, sin height forzado */
function LogoTicketImg({
  size,
  className,
}: {
  size: LogoTicketSize
  className?: string
}) {
  const px = logoTicketPx(size)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={BRAND.logoTicket}
      alt={BRAND.nombre}
      width={px}
      className={cn(LOGO_TICKET_CLASS, 'block shrink-0', className)}
      style={{ width: px, height: 'auto' }}
    />
  )
}

function LogoNombre({
  dark,
  compact = false,
}: {
  dark?: boolean
  compact?: boolean
}) {
  if (compact) {
    return (
      <div className="min-w-0 leading-tight">
        <p className={cn(
          'text-[8px] font-bold tracking-wider uppercase truncate',
          dark ? 'text-white/80' : 'text-[#005580]',
        )}>
          Clínica Médica
        </p>
        <p className={cn(
          'text-sm font-bold truncate',
          dark ? 'text-[#f0d060]' : 'text-[#003366]',
        )}>
          Jerusalén
        </p>
      </div>
    )
  }

  return (
    <div className="text-center leading-tight max-w-full">
      <p className={cn(
        'text-[10px] font-bold tracking-[0.2em] uppercase',
        dark ? 'text-white/85' : 'text-[#005580]',
      )}>
        Clínica Médica
      </p>
      <p className={cn(
        'text-2xl font-bold leading-none mt-0.5',
        dark ? 'text-[#f0d060]' : 'text-[#003366]',
      )}>
        Jerusalén
      </p>
    </div>
  )
}

function LogoTagline({ dark }: { dark?: boolean }) {
  return (
    <p className={cn(
      'text-center text-[9px] font-medium uppercase tracking-[0.16em]',
      dark ? 'text-[#e8c547]/90' : 'text-[#c9a227]',
    )}>
      {BRAND.tagline}
    </p>
  )
}

export default function ClinicaLogo({ variant = 'full', className, dark = false }: ClinicaLogoProps) {
  if (variant === 'icon') {
    return (
      <div className={cn('shrink-0', className)} aria-label={BRAND.nombre}>
        <LogoTicketImg size="icon" />
      </div>
    )
  }

  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center gap-2 min-w-0', className)} aria-label={BRAND.nombre}>
        <LogoTicketImg size="sidebar" />
        <LogoNombre dark={dark} compact />
      </div>
    )
  }

  if (variant === 'stacked') {
    return (
      <div className={cn('flex flex-col items-center gap-2', className)} aria-label={BRAND.nombre}>
        <LogoTicketImg size="mobile" />
        <LogoNombre dark={dark} />
      </div>
    )
  }

  return (
    <div className={cn('w-full flex flex-col items-center', className)} aria-label={BRAND.nombre}>
      <div className={cn(
        'w-full flex flex-col items-center gap-3 pb-5',
        dark ? 'border-b border-[#c9a227]/35' : 'border-b border-[#c9a227]/25',
      )}>
        <LogoTicketImg size="full" />
        <LogoNombre dark={dark} />
        <LogoTagline dark={dark} />
      </div>
    </div>
  )
}
