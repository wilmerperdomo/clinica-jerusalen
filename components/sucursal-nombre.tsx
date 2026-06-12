'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  inicial?: string
  className?: string
}

/** Lee sucursal directo del navegador (siempre funciona con sesión activa) */
export default function SucursalNombre({ inicial = '', className = '' }: Props) {
  const [nombre, setNombre] = useState(inicial)

  useEffect(() => {
    const sb = createClient()
    ;(async () => {
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return

      let p: { sucursal_id?: number | null; rol_id?: number | null } | null = null
      const { data: p1 } = await sb
        .from('perfiles')
        .select('sucursal_id, rol_id')
        .eq('id', user.id)
        .maybeSingle()
      p = p1

      if (!p) {
        const { data: pri } = await sb.from('sucursales').select('nombre').order('id').limit(1).maybeSingle()
        if (pri?.nombre) setNombre(pri.nombre)
        return
      }

      if (p.rol_id) {
        let rol: { nombre?: string; es_super_admin?: boolean } | null = null
        const r1 = await sb.from('roles').select('nombre, es_super_admin').eq('id', p.rol_id).maybeSingle()
        if (!r1.error && r1.data) rol = r1.data
        else {
          const r2 = await sb.from('roles').select('nombre').eq('id', p.rol_id).maybeSingle()
          rol = r2.data
        }

        const esSuper = rol?.es_super_admin === true || rol?.nombre === 'Super Administrador'
        if (esSuper) {
          setNombre('Todas las sucursales')
          return
        }
      }

      const sid = p.sucursal_id
      if (sid) {
        const { data: suc } = await sb.from('sucursales').select('nombre').eq('id', sid).maybeSingle()
        if (suc?.nombre) {
          setNombre(suc.nombre)
          return
        }
      }

      const { data: pri } = await sb.from('sucursales').select('nombre').order('id').limit(1).maybeSingle()
      if (pri?.nombre) setNombre(pri.nombre)
    })()
  }, [])

  if (!nombre || nombre === 'Sin sucursal') return null

  return <span className={className}>{nombre}</span>
}
