'use client'

import { useEffect, useState } from 'react'
import { Lock, Unlock, KeyRound, Copy, RefreshCw } from 'lucide-react'
import type { SupabaseClient } from '@supabase/supabase-js'

export type FormFacturaCliente = {
  nombre_cliente: string
  rtn_cliente: string
  exento: boolean
  /** Si true, la factura impresa muestra el nombre de cada medicamento. */
  mostrar_nombres_meds: boolean
}

interface Props {
  formFactura: FormFacturaCliente
  setFormFactura: React.Dispatch<React.SetStateAction<FormFacturaCliente>>
  /** Nombre según expediente / paciente registrado */
  nombreRegistrado: string
  rtnRegistrado?: string
  esSuperAdmin: boolean
  sucursalId?: number | null
  supabase: SupabaseClient
  /** Cambia al abrir otro cobro para reiniciar el bloqueo */
  resetKey?: string | number
  compact?: boolean
}

export default function NombreFacturarProtegido({
  formFactura,
  setFormFactura,
  nombreRegistrado,
  rtnRegistrado = '',
  esSuperAdmin,
  sucursalId,
  supabase,
  resetKey,
  compact = false,
}: Props) {
  const [desbloqueado, setDesbloqueado] = useState(false)
  const [mostrarCodigo, setMostrarCodigo] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [validando, setValidando] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [codigoGenerado, setCodigoGenerado] = useState<{ codigo: string; expira: string } | null>(null)

  useEffect(() => {
    setDesbloqueado(false)
    setMostrarCodigo(false)
    setCodigo('')
    setError('')
    setCodigoGenerado(null)
    setFormFactura(p => ({
      ...p,
      nombre_cliente: nombreRegistrado,
      rtn_cliente: rtnRegistrado,
    }))
  }, [resetKey, nombreRegistrado, rtnRegistrado, setFormFactura])

  async function validarCodigo() {
    setError('')
    setValidando(true)
    try {
      const { error: err } = await supabase.rpc('fn_validar_autorizacion_caja', {
        p_codigo: codigo.trim(),
        p_proposito: 'CAMBIO_TITULAR',
      })
      if (err) throw err
      setDesbloqueado(true)
      setMostrarCodigo(false)
      setCodigo('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Código inválido'
      if (msg.includes('Could not find the function') || msg.includes('schema cache')) {
        setError('Falta migración 082 en Supabase (autorización cambio titular).')
      } else {
        setError(msg)
      }
    } finally {
      setValidando(false)
    }
  }

  async function generarCodigo() {
    setError('')
    setGenerando(true)
    try {
      const { data, error: err } = await supabase.rpc('fn_generar_autorizacion_caja', {
        p_proposito: 'CAMBIO_TITULAR',
        p_sucursal_id: sucursalId ?? null,
        p_minutos: 60,
      })
      if (err) throw err
      const row = (Array.isArray(data) ? data[0] : data) as { codigo: string; expira_at: string }
      setCodigoGenerado({ codigo: row.codigo, expira: row.expira_at })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el código')
    } finally {
      setGenerando(false)
    }
  }

  function bloquearDeNuevo() {
    setDesbloqueado(false)
    setFormFactura(p => ({
      ...p,
      nombre_cliente: nombreRegistrado,
      rtn_cliente: rtnRegistrado,
    }))
  }

  const inputCls = compact
    ? 'w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-400 outline-none'
    : 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-400 outline-none bg-white'

  return (
    <div className="space-y-3">
      {!compact && (
        <p className="text-[11px] text-indigo-700/90">
          El nombre debe coincidir con el paciente registrado. Para facturar a empresa u otro titular,
          registre primero al cliente en Pacientes o solicite código de autorización.
        </p>
      )}

      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <label className="block text-sm font-medium text-gray-700">Nombre a facturar</label>
          {desbloqueado ? (
            <button
              type="button"
              onClick={bloquearDeNuevo}
              className="text-[11px] font-semibold text-amber-700 hover:underline flex items-center gap-1"
            >
              <Lock className="w-3 h-3" /> Restaurar nombre registrado
            </button>
          ) : (
            <span className="text-[10px] font-bold text-indigo-600 uppercase flex items-center gap-1">
              <Lock className="w-3 h-3" /> Bloqueado
            </span>
          )}
        </div>
        <input
          value={formFactura.nombre_cliente}
          readOnly={!desbloqueado}
          onChange={e => desbloqueado && setFormFactura(p => ({ ...p, nombre_cliente: e.target.value }))}
          placeholder="Nombre del paciente registrado"
          className={`${inputCls} ${!desbloqueado ? 'bg-gray-50 text-gray-700 cursor-not-allowed' : ''}`}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">RTN del cliente (opcional)</label>
        <input
          value={formFactura.rtn_cliente}
          readOnly={!desbloqueado}
          onChange={e => desbloqueado && setFormFactura(p => ({ ...p, rtn_cliente: e.target.value }))}
          placeholder="0000-0000-000000 — vacío = consumidor final"
          className={`${inputCls} font-mono ${!desbloqueado ? 'bg-gray-50 text-gray-700 cursor-not-allowed' : ''}`}
        />
      </div>

      {!desbloqueado && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 space-y-2">
          <p className="text-xs text-amber-900">
            <strong>¿Facturar a otro nombre o empresa?</strong> Registre al cliente en Pacientes
            o pida un código al super administrador.
          </p>
          {!mostrarCodigo ? (
            <button
              type="button"
              onClick={() => setMostrarCodigo(true)}
              className="text-xs font-bold text-indigo-700 hover:underline flex items-center gap-1"
            >
              <KeyRound className="w-3.5 h-3.5" /> Tengo código de autorización
            </button>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={codigo}
                onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Código 6 dígitos"
                maxLength={6}
                className="flex-1 border rounded-lg px-3 py-2 text-sm font-mono tracking-widest"
              />
              <button
                type="button"
                onClick={validarCodigo}
                disabled={validando || codigo.length < 6}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {validando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Unlock className="w-3.5 h-3.5" />}
                Desbloquear
              </button>
            </div>
          )}
          {esSuperAdmin && (
            <div className="pt-1 border-t border-amber-200/80">
              <button
                type="button"
                onClick={generarCodigo}
                disabled={generando}
                className="text-xs font-bold text-violet-700 hover:underline flex items-center gap-1"
              >
                {generando ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                Generar código para caja (60 min)
              </button>
              {codigoGenerado && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-2xl font-mono font-bold tracking-widest text-violet-800">
                    {codigoGenerado.codigo}
                  </span>
                  <button
                    type="button"
                    onClick={() => navigator.clipboard?.writeText(codigoGenerado.codigo)}
                    className="p-1.5 rounded border bg-white text-violet-700"
                    title="Copiar"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
          {error && <p className="text-xs text-red-700">{error}</p>}
        </div>
      )}

      {desbloqueado && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Nombre desbloqueado con autorización. Verifique RTN si factura a empresa.
        </p>
      )}
    </div>
  )
}
