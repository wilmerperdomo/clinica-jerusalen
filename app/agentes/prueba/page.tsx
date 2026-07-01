'use client'

import { useEffect, useState } from 'react'

const CANALES = [
  'whatsapp_principal',
  'whatsapp_sucursal',
  'whatsapp_corporativo',
  'messenger_pagina',
] as const

type EnvioStatus = {
  whatsapp_meta: boolean
  whatsapp_evolution: boolean
  messenger: boolean
}

export default function AgentesPruebaPage() {
  const [canal, setCanal] = useState<string>('whatsapp_principal')
  const [telefono, setTelefono] = useState('50487548715')
  const [texto, setTexto] = useState('Hola, quiero agendar una cita')
  const [enviarReal, setEnviarReal] = useState(false)
  const [proveedor, setProveedor] = useState<'auto' | 'whatsapp_meta' | 'whatsapp_evolution'>('auto')
  const [envio, setEnvio] = useState<EnvioStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState('')

  useEffect(() => {
    fetch('/api/agentes/mensajes')
      .then(r => r.json())
      .then(d => setEnvio(d.envio ?? null))
      .catch(() => setEnvio(null))
  }, [])

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setResultado('')
    try {
      const res = await fetch('/api/agentes/mensajes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canal,
          telefono,
          texto,
          enviar: enviarReal,
          proveedor: canal === 'messenger_pagina' ? 'messenger' : proveedor,
        }),
      })
      const json = await res.json()
      setResultado(JSON.stringify({ status: res.status, ...json }, null, 2))
    } catch (err) {
      setResultado(`Error: ${err instanceof Error ? err.message : 'desconocido'}`)
    } finally {
      setLoading(false)
    }
  }

  const puedeEnviarReal = envio && (
    canal === 'messenger_pagina'
      ? envio.messenger
      : envio.whatsapp_meta || envio.whatsapp_evolution
  )

  return (
    <main style={{ maxWidth: 640, margin: '2rem auto', padding: '0 1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Prueba local — Agentes IA</h1>
      <p style={{ color: '#555', marginBottom: '1rem' }}>
        Simula un mensaje entrante. Marque &quot;Enviar WhatsApp real&quot; para que la respuesta llegue al teléfono.
      </p>

      {envio && (
        <p style={{ fontSize: 14, marginBottom: '1.5rem', padding: '0.75rem', background: '#f4f4f5', borderRadius: 8 }}>
          Meta WhatsApp: {envio.whatsapp_meta ? '✓ configurado' : '✗ falta WHATSAPP_ACCESS_TOKEN'}
          {' · '}
          Evolution: {envio.whatsapp_evolution ? '✓ configurado' : '✗ falta EVOLUTION_API_*'}
          {' · '}
          Messenger: {envio.messenger ? '✓ configurado' : '✗ falta MESSENGER_PAGE_ACCESS_TOKEN'}
        </p>
      )}

      <form onSubmit={enviar} style={{ display: 'grid', gap: '1rem' }}>
        <label>
          Canal
          <select
            value={canal}
            onChange={e => setCanal(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
          >
            {CANALES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <label>
          Teléfono / PSID (destino real si envía)
          <input
            value={telefono}
            onChange={e => setTelefono(e.target.value)}
            placeholder="50487548715"
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
          />
        </label>

        {canal !== 'messenger_pagina' && (
          <label>
            Proveedor de envío
            <select
              value={proveedor}
              onChange={e => setProveedor(e.target.value as typeof proveedor)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
            >
              <option value="auto">Automático (Meta si existe, si no Evolution)</option>
              <option value="whatsapp_meta">Meta Cloud API</option>
              <option value="whatsapp_evolution">Evolution API</option>
            </select>
          </label>
        )}

        <label>
          Mensaje
          <textarea
            value={texto}
            onChange={e => setTexto(e.target.value)}
            rows={3}
            style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={enviarReal}
            onChange={e => setEnviarReal(e.target.checked)}
            disabled={!puedeEnviarReal}
          />
          Enviar WhatsApp / Messenger real al teléfono
        </label>

        {!puedeEnviarReal && (
          <p style={{ fontSize: 13, color: '#b45309', margin: 0 }}>
            Configure las variables en <code>.env.local</code> y reinicie <code>npm run dev</code>.
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ padding: '10px 16px', cursor: loading ? 'wait' : 'pointer' }}
        >
          {loading ? 'Procesando…' : enviarReal ? 'Procesar y enviar real' : 'Solo simular respuesta'}
        </button>
      </form>

      {resultado && (
        <pre
          style={{
            marginTop: '1.5rem',
            padding: '1rem',
            background: '#f4f4f5',
            borderRadius: 8,
            overflow: 'auto',
            fontSize: 13,
          }}
        >
          {resultado}
        </pre>
      )}
    </main>
  )
}
