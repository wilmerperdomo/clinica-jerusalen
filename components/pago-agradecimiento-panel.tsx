'use client'

import { CheckCircle2, Heart } from 'lucide-react'
import ContactoPacienteButtons from '@/components/contacto-paciente-buttons'
import { BRAND } from '@/lib/brand'
import { fmtMonto, mensajeAgradecimientoPago, nombrePaciente, type ContactoPaciente } from '@/lib/mensajes-paciente'

interface Props {
  monto: number
  paciente: ContactoPaciente
  subtitulo?: string
  mostrarEncuesta?: boolean
}

export default function PagoAgradecimientoPanel({
  monto, paciente, subtitulo, mostrarEncuesta = true,
}: Props) {
  const nombre = nombrePaciente(paciente)
  const mensaje = mensajeAgradecimientoPago(nombre, monto)
  const asunto = `Gracias por su visita — ${BRAND.nombre}`

  return (
    <div className="space-y-4 text-left w-full">
      <div className="text-center py-2">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-8 h-8 sm:w-9 sm:h-9 text-green-600" />
        </div>
        <p className="text-lg sm:text-xl font-bold text-gray-900">¡Pago registrado correctamente!</p>
        <p className="text-2xl sm:text-3xl font-extrabold text-green-700 mt-1">{fmtMonto(monto)}</p>
        <p className="text-sm text-gray-500 mt-1">{nombre}{subtitulo ? ` · ${subtitulo}` : ''}</p>
      </div>

      {mostrarEncuesta && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 sm:p-4">
          <p className="text-sm font-semibold text-emerald-900 flex items-center gap-2 mb-1">
            <Heart className="w-4 h-4 flex-shrink-0" />
            Agradecimiento al paciente
          </p>
          <p className="text-xs text-emerald-800 leading-relaxed mb-3">
            Envíe un mensaje de agradecimiento con el enlace a la encuesta de satisfacción.
          </p>
          <ContactoPacienteButtons
            celular={paciente.celular}
            telefono={paciente.telefono}
            correo={paciente.correo}
            mensajeWhatsApp={mensaje}
            asuntoEmail={asunto}
            cuerpoEmail={mensaje}
            labelWa="WhatsApp — Agradecimiento"
            labelEmail="Correo — Agradecimiento"
          />
        </div>
      )}
    </div>
  )
}
