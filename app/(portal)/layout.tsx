import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { template: '%s | Portal del Paciente', default: 'Portal del Paciente' },
  robots: { index: false, follow: false },
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-cyan-50/40">
      {children}
    </div>
  )
}
