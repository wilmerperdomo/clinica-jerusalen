'use server'

import { repararPerfilUsuario } from '@/lib/reparar-perfil'
import { obtenerRutaInicioSesion } from '@/lib/ruta-inicio'

export async function asegurarPerfilAlLogin(userId: string, email: string) {
  return repararPerfilUsuario(userId, email)
}

export async function obtenerRutaInicioPostLogin() {
  return obtenerRutaInicioSesion()
}
