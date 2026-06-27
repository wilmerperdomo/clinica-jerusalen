/** Utilidades profesionales para inventario, productos y reposición. */

export type ProductoPro = {
  id: number
  codigo: string
  nombre: string
  nombre_generico?: string | null
  laboratorio?: string | null
  categoria?: string | null
  unidad?: string | null
  tipo?: string | null
  costo: number
  precio_venta: number
  precio_minimo?: number | null
  stock_minimo: number
  activo: boolean
  codigo_barra?: string | null
  principio_activo?: string | null
  concentracion?: string | null
  presentacion?: string | null
  marca?: string | null
  requiere_receta?: boolean
  es_controlado?: boolean
  gravado?: boolean
  facturable?: boolean
  proveedor_preferido_id?: number | null
  dias_reposicion?: number | null
}

export type StockPro = {
  id: number
  producto_id: number
  sucursal_id: number
  lote?: string | null
  fecha_vencimiento?: string | null
  cantidad: number
  costo_unitario?: number | null
  bloqueado?: boolean
  producto?: Pick<ProductoPro, 'id' | 'codigo' | 'nombre' | 'stock_minimo' | 'unidad' | 'costo' | 'precio_venta' | 'precio_minimo' | 'proveedor_preferido_id' | 'dias_reposicion'>
  sucursal?: { id: number; nombre: string }
}

export type MovimientoInventarioPro = {
  id: number
  producto_id?: number
  sucursal_id?: number
  tipo: string
  cantidad: number
  fecha?: string
  created_at?: string
  referencia_tipo?: string | null
  producto?: { nombre: string; codigo: string }
}

export type AlertaInventario = {
  id: string
  prioridad: 'alta' | 'media' | 'baja'
  tipo: 'STOCK_BAJO' | 'VENCIDO' | 'POR_VENCER' | 'SIN_MOVIMIENTO' | 'BAJO_COSTO' | 'LOTE_BLOQUEADO'
  titulo: string
  descripcion: string
  productoId?: number
  sucursalId?: number
  accion: string
}

export type SugerenciaReposicion = {
  producto_id: number
  sucursal_id?: number
  producto: string
  codigo: string
  proveedor_id?: number | null
  stock_actual: number
  stock_minimo: number
  venta_promedio_30: number
  dias_reposicion: number
  cantidad_sugerida: number
  motivo: string
}

export type MargenProducto = {
  producto_id: number
  codigo: string
  nombre: string
  costo: number
  precio: number
  precio_minimo: number
  margen: number
  margen_pct: number | null
  bajo_costo: boolean
  bajo_minimo: boolean
}

export type ResumenInventarioPro = {
  stockTotal: number
  valorCosto: number
  valorVenta: number
  utilidadPotencial: number
  lotesVencidos: number
  lotesPorVencer: number
  productosStockBajo: number
  margenPromedio: number | null
}

export function fmtInv(n: number) {
  return `L. ${Number(n || 0).toLocaleString('es-HN', { minimumFractionDigits: 2 })}`
}

export function diasHasta(fecha?: string | null): number | null {
  if (!fecha) return null
  return Math.ceil((new Date(fecha).getTime() - Date.now()) / 86400000)
}

export function calcularMargenProducto(p: ProductoPro): MargenProducto {
  const costo = Number(p.costo || 0)
  const precio = Number(p.precio_venta || 0)
  const precioMinimo = Number(p.precio_minimo || 0)
  const margen = precio - costo
  return {
    producto_id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    costo,
    precio,
    precio_minimo: precioMinimo,
    margen,
    margen_pct: precio > 0 ? Math.round((margen / precio) * 1000) / 10 : null,
    bajo_costo: precio > 0 && precio < costo,
    bajo_minimo: precioMinimo > 0 && precio < precioMinimo,
  }
}

export function calcularResumenInventario(stock: StockPro[], productos: ProductoPro[]): ResumenInventarioPro {
  const prodMap = new Map(productos.map(p => [p.id, p]))
  let stockTotal = 0
  let valorCosto = 0
  let valorVenta = 0
  let lotesVencidos = 0
  let lotesPorVencer = 0

  const totalPorProducto = new Map<number, number>()
  for (const row of stock) {
    const cantidad = Number(row.cantidad || 0)
    if (cantidad <= 0) continue
    const p = row.producto ?? prodMap.get(row.producto_id)
    stockTotal += cantidad
    valorCosto += cantidad * Number(row.costo_unitario || p?.costo || 0)
    valorVenta += cantidad * Number(p?.precio_venta || 0)
    totalPorProducto.set(row.producto_id, (totalPorProducto.get(row.producto_id) || 0) + cantidad)

    const dias = diasHasta(row.fecha_vencimiento)
    if (dias !== null && dias < 0) lotesVencidos++
    else if (dias !== null && dias <= 90) lotesPorVencer++
  }

  const productosStockBajo = Array.from(totalPorProducto.entries())
    .filter(([id, cant]) => cant <= Number((prodMap.get(id)?.stock_minimo ?? 5)))
    .length

  const margenes = productos
    .filter(p => p.activo && Number(p.precio_venta) > 0)
    .map(calcularMargenProducto)
    .filter(m => m.margen_pct !== null) as (MargenProducto & { margen_pct: number })[]

  const margenPromedio = margenes.length
    ? Math.round((margenes.reduce((s, m) => s + m.margen_pct, 0) / margenes.length) * 10) / 10
    : null

  return {
    stockTotal,
    valorCosto,
    valorVenta,
    utilidadPotencial: valorVenta - valorCosto,
    lotesVencidos,
    lotesPorVencer,
    productosStockBajo,
    margenPromedio,
  }
}

export function generarAlertasInventario(opts: {
  stock: StockPro[]
  productos: ProductoPro[]
  movimientos: MovimientoInventarioPro[]
  diasVencimiento?: number
  diasSinMovimiento?: number
}): AlertaInventario[] {
  const diasVenc = opts.diasVencimiento ?? 90
  const diasSinMov = opts.diasSinMovimiento ?? 60
  const alertas: AlertaInventario[] = []
  const stockPorProdSuc = new Map<string, { cantidad: number; producto?: ProductoPro; sucursal?: StockPro['sucursal']; productoId: number; sucursalId: number }>()

  for (const r of opts.stock) {
    const p = r.producto ?? opts.productos.find(x => x.id === r.producto_id)
    const key = `${r.producto_id}-${r.sucursal_id}`
    const entry = stockPorProdSuc.get(key) ?? {
      cantidad: 0,
      producto: p,
      sucursal: r.sucursal,
      productoId: r.producto_id,
      sucursalId: r.sucursal_id,
    }
    entry.cantidad += Number(r.cantidad || 0)
    stockPorProdSuc.set(key, entry)

    const dias = diasHasta(r.fecha_vencimiento)
    if (Number(r.cantidad) > 0 && dias !== null && dias < 0) {
      alertas.push({
        id: `venc-${r.id}`,
        prioridad: 'alta',
        tipo: 'VENCIDO',
        titulo: `${p?.nombre ?? 'Producto'} vencido`,
        descripcion: `Lote ${r.lote || 'sin lote'} venció hace ${Math.abs(dias)} día(s).`,
        productoId: r.producto_id,
        sucursalId: r.sucursal_id,
        accion: 'Bloquear lote y retirar de venta',
      })
    } else if (Number(r.cantidad) > 0 && dias !== null && dias <= diasVenc) {
      alertas.push({
        id: `por-venc-${r.id}`,
        prioridad: dias <= 30 ? 'alta' : 'media',
        tipo: 'POR_VENCER',
        titulo: `${p?.nombre ?? 'Producto'} por vencer`,
        descripcion: `Lote ${r.lote || 'sin lote'} vence en ${dias} día(s). Existencia: ${r.cantidad}.`,
        productoId: r.producto_id,
        sucursalId: r.sucursal_id,
        accion: 'Vender primero o transferir a sucursal con más rotación',
      })
    }

    if (r.bloqueado && Number(r.cantidad) > 0) {
      alertas.push({
        id: `bloq-${r.id}`,
        prioridad: 'alta',
        tipo: 'LOTE_BLOQUEADO',
        titulo: `${p?.nombre ?? 'Producto'} bloqueado`,
        descripcion: `Lote ${r.lote || 'sin lote'} está bloqueado y aún tiene ${r.cantidad} unidad(es).`,
        productoId: r.producto_id,
        sucursalId: r.sucursal_id,
        accion: 'Revisar motivo de bloqueo',
      })
    }
  }

  for (const entry of stockPorProdSuc.values()) {
    const minimo = Number(entry.producto?.stock_minimo ?? 5)
    if (entry.cantidad <= minimo) {
      alertas.push({
        id: `stock-${entry.productoId}-${entry.sucursalId}`,
        prioridad: entry.cantidad <= 0 ? 'alta' : 'media',
        tipo: 'STOCK_BAJO',
        titulo: `${entry.producto?.nombre ?? 'Producto'} con stock bajo`,
        descripcion: `${entry.sucursal?.nombre ?? 'Sucursal'}: ${entry.cantidad} disponible(s), mínimo ${minimo}.`,
        productoId: entry.productoId,
        sucursalId: entry.sucursalId,
        accion: 'Generar reposición o transferir desde otra sucursal',
      })
    }
  }

  const ultimaSalida = new Map<number, number>()
  for (const m of opts.movimientos) {
    const prodId = m.producto_id
    if (!prodId || !['SALIDA', 'VENTA', 'CONSUMO'].includes(m.tipo)) continue
    const fecha = new Date(m.fecha || m.created_at || '').getTime()
    if (!Number.isFinite(fecha)) continue
    ultimaSalida.set(prodId, Math.max(ultimaSalida.get(prodId) || 0, fecha))
  }
  for (const p of opts.productos.filter(x => x.activo)) {
    const last = ultimaSalida.get(p.id)
    const dias = last ? Math.floor((Date.now() - last) / 86400000) : null
    if (dias === null || dias >= diasSinMov) {
      alertas.push({
        id: `sinmov-${p.id}`,
        prioridad: 'baja',
        tipo: 'SIN_MOVIMIENTO',
        titulo: `${p.nombre} sin rotación`,
        descripcion: dias === null ? 'No tiene salidas registradas.' : `Sin salidas en ${dias} día(s).`,
        productoId: p.id,
        accion: 'Revisar si conviene reponer, promocionar o dejar de comprar',
      })
    }
  }

  for (const m of opts.productos.map(calcularMargenProducto)) {
    if (m.bajo_costo || m.bajo_minimo) {
      alertas.push({
        id: `margen-${m.producto_id}`,
        prioridad: m.bajo_costo ? 'alta' : 'media',
        tipo: 'BAJO_COSTO',
        titulo: `${m.nombre} con precio riesgoso`,
        descripcion: `Costo ${fmtInv(m.costo)}, venta ${fmtInv(m.precio)}${m.precio_minimo ? `, mínimo ${fmtInv(m.precio_minimo)}` : ''}.`,
        productoId: m.producto_id,
        accion: 'Actualizar precio o autorizar excepción',
      })
    }
  }

  const orden = { alta: 0, media: 1, baja: 2 }
  return alertas.sort((a, b) => orden[a.prioridad] - orden[b.prioridad])
}

export function sugerirReposicion(opts: {
  stock: StockPro[]
  productos: ProductoPro[]
  movimientos: MovimientoInventarioPro[]
  sucursalId?: number | null
}): SugerenciaReposicion[] {
  const ventas30 = new Map<string, number>()
  const desde = Date.now() - 30 * 86400000
  for (const m of opts.movimientos) {
    if (!m.producto_id || !m.sucursal_id || !['SALIDA', 'VENTA', 'CONSUMO'].includes(m.tipo)) continue
    const fecha = new Date(m.fecha || m.created_at || '').getTime()
    if (!Number.isFinite(fecha) || fecha < desde) continue
    const key = `${m.producto_id}-${m.sucursal_id}`
    ventas30.set(key, (ventas30.get(key) || 0) + Math.abs(Number(m.cantidad || 0)))
  }

  const stockMap = new Map<string, number>()
  for (const s of opts.stock) {
    if (opts.sucursalId && s.sucursal_id !== opts.sucursalId) continue
    const key = `${s.producto_id}-${s.sucursal_id}`
    stockMap.set(key, (stockMap.get(key) || 0) + Number(s.cantidad || 0))
  }

  const out: SugerenciaReposicion[] = []
  for (const [key, stockActual] of stockMap) {
    const [prodIdRaw, sucIdRaw] = key.split('-')
    const prodId = Number(prodIdRaw)
    const sucId = Number(sucIdRaw)
    const p = opts.productos.find(x => x.id === prodId)
    if (!p || !p.activo) continue
    const minimo = Number(p.stock_minimo || 0)
    const ventaPromedio30 = ventas30.get(key) || 0
    const diasRep = Number(p.dias_reposicion || 7)
    const puntoPedido = minimo + Math.ceil((ventaPromedio30 / 30) * diasRep)
    if (stockActual <= puntoPedido) {
      const cantidadSugerida = Math.max(minimo * 2, puntoPedido + Math.ceil(ventaPromedio30 / 2)) - stockActual
      out.push({
        producto_id: prodId,
        sucursal_id: sucId,
        producto: p.nombre,
        codigo: p.codigo,
        proveedor_id: p.proveedor_preferido_id,
        stock_actual: stockActual,
        stock_minimo: minimo,
        venta_promedio_30: ventaPromedio30,
        dias_reposicion: diasRep,
        cantidad_sugerida: Math.max(1, Math.ceil(cantidadSugerida)),
        motivo: stockActual <= minimo ? 'Stock bajo' : 'Punto de reposición alcanzado',
      })
    }
  }
  return out.sort((a, b) => b.cantidad_sugerida - a.cantidad_sugerida)
}

export function topProductosPorMovimiento(movs: MovimientoInventarioPro[], limite = 10) {
  const map = new Map<number, { producto_id: number; nombre: string; codigo: string; cantidad: number }>()
  for (const m of movs) {
    if (!m.producto_id || !['SALIDA', 'VENTA', 'CONSUMO'].includes(m.tipo)) continue
    const entry = map.get(m.producto_id) ?? {
      producto_id: m.producto_id,
      nombre: m.producto?.nombre ?? `Producto #${m.producto_id}`,
      codigo: m.producto?.codigo ?? '',
      cantidad: 0,
    }
    entry.cantidad += Math.abs(Number(m.cantidad || 0))
    map.set(m.producto_id, entry)
  }
  return Array.from(map.values()).sort((a, b) => b.cantidad - a.cantidad).slice(0, limite)
}
