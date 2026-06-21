import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilSucursal, getModulosPermitidos } from '@/lib/get-sucursal'
import PreciosClient from './precios-client'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Consulta de Precios' }

// Módulos cuyo acceso habilita la consulta de precios (personal de mostrador)
const MODULOS_PRECIOS = ['ventas', 'laboratorio', 'productos', 'inventario', 'cotizaciones']

export default async function PreciosPage() {
  const supabase = await createClient()
  const perfil = await getPerfilSucursal()
  const modulos = await getModulosPermitidos(perfil.rolId, perfil.esSuperAdmin, perfil.esAdmin)

  const acceso = perfil.esSuperAdmin || perfil.esAdmin
    || MODULOS_PRECIOS.some(m => modulos.includes(m))
  if (!acceso) redirect('/')

  const [productosRes, serviciosRes, pruebasRes, listasRes, labValoresRes] = await Promise.all([
    supabase
      .from('productos')
      .select('id, codigo, nombre, nombre_generico, categoria, unidad, tipo, precio_venta')
      .eq('activo', true)
      .order('nombre')
      .limit(3000),
    supabase
      .from('servicios')
      .select('id, nombre, tipo, precio')
      .eq('activo', true)
      .order('nombre')
      .limit(1000),
    supabase
      .from('laboratorio_info')
      .select('id, nombre, costo, es_panel')
      .eq('activo', true)
      .order('nombre')
      .limit(3000),
    supabase.from('listas_precio').select('id, nombre').eq('activo', true).order('id'),
    supabase.from('laboratorio_valor').select('id_prueba, id_lista, valor'),
  ])

  // Mapa precio por lista de precios (convenio): preciosLista[listaId][pruebaId]
  const preciosLista: Record<number, Record<number, number>> = {}
  for (const v of labValoresRes.data ?? []) {
    const lista = Number(v.id_lista)
    const prueba = Number(v.id_prueba)
    const valor = Number(v.valor)
    if (!lista || !prueba) continue
    if (!preciosLista[lista]) preciosLista[lista] = {}
    preciosLista[lista][prueba] = valor
  }

  return (
    <PreciosClient
      productos={productosRes.data ?? []}
      servicios={serviciosRes.data ?? []}
      pruebas={pruebasRes.data ?? []}
      listas={listasRes.data ?? []}
      preciosLista={preciosLista}
    />
  )
}
