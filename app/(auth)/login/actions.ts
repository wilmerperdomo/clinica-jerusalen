'use server'

import { repararPerfilUsuario } from '@/lib/reparar-perfil'

export async function asegurarPerfilAlLogin(userId: string, email: string) {
  return repararPerfilUsuario(userId, email)
}
