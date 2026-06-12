'use client'

import { useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { abrirFacturaTermica } from '@/lib/factura-print'
import {
  reservarSiguienteCorrelativo, confirmarCorrelativo,
  esErrorNumeroDuplicado, extraerCorrelativo, formatearNumeroFactura,
} from '@/lib/factura-correlativo'
import {
  FileText, Plus, Search, Printer, X, RefreshCw,
  CheckCircle, XCircle, AlertTriangle, Hash, Building2,
  User, DollarSign, Trash2, ChevronDown, ChevronUp, Eye,
  ShieldAlert, History, Lock,
} from 'lucide-react'
import { ModuleShell, ModuleHero, ModuleContent, ModuleBtnPrimary, ModuleBtnGhost } from '@/components/module-layout'

/* ══════════════════ TIPOS ════════════════════════════════════ */
interface ItemFactura {
  descripcion:     string
  cantidad:        number
  precio_unitario: number
  isv_pct:         number   // 0 = exento, 15 = ISV estándar
  subtotal:        number
}
interface Sucursal {
  id: number; nombre: string; nombre_corto?: string
  direccion?: string; telefono?: string; email?: string
  rtn?: string; cai?: string; fecha_limite?: string
  num_min?: string | number | null; num_max?: string | number | null; numero_inicial?: string | number | null
  lema?: string; tama?: string; letra?: string
}
interface Paciente { id: number; nombre: string; apellido1: string; apellido2?: string; correo?: string }
interface Correlativo { sucursal_id: number; ultimo_numero: number }
interface Factura {
  id: number; numero: string; fecha: string; hora: string
  cliente_nombre: string; cliente_rtn?: string
  subtotal: number; descuento_monto: number; isv_monto: number; total: number
  estado: string; motivo_anulacion?: string
  cai?: string; rango_inicio?: string; rango_fin?: string
  cajero_nombre?: string; medico_nombre?: string; paciente_id?: number
  sucursal_id: number; items: ItemFactura[]
  exento_isv: boolean; rtn_emisor?: string; fecha_limite_cai?: string
  sucursal?: { nombre: string } | null
}
interface Auditoria {
  id: number; factura_id: number; numero?: string
  accion: string; motivo: string; usuario_nombre?: string
  fecha: string; datos_antes?: Record<string, unknown>
}
interface Props {
  facturas:        Factura[]
  sucursales:      Sucursal[]
  pacientes:       Paciente[]
  correlativos:    Correlativo[]
  sucursalDefault: number | null
  cajeroNombre:    string
  hoy:             string
  esSuperAdmin:    boolean
  userId:          string
  auditoria:       Auditoria[]
}

/* ══════════════════ HELPERS ══════════════════════════════════ */
const fmt   = (n: number) => `L. ${n.toLocaleString('es-HN', { minimumFractionDigits: 2 })}`
const ISV   = 0.15

function qrUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(data)}&margin=4`
}

function siguienteNumero(suc: Sucursal, correlativos: Correlativo[]): number {
  const cor = correlativos.find(c => c.sucursal_id === suc.id)
  if (cor) return cor.ultimo_numero + 1
  return extraerCorrelativo(suc.numero_inicial ?? suc.num_min)
}

function formatearNumero(num: number, suc: Sucursal): string {
  return formatearNumeroFactura(num, suc)
}

/* ════════════════════════════════════════════════════════════ */
export default function FacturacionClient({
  facturas: init, sucursales, pacientes, correlativos,
  sucursalDefault, cajeroNombre, hoy,
  esSuperAdmin, userId, auditoria: initAuditoria,
}: Props) {
  const supabase = createClient()

  const [facturas,  setFacturas]  = useState<Factura[]>(init)
  const [corrs,     setCorrs]     = useState<Correlativo[]>(correlativos)
  const [buscar,    setBuscar]    = useState('')
  const [filtroEst, setFiltroEst] = useState('')
  const [verFact,   setVerFact]   = useState<Factura | null>(null)

  /* ── modal nueva factura ── */
  const [modal,    setModal]    = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [buscarPac,setBuscarPac]= useState('')

  const itemVacio: ItemFactura = { descripcion: '', cantidad: 1, precio_unitario: 0, isv_pct: 15, subtotal: 0 }

  // Sucursal del usuario; admin puede usar la primera si no tiene asignada
  const sucDefault = sucursalDefault != null
    ? sucursales.find(s => Number(s.id) === Number(sucursalDefault)) ?? null
    : (esSuperAdmin && sucursales.length > 0 ? sucursales[0] : null)
  const sinSucursal = !sucDefault

  const [form, setForm] = useState({
    sucursal_id:     sucDefault?.id ?? 0,
    cliente_nombre:  'CLIENTE GENERAL',
    cliente_rtn:     '',
    cliente_email:   '',
    paciente_id:     0,
    exento_isv:      false,
  })
  const [items, setItems] = useState<ItemFactura[]>([{ ...itemVacio }])

  /* ── modal anular ── */
  const [anularFact,    setAnularFact]    = useState<Factura | null>(null)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  const [loadingAnular, setLoadingAnular] = useState(false)

  /* ── modal eliminar (solo super admin) ── */
  const [eliminarFact,   setEliminarFact]   = useState<Factura | null>(null)
  const [motivoEliminar, setMotivoEliminar] = useState('')
  const [loadingEliminar, setLoadingEliminar] = useState(false)

  /* ── tab auditoría ── */
  const [tabActivo, setTabActivo]   = useState<'facturas' | 'auditoria'>('facturas')
  const [auditoria, setAuditoria]   = useState<Auditoria[]>(initAuditoria)
  const [verAudit,  setVerAudit]    = useState<Auditoria | null>(null)

  const refPrint = useRef<HTMLDivElement>(null)

  /* ════════ CÁLCULOS ══════════════════════════════════════════ */
  const sucSeleccionada = sucursales.find(s => s.id === form.sucursal_id) ?? sucDefault

  // recalcular ítems
  function recalcularItem(idx: number, field: keyof ItemFactura, val: string | number) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const updated = { ...it, [field]: val }
      updated.subtotal = updated.cantidad * updated.precio_unitario
      return updated
    }))
  }

  const totales = useMemo(() => {
    const subtotal   = items.reduce((s, it) => s + it.subtotal, 0)
    const isv_monto  = form.exento_isv ? 0 : items.reduce((s, it) => s + it.subtotal * (it.isv_pct / 100), 0)
    const total      = subtotal + isv_monto
    return { subtotal, isv_monto, total }
  }, [items, form.exento_isv])

  const factsFiltradas = useMemo(() => {
    return facturas.filter(f => {
      const q = buscar.toLowerCase()
      const pass = !q || f.numero.includes(q) || f.cliente_nombre.toLowerCase().includes(q) || (f.cliente_rtn || '').includes(q)
      const passE = !filtroEst || f.estado === filtroEst
      return pass && passE
    })
  }, [facturas, buscar, filtroEst])

  const stats = useMemo(() => {
    const hoyFacturas  = facturas.filter(f => f.fecha === hoy && f.estado === 'emitida')
    const mesFacturas  = facturas.filter(f => f.estado === 'emitida')
    return {
      hoyCount:   hoyFacturas.length,
      hoyTotal:   hoyFacturas.reduce((s, f) => s + f.total, 0),
      mesCount:   mesFacturas.length,
      mesTotal:   mesFacturas.reduce((s, f) => s + f.total, 0),
      anuladas:   facturas.filter(f => f.estado === 'anulada').length,
    }
  }, [facturas, hoy])

  /* ════════ GUARDAR FACTURA ══════════════════════════════════ */
  async function guardarFactura() {
    if (!form.cliente_nombre.trim()) return setError('Ingresa el nombre del cliente')
    if (items.every(it => !it.descripcion.trim())) return setError('Agrega al menos un ítem')
    if (totales.total <= 0) return setError('El total debe ser mayor a cero')
    if (!sucSeleccionada) return setError('Selecciona una sucursal')

    setLoading(true); setError('')
    try {
      if (sucSeleccionada.fecha_limite && sucSeleccionada.fecha_limite < hoy) {
        throw new Error(`El CAI de esta sucursal venció el ${sucSeleccionada.fecha_limite}. Renueva el CAI en Configuración.`)
      }

      const itemsLimpios = items.filter(it => it.descripcion.trim() && it.cantidad > 0)

      const payloadBase = {
        sucursal_id:     form.sucursal_id,
        fecha:           hoy,
        hora:            new Date().toTimeString().slice(0, 8),
        cliente_nombre:  form.cliente_nombre.trim(),
        cliente_rtn:     form.cliente_rtn.trim() || null,
        cliente_email:   form.cliente_email.trim() || null,
        items:           itemsLimpios,
        subtotal:        totales.subtotal,
        descuento_monto: 0,
        isv_monto:       totales.isv_monto,
        total:           totales.total,
        exento_isv:      form.exento_isv,
        paciente_id:     form.paciente_id || null,
        cajero_nombre:   cajeroNombre,
        cai:             sucSeleccionada.cai  || null,
        rtn_emisor:      sucSeleccionada.rtn  || null,
        rango_inicio:    sucSeleccionada.num_min || null,
        rango_fin:       sucSeleccionada.num_max || null,
        fecha_limite_cai:sucSeleccionada.fecha_limite || null,
      }

      let nf = null
      let numSig = 0
      let ultimoError: string | null = null

      for (let intento = 0; intento < 4; intento++) {
        const reserva = await reservarSiguienteCorrelativo(
          supabase, form.sucursal_id, sucSeleccionada,
          intento > 0 ? numSig + 1 : undefined,
        )
        numSig = reserva.numSig

        if (sucSeleccionada.num_max) {
          const maxNum = extraerCorrelativo(sucSeleccionada.num_max)
          if (numSig > maxNum) {
            throw new Error(`Número ${numSig} excede el rango máximo del CAI (${sucSeleccionada.num_max}). Renueva el CAI en Configuración.`)
          }
        }

        const { data, error: e } = await supabase
          .from('facturas')
          .insert({ ...payloadBase, numero: reserva.numero })
          .select(`id, numero, fecha, hora, cliente_nombre, cliente_rtn, subtotal, descuento_monto, isv_monto, total, estado, cai, rango_inicio, rango_fin, cajero_nombre, medico_nombre, paciente_id, sucursal_id, items, exento_isv, rtn_emisor, fecha_limite_cai, sucursal:sucursales(nombre)`)
          .single()

        if (!e) {
          nf = data
          await confirmarCorrelativo(supabase, form.sucursal_id, numSig)
          break
        }

        ultimoError = e.message
        if (!esErrorNumeroDuplicado(e)) throw new Error(e.message)
        numSig += 1
      }

      if (!nf) throw new Error(ultimoError ?? 'No se pudo reservar un número de factura único')

      setCorrs(prev => {
        const existing = prev.find(c => c.sucursal_id === form.sucursal_id)
        if (existing) return prev.map(c => c.sucursal_id === form.sucursal_id ? { ...c, ultimo_numero: numSig } : c)
        return [...prev, { sucursal_id: form.sucursal_id, ultimo_numero: numSig }]
      })

      setFacturas(prev => [nf as unknown as Factura, ...prev])
      setVerFact(nf as unknown as Factura)
      setModal(false)
      resetForm()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al guardar la factura')
    } finally { setLoading(false) }
  }

  function resetForm() {
    setForm({ sucursal_id: sucDefault?.id ?? 0, cliente_nombre: 'CLIENTE GENERAL', cliente_rtn: '', cliente_email: '', paciente_id: 0, exento_isv: false })
    setItems([{ ...itemVacio }])
    setBuscarPac('')
  }

  /* ════════ ANULAR FACTURA (solo super admin) ════════════════ */
  async function anularFactura() {
    if (!anularFact) return
    if (!motivoAnulacion.trim()) return alert('Ingresa el motivo de anulación')
    if (!esSuperAdmin) return alert('Solo el Super Administrador puede anular facturas')
    setLoadingAnular(true)
    try {
      // Pasar el nombre del usuario al trigger via configuración de sesión
      await supabase.rpc('set_config', { key: 'app.usuario_nombre', value: cajeroNombre }).catch(() => null)

      const { error: e } = await supabase.from('facturas').update({
        estado: 'anulada',
        motivo_anulacion: motivoAnulacion.trim(),
        fecha_anulacion: new Date().toISOString(),
      }).eq('id', anularFact.id)
      if (e) throw e

      // Registrar en auditoría también desde el cliente (redundancia)
      await supabase.from('facturas_auditoria').insert({
        factura_id:    anularFact.id,
        numero:        anularFact.numero,
        accion:        'ANULADA',
        motivo:        motivoAnulacion.trim(),
        datos_antes:   anularFact as unknown as Record<string, unknown>,
        usuario_id:    userId,
        usuario_nombre: cajeroNombre,
      })

      setFacturas(prev => prev.map(f => f.id === anularFact.id
        ? { ...f, estado: 'anulada', motivo_anulacion: motivoAnulacion.trim() } : f
      ))
      // Agregar al log local
      setAuditoria(prev => [{
        id: Date.now(), factura_id: anularFact.id, numero: anularFact.numero,
        accion: 'ANULADA', motivo: motivoAnulacion.trim(),
        usuario_nombre: cajeroNombre, fecha: new Date().toISOString(),
      }, ...prev])
      setAnularFact(null); setMotivoAnulacion('')
    } catch (err) { alert('Error al anular: ' + (err instanceof Error ? err.message : err)) }
    finally { setLoadingAnular(false) }
  }

  /* ════════ ELIMINAR FACTURA (solo super admin) ══════════════ */
  async function eliminarFactura() {
    if (!eliminarFact) return
    if (!motivoEliminar.trim()) return alert('Debes ingresar el motivo de eliminación')
    if (!esSuperAdmin) return alert('Solo el Super Administrador puede eliminar facturas')

    setLoadingEliminar(true)
    try {
      // Registrar auditoría ANTES de eliminar
      await supabase.from('facturas_auditoria').insert({
        factura_id:    eliminarFact.id,
        numero:        eliminarFact.numero,
        accion:        'ELIMINADA',
        motivo:        motivoEliminar.trim(),
        datos_antes:   eliminarFact as unknown as Record<string, unknown>,
        usuario_id:    userId,
        usuario_nombre: cajeroNombre,
      })

      const { error: e } = await supabase.from('facturas').delete().eq('id', eliminarFact.id)
      if (e) throw e

      setFacturas(prev => prev.filter(f => f.id !== eliminarFact.id))
      setAuditoria(prev => [{
        id: Date.now(), factura_id: eliminarFact.id, numero: eliminarFact.numero,
        accion: 'ELIMINADA', motivo: motivoEliminar.trim(),
        usuario_nombre: cajeroNombre, fecha: new Date().toISOString(),
      }, ...prev])
      setEliminarFact(null); setMotivoEliminar('')
      if (verFact?.id === eliminarFact.id) setVerFact(null)
    } catch (err) { alert('Error al eliminar: ' + (err instanceof Error ? err.message : err)) }
    finally { setLoadingEliminar(false) }
  }

  /* ════════ IMPRIMIR FACTURA — Formato térmico oficial ═══════ */
  function imprimirFactura(f: Factura) {
    const items = f.items as ItemFactura[]
    const exentoIsv = items.every(it => it.isv_pct === 0)
    abrirFacturaTermica({
      numero: f.numero,
      fecha: f.fecha,
      hora: f.hora,
      cliente_nombre: f.cliente_nombre,
      cliente_rtn: f.cliente_rtn,
      rtn_emisor: f.rtn_emisor,
      subtotal: f.subtotal,
      descuento_monto: f.descuento_monto,
      isv_monto: f.isv_monto,
      total: f.total,
      exento_isv: exentoIsv,
      cai: f.cai,
      rango_inicio: f.rango_inicio,
      rango_fin: f.rango_fin,
      fecha_limite_cai: f.fecha_limite_cai,
      cajero_nombre: f.cajero_nombre,
      medico_nombre: f.medico_nombre,
      items: f.items,
      estado: f.estado,
    })
  }

  /* ════════════════════════════════════════════════════════════ */
  return (
    <ModuleShell tint="sky">
      <ModuleHero
        title="Facturación Fiscal"
        subtitle="Control de facturas con CAI, RTN e ISV — Honduras"
        badge={esSuperAdmin ? 'Super Admin · Fiscal' : 'Facturación'}
        icon={FileText}
        kpis={[
          { label: 'Facturas hoy', value: stats.hoyCount, icon: Hash },
          { label: 'Facturas mes', value: stats.mesCount, icon: FileText },
          { label: 'Total mes', value: fmt(stats.mesTotal), icon: DollarSign },
          { label: 'ISV del mes', value: fmt(facturas.filter(f=>f.estado==='emitida').reduce((s,f)=>s+f.isv_monto,0)), icon: Building2 },
          { label: 'Anuladas', value: stats.anuladas, icon: XCircle },
        ]}
        actions={
          <>
            {esSuperAdmin && (
              <ModuleBtnGhost onClick={() => setTabActivo(t => t === 'auditoria' ? 'facturas' : 'auditoria')}>
                <History className="w-4 h-4" />
                {tabActivo === 'auditoria' ? 'Ver Facturas' : 'Auditoría'}
                {auditoria.length > 0 && tabActivo !== 'auditoria' && (
                  <span className="bg-red-500 text-white text-xs px-1.5 py-0.5 rounded-full ml-1">{auditoria.length}</span>
                )}
              </ModuleBtnGhost>
            )}
            {sinSucursal ? (
              <span className="flex items-center gap-2 px-3 py-2 bg-red-500/20 border border-red-300/40 text-red-100 rounded-xl text-sm">
                <AlertTriangle className="w-4 h-4"/> Sin sucursal
              </span>
            ) : (
              <ModuleBtnPrimary onClick={() => { setModal(true); setError(''); resetForm() }}>
                <Plus className="w-4 h-4"/> Nueva Factura
              </ModuleBtnPrimary>
            )}
          </>
        }
      />
      <ModuleContent>

      {/* ALERTA CAI */}
      {sucursales.some(s => s.fecha_limite && s.fecha_limite < hoy) && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0"/>
          <span>Una o más sucursales tienen el <strong>CAI vencido</strong>. Actualiza los datos fiscales en <strong>Configuración → Sucursales</strong>.</span>
        </div>
      )}

      {/* INFO FISCAL POR SUCURSAL */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sucursales.map(s => {
          const vencido = s.fecha_limite && s.fecha_limite < hoy
          const proxVencer = s.fecha_limite && !vencido && s.fecha_limite <= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
          return (
            <div key={s.id} className={`bg-white border rounded-2xl p-4 ${vencido ? 'border-red-300 bg-red-50' : proxVencer ? 'border-amber-300 bg-amber-50' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-gray-800 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-blue-500"/> {s.nombre}
                </p>
                {vencido    && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">CAI Vencido</span>}
                {proxVencer && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">CAI por vencer</span>}
              </div>
              <div className="space-y-1 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span className="text-gray-400">RTN</span>
                  <span className="font-mono">{s.rtn || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">CAI</span>
                  <span className="font-mono text-[10px] truncate max-w-[180px]">{s.cai || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Rango</span>
                  <span className="font-mono text-[10px]">{s.num_min || '—'} → {s.num_max || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Fecha límite</span>
                  <span className={`font-medium ${vencido ? 'text-red-600' : proxVencer ? 'text-amber-600' : ''}`}>
                    {s.fecha_limite || '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Próxima factura</span>
                  <span className="font-bold text-blue-600">#{siguienteNumero(s, corrs)}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* TABLA FACTURAS */}
      <div className="bg-white border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"/>
            <input value={buscar} onChange={e => setBuscar(e.target.value)}
              placeholder="Número, cliente, RTN…"
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
          </div>
          <select value={filtroEst} onChange={e => setFiltroEst(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm text-gray-700">
            <option value="">Todos</option>
            <option value="emitida">Emitidas</option>
            <option value="anulada">Anuladas</option>
          </select>
          <p className="text-sm text-gray-400 ml-auto">{factsFiltradas.length} facturas</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">N° Factura</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Sucursal</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Subtotal</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">ISV</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Estado</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase w-28">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {factsFiltradas.length === 0 && (
                <tr><td colSpan={9} className="text-center py-16 text-gray-400">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-30"/>
                  No hay facturas{buscar ? ' para esta búsqueda' : ' este mes'}
                </td></tr>
              )}
              {factsFiltradas.map(f => (
                <tr key={f.id} className={`hover:bg-gray-50 ${f.estado === 'anulada' ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm font-bold text-blue-700">{f.numero}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">{f.fecha} {(f.hora ?? '').slice(0,5)}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{f.cliente_nombre}</p>
                    {f.cliente_rtn && <p className="text-xs text-gray-400 font-mono">RTN: {f.cliente_rtn}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{sucursales.find(s => s.id === f.sucursal_id)?.nombre ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{fmt(f.subtotal)}</td>
                  <td className="px-4 py-3 text-right text-gray-500 text-xs">{fmt(f.isv_monto)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{fmt(f.total)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${f.estado === 'emitida' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {f.estado === 'emitida' ? 'Emitida' : 'Anulada'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button onClick={() => setVerFact(f)} title="Ver detalle"
                        className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100">
                        <Eye className="w-3.5 h-3.5"/>
                      </button>
                      <button onClick={() => imprimirFactura(f)} title="Imprimir"
                        className="p-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100">
                        <Printer className="w-3.5 h-3.5"/>
                      </button>
                      {/* Anular — solo super admin */}
                      {f.estado === 'emitida' && esSuperAdmin && (
                        <button onClick={() => { setAnularFact(f); setMotivoAnulacion('') }} title="Anular factura"
                          className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100">
                          <XCircle className="w-3.5 h-3.5"/>
                        </button>
                      )}
                      {/* Eliminar — solo super admin */}
                      {esSuperAdmin && (
                        <button onClick={() => { setEliminarFact(f); setMotivoEliminar('') }} title="Eliminar factura"
                          className="p-1.5 rounded-lg bg-gray-800/10 text-gray-700 hover:bg-red-100 hover:text-red-700">
                          <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                      )}
                      {/* Candado para usuarios normales */}
                      {!esSuperAdmin && f.estado === 'emitida' && (
                        <span title="Solo el Super Admin puede anular/eliminar facturas"
                          className="p-1.5 text-gray-300 cursor-not-allowed">
                          <Lock className="w-3.5 h-3.5"/>
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══ TAB AUDITORÍA (solo super admin) ══ */}
      {esSuperAdmin && tabActivo === 'auditoria' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-4 border-b bg-red-50">
            <History className="w-5 h-5 text-red-600" />
            <div>
              <h2 className="font-bold text-gray-900">Historial de Auditoría</h2>
              <p className="text-xs text-gray-500">Registro de todas las anulaciones y eliminaciones de facturas</p>
            </div>
            <span className="ml-auto bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium">
              {auditoria.length} registros
            </span>
          </div>
          {auditoria.length === 0 ? (
            <div className="py-16 text-center text-gray-400">
              <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p>Sin registros de auditoría</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3 text-left">Fecha / Hora</th>
                    <th className="px-4 py-3 text-left">Factura</th>
                    <th className="px-4 py-3 text-center">Acción</th>
                    <th className="px-4 py-3 text-left">Motivo</th>
                    <th className="px-4 py-3 text-left">Usuario</th>
                    <th className="px-4 py-3 text-center">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {auditoria.map(a => (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                        {new Date(a.fecha).toLocaleString('es-HN')}
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-700">{a.numero || `#${a.factura_id}`}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          a.accion === 'ELIMINADA'
                            ? 'bg-gray-800 text-white'
                            : a.accion === 'ANULADA'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {a.accion}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{a.motivo}</td>
                      <td className="px-4 py-3 text-gray-600">{a.usuario_nombre || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setVerAudit(a)}
                          className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"
                          title="Ver datos completos"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ MODAL NUEVA FACTURA ══ */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600"/> Nueva Factura
              </h2>
              <button onClick={() => { setModal(false); resetForm() }} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {error && <p className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-lg">{error}</p>}

              {/* info fiscal sucursal seleccionada */}
              {sucSeleccionada && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs space-y-0.5">
                  <p className="font-semibold text-blue-800 text-sm mb-1">{sucSeleccionada.nombre}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-gray-600">
                    <span><span className="text-gray-400">RTN:</span> {sucSeleccionada.rtn || '—'}</span>
                    <span><span className="text-gray-400">Próx. N°:</span> <span className="font-bold text-blue-700">#{siguienteNumero(sucSeleccionada, corrs)}</span></span>
                    <span className="col-span-2 truncate"><span className="text-gray-400">CAI:</span> {sucSeleccionada.cai || '—'}</span>
                    <span><span className="text-gray-400">Rango:</span> {sucSeleccionada.num_min} → {sucSeleccionada.num_max}</span>
                    <span><span className="text-gray-400">Límite:</span> <span className={sucSeleccionada.fecha_limite && sucSeleccionada.fecha_limite < hoy ? 'text-red-600 font-bold' : ''}>{sucSeleccionada.fecha_limite || '—'}</span></span>
                  </div>
                </div>
              )}

              {/* sucursal + paciente */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">Sucursal</label>
                  <select value={form.sucursal_id} onChange={e => setForm(p => ({ ...p, sucursal_id: Number(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                    {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">ISV</label>
                  <select value={form.exento_isv ? 'exento' : 'gravado'}
                    onChange={e => setForm(p => ({ ...p, exento_isv: e.target.value === 'exento' }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                    <option value="gravado">Gravado (15%)</option>
                    <option value="exento">Exento de ISV</option>
                  </select>
                </div>
              </div>

              {/* datos del cliente */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-gray-600 uppercase block">Datos del Cliente</label>
                {/* buscar paciente */}
                <input value={buscarPac} onChange={e => setBuscarPac(e.target.value)}
                  placeholder="Buscar paciente registrado (opcional)…"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"/>
                {buscarPac && (
                  <div className="border rounded-lg overflow-hidden max-h-32 overflow-y-auto bg-white shadow-sm">
                    {pacientes.filter(p => `${p.nombre} ${p.apellido1}`.toLowerCase().includes(buscarPac.toLowerCase())).slice(0, 8).map(p => (
                      <button key={p.id} onClick={() => {
                        setForm(prev => ({ ...prev, paciente_id: p.id, cliente_nombre: `${p.nombre} ${p.apellido1} ${p.apellido2 || ''}`.trim(), cliente_email: p.correo || '' }))
                        setBuscarPac('')
                      }} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-0">
                        {p.nombre} {p.apellido1} {p.apellido2 || ''}
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Nombre / Razón Social *</label>
                    <input value={form.cliente_nombre} onChange={e => setForm(p => ({ ...p, cliente_nombre: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">RTN del cliente</label>
                    <input value={form.cliente_rtn} onChange={e => setForm(p => ({ ...p, cliente_rtn: e.target.value }))}
                      placeholder="0000-0000-000000"
                      className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                  </div>
                </div>
              </div>

              {/* ítems */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-gray-600 uppercase">Ítems / Servicios</label>
                  <button onClick={() => setItems(p => [...p, { ...itemVacio }])}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                    <Plus className="w-3.5 h-3.5"/> Agregar línea
                  </button>
                </div>
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b">
                        <th className="px-3 py-2 text-left text-xs text-gray-500">Descripción</th>
                        <th className="px-2 py-2 text-center text-xs text-gray-500 w-16">Cant.</th>
                        <th className="px-2 py-2 text-right text-xs text-gray-500 w-28">P. Unit.</th>
                        <th className="px-2 py-2 text-center text-xs text-gray-500 w-20">ISV %</th>
                        <th className="px-2 py-2 text-right text-xs text-gray-500 w-24">Subtotal</th>
                        <th className="w-8"/>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((it, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1.5">
                            <input value={it.descripcion} onChange={e => recalcularItem(i, 'descripcion', e.target.value)}
                              placeholder="Descripción del servicio…"
                              className="w-full border-0 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5"/>
                          </td>
                          <td className="px-1 py-1.5">
                            <input type="number" min={1} value={it.cantidad} onChange={e => recalcularItem(i, 'cantidad', Number(e.target.value))}
                              className="w-full text-center border-0 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5"/>
                          </td>
                          <td className="px-1 py-1.5">
                            <input type="number" min={0} step="0.01" value={it.precio_unitario} onChange={e => recalcularItem(i, 'precio_unitario', Number(e.target.value))}
                              className="w-full text-right border-0 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5"/>
                          </td>
                          <td className="px-1 py-1.5">
                            <select value={it.isv_pct} onChange={e => recalcularItem(i, 'isv_pct', Number(e.target.value))}
                              disabled={form.exento_isv}
                              className="w-full border-0 text-xs text-center focus:outline-none rounded py-0.5 disabled:opacity-50">
                              <option value={0}>0% Exento</option>
                              <option value={15}>15%</option>
                              <option value={18}>18%</option>
                            </select>
                          </td>
                          <td className="px-2 py-1.5 text-right text-sm font-medium text-gray-700">
                            {fmt(it.subtotal)}
                          </td>
                          <td className="pr-2">
                            {items.length > 1 && (
                              <button onClick={() => setItems(p => p.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">
                                <Trash2 className="w-3.5 h-3.5"/>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* totales */}
                <div className="mt-3 flex justify-end">
                  <div className="w-64 space-y-1 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal</span><span>{fmt(totales.subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>ISV ({form.exento_isv ? 'Exento' : '15%'})</span>
                      <span>{fmt(totales.isv_monto)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-gray-900 text-lg border-t pt-1">
                      <span>TOTAL</span><span className="text-blue-700">{fmt(totales.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t flex gap-3 justify-end">
              <button onClick={() => { setModal(false); resetForm() }} className="px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={guardarFactura} disabled={loading}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin"/> : <CheckCircle className="w-4 h-4"/>}
                Emitir Factura
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL VER / IMPRIMIR ══ */}
      {verFact && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900">Factura {verFact.numero}</h2>
              <div className="flex gap-2">
                <button onClick={() => imprimirFactura(verFact)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">
                  <Printer className="w-4 h-4"/> Imprimir
                </button>
                <button onClick={() => setVerFact(null)} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5"/></button>
              </div>
            </div>
            <div className="px-6 py-5 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-0.5">Cliente</p>
                  <p className="font-semibold">{verFact.cliente_nombre}</p>
                  {verFact.cliente_rtn && <p className="text-xs font-mono text-gray-500">RTN: {verFact.cliente_rtn}</p>}
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-0.5">Fecha / Cajero</p>
                  <p className="font-semibold">{verFact.fecha}</p>
                  <p className="text-xs text-gray-500">{verFact.cajero_nombre}</p>
                </div>
              </div>
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50 border-b">
                    <th className="px-3 py-2 text-left">Descripción</th>
                    <th className="px-2 py-2 text-center">Cant</th>
                    <th className="px-2 py-2 text-right">Subtotal</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {(verFact.items as ItemFactura[]).map((it, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2">{it.descripcion}</td>
                        <td className="px-2 py-2 text-center">{it.cantidad}</td>
                        <td className="px-2 py-2 text-right">{fmt(it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end">
                <div className="w-52 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{fmt(verFact.subtotal)}</span></div>
                  <div className="flex justify-between text-gray-500"><span>ISV</span><span>{fmt(verFact.isv_monto)}</span></div>
                  <div className="flex justify-between font-bold text-gray-900 text-base border-t pt-1"><span>TOTAL</span><span className="text-blue-700">{fmt(verFact.total)}</span></div>
                </div>
              </div>
              {verFact.cai && (
                <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 space-y-0.5">
                  <p><span className="font-semibold text-gray-700">CAI:</span> {verFact.cai}</p>
                  <p><span className="font-semibold text-gray-700">Rango:</span> {verFact.rango_inicio} — {verFact.rango_fin}</p>
                  <p><span className="font-semibold text-gray-700">Fecha límite:</span> {verFact.fecha_limite_cai}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ANULAR (super admin) ══ */}
      {anularFact && esSuperAdmin && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-red-700 flex items-center gap-2">
                <XCircle className="w-5 h-5"/> Anular Factura {anularFact.numero}
              </h2>
              <button onClick={() => setAnularFact(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                <ShieldAlert className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-gray-700">
                  Esta acción quedará registrada en el <strong>historial de auditoría</strong> con tu nombre y el motivo. La factura quedará marcada como <strong>ANULADA</strong>.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                <div><span className="font-medium">Cliente:</span> {anularFact.cliente_nombre}</div>
                <div><span className="font-medium">Total:</span> {fmt(anularFact.total)}</div>
                <div><span className="font-medium">Fecha:</span> {anularFact.fecha}</div>
                <div><span className="font-medium">Cajero:</span> {anularFact.cajero_nombre}</div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-700 uppercase mb-1 block">Motivo de anulación *</label>
                <textarea value={motivoAnulacion} onChange={e => setMotivoAnulacion(e.target.value)} rows={3}
                  placeholder="Ej: Error en datos del cliente, duplicado, precio incorrecto…"
                  className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-300"/>
              </div>
            </div>
            <div className="px-6 py-4 border-t flex gap-3 justify-end">
              <button onClick={() => setAnularFact(null)} className="px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={anularFactura} disabled={loadingAnular || !motivoAnulacion.trim()}
                className="px-5 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center gap-2">
                {loadingAnular && <RefreshCw className="w-3.5 h-3.5 animate-spin"/>}
                <XCircle className="w-3.5 h-3.5" /> Confirmar Anulación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL ELIMINAR (super admin) ══ */}
      {eliminarFact && esSuperAdmin && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border-2 border-gray-800">
            <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-900">
              <h2 className="font-bold text-white flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-400" /> Eliminar Factura {eliminarFact.numero}
              </h2>
              <button onClick={() => setEliminarFact(null)} className="text-gray-400 hover:text-white"><X className="w-5 h-5"/></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-start gap-2 bg-red-50 border-2 border-red-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-red-700">⚠️ Acción IRREVERSIBLE</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    La factura será eliminada permanentemente de la base de datos. Esta operación no se puede deshacer. Solo procede si es absolutamente necesario.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-500 bg-gray-50 rounded-lg p-3">
                <div><span className="font-medium">Número:</span> {eliminarFact.numero}</div>
                <div><span className="font-medium">Total:</span> {fmt(eliminarFact.total)}</div>
                <div><span className="font-medium">Cliente:</span> {eliminarFact.cliente_nombre}</div>
                <div><span className="font-medium">Estado:</span> {eliminarFact.estado}</div>
              </div>
              <div>
                <label className="text-xs font-semibold text-red-700 uppercase mb-1 block">Motivo de eliminación * (quedará en auditoría)</label>
                <textarea value={motivoEliminar} onChange={e => setMotivoEliminar(e.target.value)} rows={3}
                  placeholder="Ej: Factura de prueba, registro duplicado, error de sistema…"
                  className="w-full border-2 border-red-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"/>
              </div>
              <p className="text-xs text-gray-400 text-center">
                Esta eliminación quedará registrada con tu usuario: <strong>{cajeroNombre}</strong>
              </p>
            </div>
            <div className="px-6 py-4 border-t flex gap-3 justify-end">
              <button onClick={() => setEliminarFact(null)} className="px-4 py-2 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={eliminarFactura} disabled={loadingEliminar || !motivoEliminar.trim()}
                className="px-5 py-2 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800 disabled:opacity-50 flex items-center gap-2">
                {loadingEliminar && <RefreshCw className="w-3.5 h-3.5 animate-spin"/>}
                <Trash2 className="w-3.5 h-3.5" /> Eliminar Permanentemente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL DETALLE AUDITORÍA ══ */}
      {verAudit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="font-bold text-gray-900 flex items-center gap-2">
                <History className="w-5 h-5 text-red-600" /> Registro de Auditoría #{verAudit.id}
              </h2>
              <button onClick={() => setVerAudit(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5"/></button>
            </div>
            <div className="px-6 py-5 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-xs text-gray-500 uppercase">Acción</span>
                  <p className={`font-bold mt-0.5 ${verAudit.accion === 'ELIMINADA' ? 'text-gray-800' : 'text-red-700'}`}>{verAudit.accion}</p>
                </div>
                <div><span className="text-xs text-gray-500 uppercase">Factura</span>
                  <p className="font-mono font-medium mt-0.5">{verAudit.numero || `#${verAudit.factura_id}`}</p>
                </div>
                <div><span className="text-xs text-gray-500 uppercase">Usuario</span>
                  <p className="font-medium mt-0.5">{verAudit.usuario_nombre || '—'}</p>
                </div>
                <div><span className="text-xs text-gray-500 uppercase">Fecha y Hora</span>
                  <p className="mt-0.5">{new Date(verAudit.fecha).toLocaleString('es-HN')}</p>
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase block mb-1">Motivo registrado</span>
                <p className="text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-red-800">{verAudit.motivo}</p>
              </div>
              {verAudit.datos_antes && (
                <div>
                  <span className="text-xs text-gray-500 uppercase block mb-1">Datos de la factura al momento del evento</span>
                  <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 border rounded-lg p-3">
                    {(['numero','cliente_nombre','cliente_rtn','fecha','total','estado','cajero_nombre'] as const).map(k => (
                      (verAudit.datos_antes as Record<string, unknown>)[k] != null && (
                        <div key={k}>
                          <span className="text-gray-400 capitalize">{k.replace('_',' ')}: </span>
                          <span className="font-medium text-gray-700">{String((verAudit.datos_antes as Record<string, unknown>)[k])}</span>
                        </div>
                      )
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t flex justify-end">
              <button onClick={() => setVerAudit(null)} className="px-4 py-2 bg-gray-100 rounded-xl text-sm">Cerrar</button>
            </div>
          </div>
        </div>
      )}
      </ModuleContent>
    </ModuleShell>
  )
}
