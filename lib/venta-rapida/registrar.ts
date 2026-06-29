import type { SupabaseClient } from '@supabase/supabase-js'

import { nombrePaciente } from '@/lib/consultas-utils'
import { construirReferenciaPago, validarFormaPagoCobro } from '@/lib/caja-pago-utils'
import { validarVoucherDuplicadoDia } from '@/lib/caja-voucher-seguridad'
import { descontarStockVenta } from '@/lib/inventario-descuento'
import {
  validarCreditoConPaciente,
  validarDescuento,
  validarItemsVentaCatalogo,
  validarSesionOperacion,
} from '@/lib/caja-seguridad'
import { insertarMovimientoCaja, insertarMovimientosCaja } from '@/lib/caja-movimiento-utils'
import { descuentoEfectivo, type BeneficiosMembresia } from '@/lib/membresia-utils'
import { PREFIJOS_CONCEPTO_VENTA } from '@/lib/venta-rapida/constants'
import { categoriaVenta, pctDescuentoMaximoPaciente } from '@/lib/venta-rapida/descuentos'
import type {
  ConceptoEgreso,
  FormMovimientoVenta,
  PacienteVenta,
  PruebaLabCatalogo,
  ProductoCatalogo,
  ServicioCatalogo,
  SesionVenta,
  VentaRapidaIngresoOk,
  VentaRapidaItem,
} from '@/lib/venta-rapida/types'

export type ResultadoRegistroVentaEgreso = { ok: true } | { ok: false; error: string }
export type ResultadoRegistroVentaIngreso =
  | ({ ok: true } & VentaRapidaIngresoOk)
  | { ok: false; error: string }

interface ContextoVentaIngreso {
  supabase: SupabaseClient
  sesion: SesionVenta
  userId: string
  esAdmin: boolean
  fechaHoy: string
  perfilSucursalId?: number | null
  sucursal?: { tercera_edad?: number; cuarta_edad?: number; por_descuento_tercera?: number; por_descuento_cuarta?: number }
  form: FormMovimientoVenta
  items: VentaRapidaItem[]
  pacientes: PacienteVenta[]
  servicios: ServicioCatalogo[]
  productos: ProductoCatalogo[]
  pruebasLab: PruebaLabCatalogo[]
  beneficios?: BeneficiosMembresia | null
}

export async function registrarVentaRapidaIngreso(
  ctx: ContextoVentaIngreso,
): Promise<ResultadoRegistroVentaIngreso> {
  const errSesion = validarSesionOperacion(ctx.sesion, ctx.userId)
  if (errSesion) return { ok: false, error: errSesion }

  if (ctx.items.length === 0) {
    return { ok: false, error: 'Agregue ítems del catálogo. Las ventas no pueden registrarse con monto manual.' }
  }

  const pacienteId = ctx.form.paciente_id ? Number(ctx.form.paciente_id) : null
  const paciente = ctx.pacientes.find(p => p.id === pacienteId)
  const pacNombre = paciente ? nombrePaciente(paciente) : null

  const errCred = validarCreditoConPaciente(ctx.form.forma_pago, pacienteId)
  if (errCred) return { ok: false, error: errCred }

  const cat = validarItemsVentaCatalogo(ctx.items, ctx.servicios, ctx.productos, ctx.pruebasLab)
  if (!cat.ok) return { ok: false, error: cat.error }

  const pctMax = pctDescuentoMaximoPaciente(ctx.form.paciente_id, ctx.pacientes, ctx.sucursal)
  const valDesc = validarDescuento(
    Number(ctx.form.descuento_pct || 0),
    pctMax,
    ctx.esAdmin,
    ctx.form.nota,
  )
  if (!valDesc.ok) return { ok: false, error: valDesc.error }

  const descPct = valDesc.pctAplicar
  const hora = new Date().toTimeString().slice(0, 5)

  const movBase = {
    sesion_id: ctx.sesion.id,
    sucursal_id: ctx.sesion.sucursal_id,
    cajero_id: ctx.userId,
    tipo: 'INGRESO' as const,
    fecha: ctx.fechaHoy,
    hora,
    forma_pago: ctx.form.forma_pago,
    referencia_pago: construirReferenciaPago(ctx.form.forma_pago, ctx.form.referencia_pago, ctx.form.banco),
    nota: ctx.form.nota || null,
    paciente_id: pacienteId,
    paciente_nombre: pacNombre,
  }

  const motivoEdad = ctx.form.descuento_motivo || (descPct > 0 ? 'Descuento edad' : 'Descuento')
  const movimientos = cat.items.map(item => {
    const bruto = item.precio * item.cantidad
    // Combina descuento por edad con el beneficio de membresía de la categoría del ítem.
    const eff = descuentoEfectivo(categoriaVenta(item.tipo), descPct, motivoEdad, ctx.beneficios)
    const descMonto = eff.pct > 0 ? parseFloat((bruto * eff.pct / 100).toFixed(2)) : 0
    const neto = parseFloat((bruto - descMonto).toFixed(2))
    return {
      ...movBase,
      concepto: `${PREFIJOS_CONCEPTO_VENTA[item.tipo]} — ${item.nombre}`,
      monto_bruto: bruto,
      descuento_pct: eff.pct,
      descuento_monto: descMonto,
      descuento_motivo: eff.motivo || null,
      monto: neto,
    }
  })

  const subtotal = cat.items.reduce((sum, item) => sum + item.precio * item.cantidad, 0)
  const totalNeto = movimientos.reduce((sum, mov) => sum + mov.monto, 0)
  const descuentoMonto = parseFloat((subtotal - totalNeto).toFixed(2))

  const errPago = validarFormaPagoCobro(ctx.form.forma_pago, totalNeto, {
    referencia: ctx.form.referencia_pago,
    banco: ctx.form.banco,
    montoEfectivo: ctx.form.monto_efectivo,
  })
  if (errPago) return { ok: false, error: errPago }

  const errVoucher = await validarVoucherDuplicadoDia(
    ctx.supabase,
    ctx.form.referencia_pago,
    ctx.fechaHoy,
  )
  if (errVoucher) return { ok: false, error: errVoucher }

  const { data: movs, error: errMovs } = await insertarMovimientosCaja(ctx.supabase, movimientos)
  if (errMovs) return { ok: false, error: 'Error al registrar cobro: ' + errMovs.message }

  const { error: errSesUpd } = await ctx.supabase
    .from('caja_sesiones')
    .update({ total_ingresos: (ctx.sesion.total_ingresos || 0) + totalNeto })
    .eq('id', ctx.sesion.id)
    .eq('estado', 'ABIERTA')

  if (errSesUpd) return { ok: false, error: 'Error al actualizar sesión: ' + errSesUpd.message }

  // ── Descontar inventario de los medicamentos vendidos ──
  const itemsStock = cat.items
    .filter(item => item.tipo === 'MEDICAMENTO')
    .map(item => ({ productoId: item.refId, cantidad: item.cantidad, nombre: item.nombre }))
  const movId = (movs?.[0] as { id?: number } | undefined)?.id ?? null
  const resStock = await descontarStockVenta(
    ctx.supabase,
    itemsStock,
    ctx.sesion.sucursal_id ?? ctx.perfilSucursalId ?? null,
    { tipo: 'venta_rapida', id: movId, motivo: 'Venta rápida en caja' },
    ctx.userId,
  )

  if (ctx.form.forma_pago === 'CREDITO' && movs?.[0]) {
    const { error: errCxc } = await ctx.supabase.from('cxc').insert({
      paciente_id: pacienteId,
      paciente_nombre: pacNombre,
      concepto: `Venta rápida — ${cat.items.length} ítem(s)`,
      monto_total: totalNeto,
      monto_pagado: 0,
      saldo: totalNeto,
      movimiento_id: movs[0].id,
      estado: 'PENDIENTE',
      cajero_id: ctx.userId,
      sucursal_id: ctx.sesion.sucursal_id ?? ctx.perfilSucursalId ?? null,
    })
    if (errCxc) return { ok: false, error: 'Error al crear cuenta por cobrar: ' + errCxc.message }
  }

  return {
    ok: true,
    totalNeto,
    subtotal,
    descuentoPct: descPct,
    descuentoMonto,
    items: cat.items.map(item => ({
      key: `${item.tipo}-${item.refId}`,
      tipo: item.tipo,
      nombre: item.nombre,
      precio: item.precio,
      cantidad: item.cantidad,
      refId: item.refId,
    })),
    pacienteId,
    pacienteNombre: pacNombre,
    formaPago: ctx.form.forma_pago,
    paciente: paciente ?? undefined,
    alertasInventario: resStock.alertas,
  }
}

interface ContextoVentaEgreso {
  supabase: SupabaseClient
  sesion: SesionVenta
  userId: string
  form: FormMovimientoVenta
  conceptos: ConceptoEgreso[]
  fechaHoy: string
}

export async function registrarVentaRapidaEgreso(
  ctx: ContextoVentaEgreso,
): Promise<ResultadoRegistroVentaEgreso> {
  const errSesion = validarSesionOperacion(ctx.sesion, ctx.userId)
  if (errSesion) return { ok: false, error: errSesion }

  if (!ctx.form.concepto_id) {
    return { ok: false, error: 'Seleccione un concepto de egreso del catálogo' }
  }

  if (!ctx.form.monto || Number(ctx.form.monto) <= 0) {
    return { ok: false, error: 'Ingrese un monto válido' }
  }

  const concepto = ctx.conceptos.find(c => c.id === Number(ctx.form.concepto_id))?.nombre
  if (!concepto) return { ok: false, error: 'Concepto de egreso no válido' }

  const montoNeto = parseFloat(Number(ctx.form.monto).toFixed(2))
  const hora = new Date().toTimeString().slice(0, 5)

  const { error: errMov } = await insertarMovimientoCaja(ctx.supabase, {
    sesion_id: ctx.sesion.id,
    sucursal_id: ctx.sesion.sucursal_id,
    tipo: 'EGRESO',
    concepto_id: Number(ctx.form.concepto_id),
    concepto,
    monto: montoNeto,
    forma_pago: 'EFECTIVO',
    nota: ctx.form.nota || null,
    cajero_id: ctx.userId,
    fecha: ctx.fechaHoy,
    hora,
  })

  if (errMov) return { ok: false, error: 'Error al registrar egreso: ' + errMov.message }

  const { error: errSesEgr } = await ctx.supabase
    .from('caja_sesiones')
    .update({ total_egresos: (ctx.sesion.total_egresos || 0) + montoNeto })
    .eq('id', ctx.sesion.id)
    .eq('estado', 'ABIERTA')

  if (errSesEgr) return { ok: false, error: 'Error al actualizar sesión: ' + errSesEgr.message }

  return { ok: true }
}
