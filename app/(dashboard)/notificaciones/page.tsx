import { getAlertas } from '@/lib/get-alertas'
import NotificacionesClient from './notificaciones-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Notificaciones' }

export default async function NotificacionesPage() {
  const alertas = await getAlertas()
  return <NotificacionesClient alertasIniciales={alertas} />
}
