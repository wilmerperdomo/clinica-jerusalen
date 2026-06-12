'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Tipos ────────────────────────────────────────────────────────
type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id:      string
  type:    ToastType
  title:   string
  message?: string
}

interface ToastCtx {
  toast: (type: ToastType, title: string, message?: string) => void
  success: (title: string, msg?: string) => void
  error:   (title: string, msg?: string) => void
  warning: (title: string, msg?: string) => void
  info:    (title: string, msg?: string) => void
}

// ── Context ───────────────────────────────────────────────────────
const ToastContext = createContext<ToastCtx>({
  toast:   () => {},
  success: () => {},
  error:   () => {},
  warning: () => {},
  info:    () => {},
})

export function useToast() { return useContext(ToastContext) }

// ── Provider ──────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((type: ToastType, title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev.slice(-4), { id, type, title, message }])
    setTimeout(() => dismiss(id), type === 'error' ? 6000 : 4000)
  }, [dismiss])

  const success = useCallback((t: string, m?: string) => toast('success', t, m), [toast])
  const error   = useCallback((t: string, m?: string) => toast('error',   t, m), [toast])
  const warning = useCallback((t: string, m?: string) => toast('warning', t, m), [toast])
  const info    = useCallback((t: string, m?: string) => toast('info',    t, m), [toast])

  return (
    <ToastContext.Provider value={{ toast, success, error, warning, info }}>
      {children}
      {/* ── Contenedor de toasts ── */}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none" aria-live="polite">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

// ── ToastItem ─────────────────────────────────────────────────────
const CONFIG: Record<ToastType, { icon: React.ReactNode; bg: string; border: string; title: string; bar: string }> = {
  success: {
    icon:   <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />,
    bg:     'bg-white',
    border: 'border-green-200',
    title:  'text-green-800',
    bar:    'bg-green-400',
  },
  error: {
    icon:   <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />,
    bg:     'bg-white',
    border: 'border-red-200',
    title:  'text-red-800',
    bar:    'bg-red-400',
  },
  warning: {
    icon:   <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />,
    bg:     'bg-white',
    border: 'border-amber-200',
    title:  'text-amber-800',
    bar:    'bg-amber-400',
  },
  info: {
    icon:   <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />,
    bg:     'bg-white',
    border: 'border-blue-200',
    title:  'text-blue-800',
    bar:    'bg-blue-400',
  },
}

function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false)
  const cfg = CONFIG[t.type]

  useEffect(() => {
    // pequeño delay para animar entrada
    const id = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(id)
  }, [])

  return (
    <div
      className={cn(
        'pointer-events-auto relative w-80 rounded-xl border shadow-lg overflow-hidden transition-all duration-300',
        cfg.bg, cfg.border,
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      )}
    >
      {/* barra de color izquierda */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.bar}`} />

      <div className="flex items-start gap-3 px-4 py-3 pl-5">
        {cfg.icon}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${cfg.title}`}>{t.title}</p>
          {t.message && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{t.message}</p>}
        </div>
        <button
          onClick={() => onDismiss(t.id)}
          className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
