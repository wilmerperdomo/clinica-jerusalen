'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Gift, Save, RefreshCw, Info, Percent, Coins, Shield } from 'lucide-react'
import {
  type FidelidadConfig,
  FIDELIDAD_CONFIG_DEFAULT,
  normalizarFidelidadConfig,
} from '@/lib/fidelidad-config'
import {
  calcularPuntosPorMonto,
  valorLempirasDePuntos,
  maxPuntosCanjeables,
  descuentoMaximoCanje,
} from '@/lib/fidelidad-puntos'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnPrimary } from '@/components/module-layout'

interface Props {
  configInicial: FidelidadConfig
}

function sb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export default function FidelidadClient({ configInicial }: Props) {
  const supabase = sb()
  const [config, setConfig] = useState<FidelidadConfig>(configInicial)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')

  const ejemploTotal = 400
  const ptsEjemplo = calcularPuntosPorMonto(ejemploTotal, config)
  const maxCanjeEj = maxPuntosCanjeables(500, ejemploTotal, config)
  const descMaxEj = descuentoMaximoCanje(ejemploTotal, config)

  async function guardar() {
    setError('')
    setMensaje('')
    if (config.lempiras_por_punto < 1) return setError('Las lempiras por punto deben ser al menos 1')
    if (config.valor_lempira_por_punto <= 0) return setError('El valor del punto debe ser mayor a cero')
    if (config.porcentaje_max_canje < 0 || config.porcentaje_max_canje > 100) {
      return setError('El porcentaje máximo de canje debe estar entre 0 y 100')
    }
    if (config.monto_minimo_cobro < 0) return setError('El monto mínimo de cobro no puede ser negativo')

    setGuardando(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await supabase
      .from('fidelidad_config')
      .upsert({
        id: 1,
        lempiras_por_punto: config.lempiras_por_punto,
        valor_lempira_por_punto: config.valor_lempira_por_punto,
        porcentaje_max_canje: config.porcentaje_max_canje,
        monto_minimo_cobro: config.monto_minimo_cobro,
        activo: config.activo,
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })
    setGuardando(false)
    if (err) {
      setError('No se pudo guardar. ¿Ejecutó la migración 091_fidelidad_config.sql? ' + err.message)
      return
    }
    setConfig(normalizarFidelidadConfig(config as unknown as Record<string, unknown>))
    setMensaje('Configuración guardada correctamente')
  }

  function restaurar() {
    setConfig({ ...FIDELIDAD_CONFIG_DEFAULT })
    setMensaje('')
    setError('')
  }

  return (
    <ModuleShell tint="violet">
      <ModuleHero
        title="Puntos de Fidelidad"
        subtitle="Reglas de acumulación y canje en caja (laboratorio)"
        badge="Programa de lealtad"
        icon={Gift}
        gradient="violet"
      />
      <ModuleContent>
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {mensaje && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{mensaje}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-gray-900 flex items-center gap-2">
                  <Coins className="w-5 h-5 text-violet-600" /> Acumulación
                </h2>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={config.activo}
                    onChange={e => setConfig(c => ({ ...c, activo: e.target.checked }))}
                    className="w-4 h-4 rounded text-violet-600"
                  />
                  Programa activo
                </label>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">
                    Lempiras facturadas por 1 punto
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    value={config.lempiras_por_punto}
                    onChange={e => setConfig(c => ({ ...c, lempiras_por_punto: Number(e.target.value) }))}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-violet-300 outline-none"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Ej: 26 → cada L 26.00 en factura = 1 punto</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">
                    Valor de 1 punto (L.)
                  </label>
                  <input
                    type="number"
                    min={0.01}
                    step="0.01"
                    value={config.valor_lempira_por_punto}
                    onChange={e => setConfig(c => ({ ...c, valor_lempira_por_punto: Number(e.target.value) }))}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-violet-300 outline-none"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Descuento en caja por cada punto canjeado</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border shadow-sm p-6 space-y-5">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <Percent className="w-5 h-5 text-violet-600" /> Límite de canje
              </h2>
              <p className="text-sm text-gray-600">
                Evita que el paciente canjee todos sus puntos y deje la factura en L 0.00 (no imprimible).
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">
                    Máximo % del total a pagar con puntos
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="1"
                      value={config.porcentaje_max_canje}
                      onChange={e => setConfig(c => ({ ...c, porcentaje_max_canje: Number(e.target.value) }))}
                      className="w-full border rounded-xl px-3 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-violet-300 outline-none"
                    />
                    <span className="text-gray-500 font-bold">%</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Recomendado: 25% → en factura de L 400 solo hasta L 100 con puntos
                  </p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">
                    Monto mínimo a cobrar / facturar (L.)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={config.monto_minimo_cobro}
                    onChange={e => setConfig(c => ({ ...c, monto_minimo_cobro: Number(e.target.value) }))}
                    className="w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-violet-300 outline-none"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Siempre debe quedar al menos este monto por cobrar</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <ModuleBtnPrimary onClick={() => void guardar()} disabled={guardando}>
                {guardando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar configuración
              </ModuleBtnPrimary>
              <button
                type="button"
                onClick={restaurar}
                className="px-4 py-2.5 border rounded-xl text-sm text-gray-600 hover:bg-gray-50"
              >
                Restaurar valores sugeridos
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-violet-50 border border-violet-100 rounded-2xl p-5 space-y-3">
              <h3 className="font-bold text-violet-900 flex items-center gap-2 text-sm">
                <Info className="w-4 h-4" /> Vista previa (ejemplo)
              </h3>
              <p className="text-sm text-violet-800">
                Factura / cobro de <strong>L {ejemploTotal.toFixed(2)}</strong>
              </p>
              <ul className="text-xs text-violet-700 space-y-1.5">
                <li>· Puntos que generaría: <strong>{ptsEjemplo}</strong></li>
                <li>· Descuento máx. con puntos: <strong>L {descMaxEj.toFixed(2)}</strong> ({config.porcentaje_max_canje}%)</li>
                <li>· Puntos máx. a canjear: <strong>{maxCanjeEj}</strong> (= L {valorLempirasDePuntos(maxCanjeEj, config).toFixed(2)})</li>
                <li>· Total mínimo a cobrar: <strong>L {config.monto_minimo_cobro.toFixed(2)}</strong></li>
              </ul>
            </div>

            <div className="bg-white border rounded-2xl p-5 text-xs text-gray-500 space-y-2">
              <p className="font-semibold text-gray-700 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5" /> Dónde aplica
              </p>
              <p>El canje se usa hoy en <strong>Caja → Cobro de laboratorio directo</strong>.</p>
              <p>La acumulación ocurre al <strong>emitir factura fiscal</strong> desde Facturación o Caja.</p>
            </div>
          </div>
        </div>
      </ModuleContent>
    </ModuleShell>
  )
}
