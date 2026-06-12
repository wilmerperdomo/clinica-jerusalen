import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ToastProvider } from '@/components/toast'
import { ConfirmProvider } from '@/components/confirm-dialog'

export const metadata: Metadata = {
  title: {
    template: '%s | Clínica Jerusalén',
    default: 'Clínica Jerusalén — Sistema de Gestión Médica',
  },
  description: 'Sistema de gestión médica para Clínica Médica Jerusalén',
  applicationName: 'Clínica Médica Jerusalén',
  icons: {
    icon: [{ url: '/brand/ticket.png', type: 'image/png' }],
    apple: '/brand/ticket.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#003366',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body>
        <ToastProvider>
          <ConfirmProvider>
            {children}
          </ConfirmProvider>
        </ToastProvider>
      </body>
    </html>
  )
}
