'use client'

import { MessageCircle, Mail } from 'lucide-react'
import { linkEmailMensaje, linkWhatsAppMensaje } from '@/lib/mensajes-paciente'

interface Props {
  celular?: string | null
  telefono?: string | null
  correo?: string | null
  mensajeWhatsApp: string
  asuntoEmail?: string
  cuerpoEmail?: string
  /** Etiquetas cortas en móvil */
  labelWa?: string
  labelEmail?: string
  className?: string
}

export default function ContactoPacienteButtons({
  celular, telefono, correo,
  mensajeWhatsApp, asuntoEmail, cuerpoEmail,
  labelWa = 'Enviar por WhatsApp',
  labelEmail = 'Enviar por Correo',
  className = '',
}: Props) {
  const wa = linkWhatsAppMensaje(celular, telefono, mensajeWhatsApp)
  const mail = linkEmailMensaje(correo, asuntoEmail, cuerpoEmail)

  const btnBase = 'flex items-center justify-center gap-2 px-4 py-3 sm:py-2.5 rounded-xl text-sm font-bold transition min-h-[48px] sm:min-h-[44px] w-full'

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 ${className}`}>
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer"
          className={`${btnBase} text-white bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 shadow-sm`}>
          <MessageCircle className="w-4 h-4 flex-shrink-0" />
          <span>{labelWa}</span>
        </a>
      ) : (
        <div className={`${btnBase} bg-slate-100 text-slate-400 cursor-not-allowed`}>
          <MessageCircle className="w-4 h-4" />
          <span>Sin teléfono</span>
        </div>
      )}
      {mail ? (
        <a href={mail}
          className={`${btnBase} text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 shadow-sm`}>
          <Mail className="w-4 h-4 flex-shrink-0" />
          <span>{labelEmail}</span>
        </a>
      ) : (
        <div className={`${btnBase} bg-slate-100 text-slate-400 cursor-not-allowed`}>
          <Mail className="w-4 h-4" />
          <span>Sin correo</span>
        </div>
      )}
    </div>
  )
}
