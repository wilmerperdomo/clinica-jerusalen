'use client'

import { useRef, useState } from 'react'
import { Camera, Upload, Trash2, Loader2, User } from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { subirFotoPaciente, eliminarFotoPaciente } from '@/lib/paciente-foto'
import { createClient } from '@/lib/supabase/client'

interface Props {
  pacienteId: number
  fotoUrl?: string | null
  nombre: string
  genero?: string | null
  tipo?: string
  size?: 'sm' | 'lg'
  onFotoChange?: (url: string | null) => void
}

export default function PacienteFotoCapture({
  pacienteId, fotoUrl, nombre, genero, tipo = 'persona',
  size = 'lg', onFotoChange,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [foto, setFoto] = useState(fotoUrl ?? null)
  const [loading, setLoading] = useState(false)
  const [camara, setCamara] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dim = size === 'lg' ? 'w-36 h-36' : 'w-20 h-20'
  const textSize = size === 'lg' ? 'text-2xl' : 'text-sm'

  async function procesarArchivo(file: File) {
    setError(null)
    setLoading(true)
    try {
      const supabase = createClient()
      const url = await subirFotoPaciente(supabase, pacienteId, file)
      setFoto(url)
      onFotoChange?.(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al subir foto')
    } finally {
      setLoading(false)
    }
  }

  async function iniciarCamara() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCamara(true)
    } catch {
      setError('No se pudo acceder a la cámara. Use "Subir archivo".')
    }
  }

  function detenerCamara() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCamara(false)
  }

  async function capturarFoto() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    detenerCamara()
    canvas.toBlob(async (blob) => {
      if (!blob) return
      await procesarArchivo(new File([blob], `captura-${Date.now()}.jpg`, { type: 'image/jpeg' }))
    }, 'image/jpeg', 0.9)
  }

  async function quitarFoto() {
    if (!confirm('¿Eliminar la foto del paciente?')) return
    setLoading(true)
    try {
      const supabase = createClient()
      await eliminarFotoPaciente(supabase, pacienteId)
      setFoto(null)
      onFotoChange?.(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        {foto ? (
          <img src={foto} alt={nombre}
            className={cn(dim, 'rounded-2xl object-cover border-4 border-white shadow-lg')} />
        ) : (
          <div className={cn(
            dim, 'rounded-2xl flex items-center justify-center font-bold shadow-lg border-4 border-white',
            tipo === 'empresa' ? 'bg-violet-100 text-violet-700'
              : genero === 'F' ? 'bg-pink-100 text-pink-700'
              : 'bg-blue-100 text-blue-700',
            textSize,
          )}>
            {getInitials(nombre) || <User className="w-8 h-8" />}
          </div>
        )}
        {loading && (
          <div className={cn('absolute inset-0 bg-black/40 rounded-2xl flex items-center justify-center')}>
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
        )}
      </div>

      {camara ? (
        <div className="w-full max-w-xs space-y-2">
          <video ref={videoRef} className="w-full rounded-xl bg-black aspect-video" playsInline muted />
          <canvas ref={canvasRef} className="hidden" />
          <div className="flex gap-2">
            <button type="button" onClick={capturarFoto}
              className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700">
              Capturar
            </button>
            <button type="button" onClick={detenerCamara}
              className="flex-1 py-2 border border-slate-200 text-sm rounded-xl hover:bg-slate-50">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 justify-center">
          <button type="button" onClick={iniciarCamara} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 disabled:opacity-50">
            <Camera className="w-3.5 h-3.5" /> Tomar foto
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50">
            <Upload className="w-3.5 h-3.5" /> Subir archivo
          </button>
          {foto && (
            <button type="button" onClick={quitarFoto} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 rounded-lg hover:bg-red-100 disabled:opacity-50">
              <Trash2 className="w-3.5 h-3.5" /> Quitar
            </button>
          )}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) procesarArchivo(f)
          e.target.value = ''
        }} />

      {error && <p className="text-xs text-red-600 text-center max-w-xs">{error}</p>}
    </div>
  )
}
