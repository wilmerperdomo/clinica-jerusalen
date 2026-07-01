import type { SupabaseClient } from '@supabase/supabase-js'

export type RpcResult<T> = { ok: true; data: T } | { ok: false; error: string }

function rpcError(msg: string | null | undefined): string {
  return msg || 'Error desconocido en operación financiera'
}

/** Abono atómico a CXC: movimiento caja + abono + actualización saldo */
export async function rpcRegistrarAbonoCxc(
  sb: SupabaseClient,
  params: {
    cxc_id: number
    sesion_id: number
    sucursal_id: number
    monto: number
    forma_pago: string
    nota: string | null
    fecha: string
    hora: string
    concepto: string
    paciente_id: number | null
    paciente_nombre: string | null
    referencia_pago?: string | null
  },
): Promise<RpcResult<{ abono_id: number; monto_pagado: number; saldo: number; estado: string }>> {
  const { data, error } = await sb.rpc('fn_registrar_abono_cxc', {
    p_cxc_id: params.cxc_id,
    p_sesion_id: params.sesion_id,
    p_sucursal_id: params.sucursal_id,
    p_monto: params.monto,
    p_forma_pago: params.forma_pago,
    p_nota: params.nota,
    p_fecha: params.fecha,
    p_hora: params.hora,
    p_concepto: params.concepto,
    p_paciente_id: params.paciente_id,
    p_paciente_nombre: params.paciente_nombre,
    p_referencia_pago: params.referencia_pago ?? null,
  })
  if (error) return { ok: false, error: rpcError(error.message) }
  const row = data as Record<string, unknown>
  return {
    ok: true,
    data: {
      abono_id: Number(row.abono_id),
      monto_pagado: Number(row.monto_pagado),
      saldo: Number(row.saldo),
      estado: String(row.estado),
    },
  }
}

/** Abono atómico a CXP: abono + saldo + egreso caja opcional */
export async function rpcRegistrarAbonoCxp(
  sb: SupabaseClient,
  params: {
    cxp_id: number
    monto: number
    forma_pago?: string
    nota?: string | null
    cajero_nombre?: string | null
    sucursal_id?: number | null
    sesion_id?: number | null
    registrar_caja?: boolean
    fecha: string
    hora: string
  },
): Promise<RpcResult<{ abono_id: number; monto_pagado: number; saldo: number; estado: string }>> {
  const { data, error } = await sb.rpc('fn_registrar_abono_cxp', {
    p_cxp_id: params.cxp_id,
    p_monto: params.monto,
    p_forma_pago: params.forma_pago ?? 'EFECTIVO',
    p_nota: params.nota ?? null,
    p_cajero_nombre: params.cajero_nombre ?? null,
    p_sucursal_id: params.sucursal_id ?? null,
    p_sesion_id: params.sesion_id ?? null,
    p_registrar_caja: params.registrar_caja ?? false,
    p_fecha: params.fecha,
    p_hora: params.hora,
  })
  if (error) return { ok: false, error: rpcError(error.message) }
  const row = data as Record<string, unknown>
  return {
    ok: true,
    data: {
      abono_id: Number(row.abono_id),
      monto_pagado: Number(row.monto_pagado),
      saldo: Number(row.saldo),
      estado: String(row.estado),
    },
  }
}

/** Crear CXC tras cobro a crédito con varios movimientos (consulta) */
export async function rpcCrearCxcCredito(
  sb: SupabaseClient,
  params: {
    paciente_id: number | null
    paciente_nombre: string | null
    concepto: string
    monto_total: number
    fecha: string
    sucursal_id?: number | null
    movimiento_id?: number | null
  },
): Promise<RpcResult<{ cxc_id: number }>> {
  const { data, error } = await sb.rpc('fn_crear_cxc_credito', {
    p_paciente_id: params.paciente_id,
    p_paciente_nombre: params.paciente_nombre,
    p_concepto: params.concepto,
    p_monto_total: params.monto_total,
    p_fecha: params.fecha,
    p_sucursal_id: params.sucursal_id ?? null,
    p_movimiento_id: params.movimiento_id ?? null,
  })
  if (error) return { ok: false, error: rpcError(error.message) }
  const row = data as Record<string, unknown>
  return { ok: true, data: { cxc_id: Number(row.cxc_id) } }
}

/** Ingreso CREDITO + CXC atómico (un solo movimiento: lab, cotización) */
export async function rpcRegistrarIngresoCreditoCxc(
  sb: SupabaseClient,
  params: {
    movimiento: Record<string, unknown>
    cxc_concepto: string
    paciente_id?: number | null
    paciente_nombre?: string | null
    sucursal_id?: number | null
  },
): Promise<RpcResult<{ movimiento_id: number; cxc_id: number }>> {
  const { data, error } = await sb.rpc('fn_registrar_ingreso_credito_cxc', {
    p_movimiento: params.movimiento,
    p_cxc_concepto: params.cxc_concepto,
    p_paciente_id: params.paciente_id ?? null,
    p_paciente_nombre: params.paciente_nombre ?? null,
    p_sucursal_id: params.sucursal_id ?? null,
  })
  if (error) return { ok: false, error: rpcError(error.message) }
  const row = data as Record<string, unknown>
  return {
    ok: true,
    data: {
      movimiento_id: Number(row.movimiento_id),
      cxc_id: Number(row.cxc_id),
    },
  }
}
