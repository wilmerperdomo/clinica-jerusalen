import { cn } from '@/lib/utils'

interface LogoFamiliaSvgProps {
  variant?: 'color' | 'light'
  className?: string
}

/** Logo familia — inline SVG (no depende de archivos externos) */
export default function LogoFamiliaSvg({ variant = 'color', className }: LogoFamiliaSvgProps) {
  const light = variant === 'light'

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 340 150"
      width="340"
      height="150"
      role="img"
      aria-label="Clinicas Medicas Jerusalen"
      className={cn('block', className)}
    >
      <defs>
        <linearGradient id="lf-adult" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={light ? '#ffffff' : '#003366'} />
          <stop offset="100%" stopColor={light ? '#b8d4f0' : '#005580'} />
        </linearGradient>
        <linearGradient id="lf-parent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={light ? '#7ec8f0' : '#1a6faa'} />
          <stop offset="100%" stopColor={light ? '#ffffff' : '#3d9fd4'} />
        </linearGradient>
        <linearGradient id="lf-child" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={light ? '#e8c547' : '#a8841a'} />
          <stop offset="100%" stopColor={light ? '#fff3b0' : '#e8c547'} />
        </linearGradient>
        <linearGradient id="lf-gold" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#a8841a" />
          <stop offset="50%" stopColor="#e8c547" />
          <stop offset="100%" stopColor="#c9a227" />
        </linearGradient>
      </defs>

      <path
        d="M55 78 Q170 92 285 78"
        fill="none"
        stroke="url(#lf-gold)"
        strokeWidth="1.5"
        opacity="0.7"
      />

      <g transform="translate(130, 4) scale(1.15)">
        <circle cx="20" cy="16" r="9" fill="url(#lf-adult)" />
        <path d="M20 25 C9 30 5 46 16 56 C26 64 42 59 44 44 C46 32 31 27 20 25 Z" fill="url(#lf-adult)" />
        <circle cx="40" cy="22" r="7" fill="url(#lf-parent)" />
        <path d="M40 29 C33 33 30 44 36 52 C42 58 52 55 53 45 C54 37 47 31 40 29 Z" fill="url(#lf-parent)" />
        <circle cx="56" cy="28" r="5.5" fill="url(#lf-child)" />
        <path d="M56 33.5 C51 36.5 49 43 53.5 48.5 C58 52.5 65 49.5 65 43 C65 38 60 35 56 33.5 Z" fill="url(#lf-child)" />
      </g>

      <circle cx="170" cy="82" r="3" fill="#c9a227" />
      <line x1="100" y1="82" x2="158" y2="82" stroke="url(#lf-gold)" strokeWidth="1.2" />
      <line x1="182" y1="82" x2="240" y2="82" stroke="url(#lf-gold)" strokeWidth="1.2" />

      <text
        x="170"
        y="118"
        textAnchor="middle"
        fill={light ? 'url(#lf-gold)' : '#003366'}
        fontFamily="'Segoe Script','Brush Script MT',cursive"
        fontSize="26"
      >
        Clinicas Medicas Jerusalen
      </text>
      <text
        x="170"
        y="140"
        textAnchor="middle"
        fill={light ? 'rgba(255,255,255,0.75)' : 'url(#lf-gold)'}
        fontFamily="Arial,Helvetica,sans-serif"
        fontSize="9"
        letterSpacing="3"
        fontWeight="600"
      >
        ATENCION MEDICA INTEGRAL
      </text>
    </svg>
  )
}

/** Solo icono familia */
export function LogoIconSvg({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 80 64"
      width="80"
      height="64"
      role="img"
      aria-label="Clinicas Medicas Jerusalen"
      className={cn('block', className)}
    >
      <defs>
        <linearGradient id="li-adult" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#003366" />
          <stop offset="100%" stopColor="#005580" />
        </linearGradient>
        <linearGradient id="li-parent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1a6faa" />
          <stop offset="100%" stopColor="#3d9fd4" />
        </linearGradient>
        <linearGradient id="li-child" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a8841a" />
          <stop offset="100%" stopColor="#e8c547" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="16" r="9" fill="url(#li-adult)" />
      <path d="M20 25 C9 30 5 46 16 56 C26 64 42 59 44 44 C46 32 31 27 20 25 Z" fill="url(#li-adult)" />
      <circle cx="40" cy="22" r="7" fill="url(#li-parent)" />
      <path d="M40 29 C33 33 30 44 36 52 C42 58 52 55 53 45 C54 37 47 31 40 29 Z" fill="url(#li-parent)" />
      <circle cx="56" cy="28" r="5.5" fill="url(#li-child)" />
      <path d="M56 33.5 C51 36.5 49 43 53.5 48.5 C58 52.5 65 49.5 65 43 C65 38 60 35 56 33.5 Z" fill="url(#li-child)" />
    </svg>
  )
}
