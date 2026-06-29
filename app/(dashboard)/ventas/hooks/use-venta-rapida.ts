'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import { useConfirm } from '@/components/confirm-dialog'
import { buscarPacientesActivos } from '@/lib/buscar-pacientes'
import { evaluarStockMedicamentos } from '@/lib/medicamento-stock-alerta'
import type { PacienteBusqueda } from '@/components/buscar-paciente-input'
import {
  ajustarCantidadCarrito,
  agregarAlCarrito,
  filtrarCatalogoVenta,
  quitarDelCarrito,
  subtotalCarrito,
} from '@/lib/venta-rapida/catalogo'
import { FORM_MOV_VACIO } from '@/lib/venta-rapida/constants'
import {
  pctDescuentoMaximoPaciente,
  resolverDescuentoPaciente,
  totalVentaConMembresia,
} from '@/lib/venta-rapida/descuentos'
import {
  getMembresiaPaciente,
  tieneBeneficiosMembresia,
  type MembresiasMap,
  type MembresiaPacienteInfo,
} from '@/lib/membresia-utils'
import { registrarVentaRapidaEgreso, registrarVentaRapidaIngreso } from '@/lib/venta-rapida/registrar'
import type {
  ConceptoEgreso,
  DescuentoVentaInfo,
  FormMovimientoVenta,
  PruebaLabCatalogo,
  ProductoCatalogo,
  ServicioCatalogo,
  SesionVenta,
  SucursalVenta,
  TabCatalogoVenta,
  VentaRapidaIngresoOk,
  VentaRapidaItem,
} from '@/lib/venta-rapida/types'

interface UseVentaRapidaParams {
  supabase: SupabaseClient
  sesion: SesionVenta | null
  userId: string
  esAdmin: boolean
  fechaHoy: string
  perfilSucursalId?: number | null
  sucursalActiva?: SucursalVenta
  pacientesIniciales: PacienteBusqueda[]
  servicios: ServicioCatalogo[]
  productos: ProductoCatalogo[]
  pruebasLab: PruebaLabCatalogo[]
  conceptos: ConceptoEgreso[]
  membresiasMap?: MembresiasMap
  onIngresoExitoso?: (data: VentaRapidaIngresoOk) => void
  onEgresoExitoso?: () => void
}

export function useVentaRapida({
  supabase,
  sesion,
  userId,
  esAdmin,
  fechaHoy,
  perfilSucursalId,
  sucursalActiva,
  pacientesIniciales,
  servicios,
  productos,
  pruebasLab,
  conceptos,
  membresiasMap,
  onIngresoExitoso,
  onEgresoExitoso,
}: UseVentaRapidaParams) {
  const [abierto, setAbierto] = useState(false)
  const [form, setForm] = useState<FormMovimientoVenta>(FORM_MOV_VACIO)
  const [items, setItems] = useState<VentaRapidaItem[]>([])
  const [busquedaCatalogo, setBusquedaCatalogo] = useState('')
  const [tabCatalogo, setTabCatalogo] = useState<TabCatalogoVenta>('servicios')
  const [pacientesExtra, setPacientesExtra] = useState<PacienteBusqueda[]>([])
  const [descuentoInfo, setDescuentoInfo] = useState<DescuentoVentaInfo | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [alertasStock, setAlertasStock] = useState<string[]>([])
  const confirmDialog = useConfirm()

  const pacientes = useMemo(() => {
    const map = new Map<number, PacienteBusqueda>()
    for (const p of pacientesIniciales) map.set(p.id, p)
    for (const p of pacientesExtra) map.set(p.id, p)
    return [...map.values()]
  }, [pacientesIniciales, pacientesExtra])

  const buscarPacienteRemoto = useCallback(
    (termino: string) => buscarPacientesActivos(supabase, termino),
    [supabase],
  )

  const registrarPaciente = useCallback((p: PacienteBusqueda) => {
    setPacientesExtra(prev => {
      if (prev.some(x => x.id === p.id) || pacientesIniciales.some(x => x.id === p.id)) return prev
      return [...prev, p]
    })
  }, [pacientesIniciales])

  const resultadosCatalogo = useMemo(
    () => filtrarCatalogoVenta(tabCatalogo, busquedaCatalogo, servicios, productos, pruebasLab),
    [tabCatalogo, busquedaCatalogo, servicios, productos, pruebasLab],
  )

  const subtotal = useMemo(() => subtotalCarrito(items), [items])

  const membInfo: MembresiaPacienteInfo | null = useMemo(
    () => getMembresiaPaciente(form.paciente_id ? Number(form.paciente_id) : null, membresiasMap),
    [form.paciente_id, membresiasMap],
  )
  const membActiva = useMemo(() => tieneBeneficiosMembresia(membInfo?.estructurados), [membInfo])

  const total = useMemo(() => {
    const pctMax = pctDescuentoMaximoPaciente(form.paciente_id, pacientes, sucursalActiva)
    const pctEdad = Math.min(Number(form.descuento_pct) || 0, esAdmin ? 100 : pctMax)
    return totalVentaConMembresia(
      items, pctEdad, form.descuento_motivo || 'Descuento', membInfo?.estructurados,
    ).total
  }, [items, subtotal, form.descuento_pct, form.descuento_motivo, form.paciente_id, pacientes, sucursalActiva, esAdmin, membInfo])

  const puedeConfirmar = form.tipo === 'EGRESO'
    ? Boolean(form.monto && Number(form.monto) > 0 && form.concepto_id)
    : items.length > 0 && total > 0

  useEffect(() => {
    if (!abierto || form.tipo !== 'INGRESO') {
      setAlertasStock([])
      return
    }
    const meds = items.filter(i => i.tipo === 'MEDICAMENTO' && i.refId > 0)
    if (!meds.length) {
      setAlertasStock([])
      return
    }
    let cancel = false
    void (async () => {
      const res = await evaluarStockMedicamentos(
        supabase,
        meds.map(m => ({ productoId: m.refId, cantidad: m.cantidad, nombre: m.nombre })),
        perfilSucursalId ?? sesion?.sucursal_id ?? null,
      )
      if (!cancel) setAlertasStock(res.mensajes)
    })()
    return () => { cancel = true }
  }, [abierto, form.tipo, items, supabase, perfilSucursalId, sesion?.sucursal_id])

  const abrir = useCallback((tipo: FormMovimientoVenta['tipo'] = 'INGRESO') => {
    setForm({ ...FORM_MOV_VACIO, tipo })
    setDescuentoInfo(null)
    setBusquedaCatalogo('')
    setItems([])
    setTabCatalogo('servicios')
    setAbierto(true)
  }, [])

  const cerrar = useCallback(() => {
    setAbierto(false)
    setForm(FORM_MOV_VACIO)
    setDescuentoInfo(null)
    setBusquedaCatalogo('')
    setItems([])
    setTabCatalogo('servicios')
  }, [])

  const seleccionarPaciente = useCallback((pacienteId: string, pacienteDirecto?: PacienteBusqueda) => {
    if (!pacienteId) {
      setDescuentoInfo(null)
      setForm(prev => ({
        ...prev,
        paciente_id: '',
        descuento_pct: '0',
        descuento_motivo: '',
        descuento_confirmado: false,
      }))
      return
    }

    if (pacienteDirecto) {
      setPacientesExtra(prev => {
        if (prev.some(x => x.id === pacienteDirecto.id) || pacientesIniciales.some(x => x.id === pacienteDirecto.id)) {
          return prev
        }
        return [...prev, pacienteDirecto]
      })
    }

    if (!sesion) {
      setDescuentoInfo(null)
      setForm(prev => ({ ...prev, paciente_id: pacienteId }))
      return
    }

    const { descuento, formPatch } = resolverDescuentoPaciente(
      pacienteId,
      pacientes,
      sucursalActiva,
      pacienteDirecto,
    )
    setDescuentoInfo(descuento)
    setForm(prev => ({ ...prev, paciente_id: pacienteId, ...formPatch }))
  }, [sesion, pacientes, pacientesIniciales, sucursalActiva])

  const agregarItem = useCallback((item: Omit<VentaRapidaItem, 'key' | 'cantidad'> & { cantidad?: number }) => {
    setItems(prev => agregarAlCarrito(prev, item))
    setBusquedaCatalogo('')
    setForm(prev => ({ ...prev, concepto_id: '', concepto_libre: '', monto: '' }))
  }, [])

  const confirmar = useCallback(async () => {
    if (!sesion) return

    if (form.tipo === 'INGRESO' && alertasStock.length > 0) {
      const { confirmed } = await confirmDialog({
        title: 'Aviso de inventario',
        message: `${alertasStock.join('\n\n')}\n\n¿Desea continuar con la venta de todas formas?`,
        variant: 'warning',
        confirmLabel: 'Continuar venta',
      })
      if (!confirmed) return
    }

    setGuardando(true)

    try {
    const resultado = form.tipo === 'INGRESO'
      ? await registrarVentaRapidaIngreso({
          supabase,
          sesion,
          userId,
          esAdmin,
          fechaHoy,
          perfilSucursalId,
          sucursal: sucursalActiva,
          form,
          items,
          pacientes,
          servicios,
          productos,
          pruebasLab,
          beneficios: membInfo?.estructurados ?? null,
        })
      : await registrarVentaRapidaEgreso({
          supabase,
          sesion,
          userId,
          form,
          conceptos,
          fechaHoy,
        })

    if (!resultado.ok) {
      alert(resultado.error)
      return
    }

    cerrar()

    if (form.tipo === 'INGRESO') {
      onIngresoExitoso?.(resultado)
    } else {
      onEgresoExitoso?.()
    }
    } catch (e) {
      console.error('venta rapida confirmar:', e)
      alert('Error inesperado al registrar la venta.')
    } finally {
      setGuardando(false)
    }
  }, [
    sesion, form, items, pacientes, servicios, productos, pruebasLab, conceptos,
    supabase, userId, esAdmin, fechaHoy, perfilSucursalId, sucursalActiva, cerrar,
    membInfo, onIngresoExitoso, onEgresoExitoso, alertasStock, confirmDialog,
  ])

  return {
    abierto,
    abrir,
    cerrar,
    confirmar,
    guardando,
    alertasStock,
    form,
    setForm,
    items,
    agregarItem,
    quitarItem: (key: string) => setItems(prev => quitarDelCarrito(prev, key)),
    ajustarCantidad: (key: string, delta: number) => setItems(prev => ajustarCantidadCarrito(prev, key, delta)),
    busquedaCatalogo,
    setBusquedaCatalogo,
    tabCatalogo,
    setTabCatalogo,
    resultadosCatalogo,
    pacientes,
    buscarPacienteRemoto,
    registrarPaciente,
    seleccionarPaciente,
    descuentoInfo,
    membInfo,
    membActiva,
    subtotal,
    total,
    puedeConfirmar,
  }
}
