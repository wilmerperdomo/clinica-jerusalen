import { notFound } from 'next/navigation'
import AgentesPruebaClient from './prueba-client'

/** Página de prueba — desactivada en producción salvo AGENTES_PRUEBA_ENABLED=true */
export default function AgentesPruebaPage() {
  if (
    process.env.NODE_ENV === 'production'
    && process.env.AGENTES_PRUEBA_ENABLED !== 'true'
  ) {
    notFound()
  }

  return <AgentesPruebaClient />
}
