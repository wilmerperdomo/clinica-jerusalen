import { redirect } from 'next/navigation'
import { getPerfilSucursal, getModulosPermitidos } from '@/lib/get-sucursal'
import { esRolEnfermeria, esRolMedico } from '@/lib/consultas-utils'

const MODULOS_PRECIOS = ['ventas', 'laboratorio', 'productos', 'inventario', 'cotizaciones']

/** Mapea pathname del dashboard a clave de módulo en BD */
export function claveModuloDesdePath(pathname: string): string | null {
  if (!pathname || pathname === '/') return 'dashboard'
  const segment = pathname.split('/').filter(Boolean)[0] ?? ''
  if (!segment) return 'dashboard'
  if (segment === 'agentes') return 'agentes_ia'
  if (segment === 'colonias') return 'pacientes'
  if (segment === 'bancos') return 'ventas'
  if (segment === 'precios') return 'precios'
  if (segment === 'auditoria') return 'auditoria'
  return segment
}

export async function verificarAccesoModulo(pathname: string): Promise<void> {
  const clave = claveModuloDesdePath(pathname)
  if (!clave) return

  const perfil = await getPerfilSucursal()
  if (!perfil.userId) redirect('/login')

  if (clave === 'auditoria') {
    if (!perfil.esSuperAdmin) redirect('/')
    return
  }

  if (clave === 'usuarios') {
    if (!perfil.esAdmin && !perfil.esSuperAdmin) redirect('/')
    return
  }

  if (clave === 'fidelidad') {
    if (!perfil.esAdmin && !perfil.esSuperAdmin) redirect('/')
    return
  }

  const modulos = await getModulosPermitidos(perfil.rolId, perfil.esSuperAdmin, perfil.esAdmin)

  if (clave === 'precios') {
    const ok = perfil.esSuperAdmin || perfil.esAdmin
      || MODULOS_PRECIOS.some(m => modulos.includes(m))
    if (!ok) redirect('/')
    return
  }

  if (clave === 'reportes') {
    if (!perfil.esSuperAdmin && (esRolEnfermeria(perfil.rol) || esRolMedico(perfil.rol))) {
      redirect('/')
    }
    if (!perfil.esSuperAdmin && !perfil.esAdmin && !modulos.includes('reportes')) {
      redirect('/')
    }
    return
  }

  if (clave === 'control-financiero') {
    if (!perfil.esSuperAdmin && !perfil.esAdmin && !modulos.includes('control-financiero')) {
      redirect('/')
    }
    return
  }

  if (clave === 'configuracion') {
    if (!perfil.esSuperAdmin && !modulos.includes('configuracion')) redirect('/')
    return
  }

  if (clave === 'promociones') {
    if (!perfil.esSuperAdmin && !perfil.esAdmin && !modulos.includes('promociones')) redirect('/')
    return
  }

  if (clave === 'agentes_ia') {
    if (!perfil.esSuperAdmin && !perfil.esAdmin && !modulos.includes('agentes_ia')) redirect('/')
    return
  }

  if (perfil.esSuperAdmin) return

  if (modulos.length === 0) redirect('/')

  if (!modulos.includes(clave)) redirect('/')
}
