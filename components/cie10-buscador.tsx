'use client'

import { useState, useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import type { Cie10Entry } from '@/lib/consulta-diagnosticos-utils'
import { normalizarTexto } from '@/lib/texto-utils'

interface Props {
  onSeleccionar: (entry: Cie10Entry) => void
  placeholder?: string
  className?: string
}

function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

export default function Cie10Buscador({ onSeleccionar, placeholder, className = '' }: Props) {
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<Cie10Entry[]>([])
  const [buscando, setBuscando] = useState(false)
  const [favoritos, setFavoritos] = useState<Cie10Entry[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const sb = supabase()
    sb.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data } = await sb
        .from('medico_cie10_favorito')
        .select('cie10_codigo, cie10(codigo, descripcion, capitulo)')
        .eq('user_id', user.id)
        .order('uso_count', { ascending: false })
        .limit(8)
      if (data) {
        setFavoritos(data.map((r: Record<string, unknown>) => {
          const c = r.cie10 as Cie10Entry | Cie10Entry[] | null
          const entry = Array.isArray(c) ? c[0] : c
          return entry ?? { codigo: String(r.cie10_codigo), descripcion: String(r.cie10_codigo) }
        }))
      }
    })
  }, [])

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const term = q.trim()
    if (term.length < 2) {
      setResultados([])
      return
    }
    timer.current = setTimeout(async () => {
      setBuscando(true)
      const sb = supabase()
      const esCodigo = /^[A-Za-z]\d/.test(term)
      let query = sb.from('cie10').select('codigo, descripcion, capitulo').eq('activo', true).limit(40)
      if (esCodigo) {
        query = query.ilike('codigo', `${term.toUpperCase()}%`)
      } else {
        query = query.ilike('descripcion', `%${term}%`)
      }
      const { data } = await query
      const norm = normalizarTexto(term)
      const filtrados = ((data ?? []) as Cie10Entry[]).filter(r =>
        esCodigo || normalizarTexto(r.descripcion).includes(norm) || normalizarTexto(r.codigo).includes(norm),
      ).slice(0, 12)
      setResultados(filtrados)
      setBuscando(false)
    }, 280)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q])

  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
      <input
        className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none"
        placeholder={placeholder ?? 'Buscar CIE-10 por código o nombre...'}
        value={q}
        onChange={e => setQ(e.target.value)}
        autoComplete="off"
      />
      {favoritos.length > 0 && !q.trim() && (
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="text-[10px] text-gray-500 w-full">Frecuentes:</span>
          {favoritos.map(f => (
            <button key={f.codigo} type="button"
              onClick={() => onSeleccionar(f)}
              className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 hover:bg-indigo-200 font-mono">
              {f.codigo}
            </button>
          ))}
        </div>
      )}
      {buscando && q.trim().length >= 2 && (
        <p className="text-[10px] text-gray-400 mt-1 px-1">Buscando...</p>
      )}
      {resultados.length > 0 && (
        <div className="absolute top-full left-0 right-0 bg-white border rounded-xl shadow-xl z-30 mt-0.5 max-h-48 overflow-y-auto">
          {resultados.map(r => (
            <button
              key={r.codigo}
              type="button"
              onClick={() => {
                onSeleccionar(r)
                setQ('')
                setResultados([])
              }}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm border-b border-gray-50 last:border-0"
            >
              <span className="font-mono text-indigo-700 text-xs font-bold">{r.codigo}</span>
              <span className="text-gray-800 ml-2">{r.descripcion}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
