'use client'

import {
  createContext, useContext, useState, useCallback, useRef,
} from 'react'
import {
  AlertTriangle, X, Trash2, XCircle, CheckCircle2, Info, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Tipos ─────────────────────────────────────────────────── */
export type ConfirmVariant = 'danger' | 'warning' | 'info' | 'success'

export interface ConfirmDetail {
  label: string
  value: string
}

export interface ConfirmOptions {
  title:           string
  message?:        string
  details?:        ConfirmDetail[]
  variant?:        ConfirmVariant
  confirmLabel?:   string
  cancelLabel?:    string
  pedirMotivo?:    boolean
  motivoLabel?:    string
  motivoRequerido?: boolean
  motivoPlaceholder?: string
}

export interface ConfirmResult {
  confirmed: boolean
  motivo?:   string
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<ConfirmResult>

const ConfirmContext = createContext<ConfirmFn>(
  async () => ({ confirmed: false }),
)

export function useConfirm() {
  return useContext(ConfirmContext)
}

/* ── Estilos por variante ──────────────────────────────────── */
const VARIANT_CFG: Record<ConfirmVariant, {
  icon: React.ElementType
  iconColor: string
  headerBg: string
  headerText: string
  alertBg: string
  alertBorder: string
  alertText: string
  btnClass: string
}> = {
  danger: {
    icon: AlertTriangle,
    iconColor: 'text-red-600',
    headerBg: 'bg-red-50',
    headerText: 'text-red-800',
    alertBg: 'bg-red-50',
    alertBorder: 'border-red-200',
    alertText: 'text-red-700',
    btnClass: 'bg-red-600 hover:bg-red-700',
  },
  warning: {
    icon: AlertTriangle,
    iconColor: 'text-amber-600',
    headerBg: 'bg-amber-50',
    headerText: 'text-amber-900',
    alertBg: 'bg-amber-50',
    alertBorder: 'border-amber-200',
    alertText: 'text-amber-800',
    btnClass: 'bg-amber-600 hover:bg-amber-700',
  },
  info: {
    icon: Info,
    iconColor: 'text-blue-600',
    headerBg: 'bg-blue-50',
    headerText: 'text-blue-900',
    alertBg: 'bg-blue-50',
    alertBorder: 'border-blue-200',
    alertText: 'text-blue-800',
    btnClass: 'bg-blue-600 hover:bg-blue-700',
  },
  success: {
    icon: CheckCircle2,
    iconColor: 'text-green-600',
    headerBg: 'bg-green-50',
    headerText: 'text-green-900',
    alertBg: 'bg-green-50',
    alertBorder: 'border-green-200',
    alertText: 'text-green-800',
    btnClass: 'bg-green-600 hover:bg-green-700',
  },
}

/* ── Provider ─────────────────────────────────────────────── */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open,   setOpen]   = useState(false)
  const [opts,   setOpts]   = useState<ConfirmOptions | null>(null)
  const [motivo, setMotivo] = useState('')
  const resolver = useRef<((r: ConfirmResult) => void) | null>(null)

  const confirm = useCallback((options: ConfirmOptions): Promise<ConfirmResult> => {
    return new Promise(resolve => {
      resolver.current = resolve
      setOpts(options)
      setMotivo('')
      setOpen(true)
    })
  }, [])

  function cerrar(confirmed: boolean) {
    const result: ConfirmResult = {
      confirmed,
      motivo: motivo.trim() || undefined,
    }
    setOpen(false)
    setOpts(null)
    setMotivo('')
    resolver.current?.(result)
    resolver.current = null
  }

  const cfg     = VARIANT_CFG[opts?.variant ?? 'warning']
  const Icon    = cfg.icon
  const puedeOk = !opts?.pedirMotivo || !opts.motivoRequerido || motivo.trim().length > 0

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      {open && opts && (
        <div
          className="fixed inset-0 bg-black/50 z-[9998] flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) cerrar(false) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md animate-in fade-in zoom-in-95 duration-150">
            {/* encabezado */}
            <div className={cn('flex items-center justify-between px-6 py-4 border-b rounded-t-2xl', cfg.headerBg)}>
              <h2 className={cn('font-bold flex items-center gap-2 text-base', cfg.headerText)}>
                <Icon className={cn('w-5 h-5', cfg.iconColor)} />
                {opts.title}
              </h2>
              <button
                onClick={() => cerrar(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-white/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* cuerpo */}
            <div className="px-6 py-5 space-y-4">
              {opts.message && (
                <div className={cn('flex items-start gap-2 border rounded-xl px-3 py-2.5', cfg.alertBg, cfg.alertBorder)}>
                  <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', cfg.iconColor)} />
                  <p className={cn('text-sm leading-relaxed', cfg.alertText)}>{opts.message}</p>
                </div>
              )}

              {opts.details && opts.details.length > 0 && (
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 bg-gray-50 rounded-xl p-3 border">
                  {opts.details.map(d => (
                    <div key={d.label}>
                      <span className="text-gray-400">{d.label}: </span>
                      <span className="font-medium text-gray-800">{d.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {opts.pedirMotivo && (
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">
                    {opts.motivoLabel ?? 'Motivo'}
                    {opts.motivoRequerido && <span className="text-red-500"> *</span>}
                  </label>
                  <textarea
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                    rows={3}
                    placeholder={opts.motivoPlaceholder ?? 'Ingresa el motivo…'}
                    className="w-full border rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-300"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* acciones */}
            <div className="px-6 py-4 border-t flex gap-3 justify-end">
              <button
                onClick={() => cerrar(false)}
                className="px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50 font-medium"
              >
                {opts.cancelLabel ?? 'Cancelar'}
              </button>
              <button
                onClick={() => cerrar(true)}
                disabled={!puedeOk}
                className={cn(
                  'px-5 py-2 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-2',
                  cfg.btnClass,
                )}
              >
                {opts.variant === 'danger'
                  ? <Trash2 className="w-3.5 h-3.5" />
                  : opts.variant === 'success'
                  ? <CheckCircle2 className="w-3.5 h-3.5" />
                  : <AlertTriangle className="w-3.5 h-3.5" />}
                {opts.confirmLabel ?? 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}
