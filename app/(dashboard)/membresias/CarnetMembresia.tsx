'use client'

import { useRef } from 'react'
import { Printer, X } from 'lucide-react'

interface CarnetProps {
  membresia: {
    id: number
    numero_carnet?: string
    fecha_inicio: string
    fecha_fin:    string
    estado:       string
    paciente?: {
      nombre:    string
      apellido1: string
      apellido2?: string
      foto_url?:  string | null
      telefono?:  string | null
    }
    tipo?: {
      nombre:    string
      precio:    number
      duracion_dias: number
    }
    beneficiarios?: { nombre: string; parentesco: string; activo: boolean }[]
  }
  clinicaNombre?: string
  clinicaSlogan?: string
  onClose: () => void
}

/* ── QR via API pública sin dependencias ───────────────── */
function qrUrl(data: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=90x90&data=${encodeURIComponent(data)}&bgcolor=ffffff&color=1e3a8a&margin=4`
}

/* ── formato fecha legible ─────────────────────────────── */
function fmtFecha(s: string) {
  const [y, m, d] = s.split('-')
  return `${d}/${m}/${y}`
}

export default function CarnetMembresia({
  membresia, clinicaNombre = 'Clínica Jerusalén', clinicaSlogan = 'Tu salud, nuestra misión', onClose,
}: CarnetProps) {
  const ref = useRef<HTMLDivElement>(null)

  const nombreCompleto = `${membresia.paciente?.nombre ?? ''} ${membresia.paciente?.apellido1 ?? ''} ${membresia.paciente?.apellido2 ?? ''}`.trim()
  const numCarnet      = membresia.numero_carnet ?? String(membresia.id).padStart(6, '0')
  const qrData         = `CARNET:${numCarnet}|${nombreCompleto}|${membresia.tipo?.nombre ?? ''}|${membresia.fecha_fin}`
  const bensActivos    = (membresia.beneficiarios ?? []).filter(b => b.activo)

  function imprimir() {
    const w = window.open('', '_blank', 'width=700,height=520')
    if (!w || !ref.current) return
    w.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Carnet ${numCarnet}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#e2e8f0; display:flex; justify-content:center; align-items:flex-start; padding:30px; font-family:'Segoe UI',Arial,sans-serif; }
  @page { size: 9cm 5.5cm; margin: 0; }
  @media print {
    body { background:transparent; padding:0; }
    .no-print { display:none!important; }
    .card-wrap { page-break-inside: avoid; }
  }
  .card-wrap { display:flex; flex-direction:column; gap:16px; align-items:center; }
  .btn-print { padding:8px 24px; background:#2563eb; color:#fff; border:none; border-radius:8px; cursor:pointer; font-size:13px; margin-bottom:8px; }
</style>
</head><body>
<div class="card-wrap">
  <button class="btn-print no-print" onclick="window.print()">🖨️ Imprimir</button>
  ${ref.current.innerHTML}
</div>
</body></html>`)
    w.document.close()
    w.focus()
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">

        {/* header modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-gray-900 text-lg">Carnet de Plan Médico</h2>
          <div className="flex gap-2">
            <button onClick={imprimir}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm hover:bg-blue-700">
              <Printer className="w-4 h-4" /> Imprimir carnet
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5"/></button>
          </div>
        </div>

        {/* área del carnet */}
        <div className="p-8 flex flex-col items-center gap-6">

          {/* TARJETA FRONTAL */}
          <div ref={ref}>
            <div style={{
              width: '340px', height: '210px', borderRadius: '16px', position: 'relative',
              background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 45%, #0369a1 100%)',
              boxShadow: '0 10px 40px rgba(30,58,138,0.45)', overflow: 'hidden',
              fontFamily: "'Segoe UI', Arial, sans-serif",
            }}>

              {/* círculos decorativos */}
              <div style={{ position:'absolute', top:'-30px', right:'-30px', width:'130px', height:'130px', borderRadius:'50%', background:'rgba(255,255,255,0.06)' }}/>
              <div style={{ position:'absolute', bottom:'-40px', left:'80px', width:'160px', height:'160px', borderRadius:'50%', background:'rgba(255,255,255,0.04)' }}/>

              {/* banda superior */}
              <div style={{ position:'absolute', top:0, left:0, right:0, height:'38px', background:'rgba(0,0,0,0.18)', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 14px' }}>
                <div>
                  <p style={{ color:'#fff', fontSize:'11px', fontWeight:700, letterSpacing:'0.5px', lineHeight:1 }}>{clinicaNombre.toUpperCase()}</p>
                  <p style={{ color:'rgba(255,255,255,0.6)', fontSize:'7.5px', letterSpacing:'0.4px', marginTop:'1px' }}>{clinicaSlogan}</p>
                </div>
                <p style={{ color:'rgba(255,255,255,0.7)', fontSize:'8px', letterSpacing:'0.8px', textTransform:'uppercase' }}>PLAN MÉDICO ACTIVO</p>
              </div>

              {/* foto */}
              <div style={{ position:'absolute', top:'50px', left:'14px' }}>
                {membresia.paciente?.foto_url ? (
                  <img src={membresia.paciente.foto_url} alt="foto"
                    style={{ width:'62px', height:'62px', borderRadius:'50%', objectFit:'cover', border:'3px solid rgba(255,255,255,0.8)' }} />
                ) : (
                  <div style={{ width:'62px', height:'62px', borderRadius:'50%', background:'rgba(255,255,255,0.15)', border:'3px solid rgba(255,255,255,0.4)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span style={{ color:'rgba(255,255,255,0.7)', fontSize:'22px', fontWeight:700 }}>
                      {(membresia.paciente?.nombre?.[0] ?? '') + (membresia.paciente?.apellido1?.[0] ?? '')}
                    </span>
                  </div>
                )}
              </div>

              {/* datos principales */}
              <div style={{ position:'absolute', top:'50px', left:'90px', right:'105px' }}>
                <p style={{ color:'#fff', fontSize:'13px', fontWeight:700, lineHeight:1.2, marginBottom:'3px', textShadow:'0 1px 3px rgba(0,0,0,0.3)' }}>
                  {nombreCompleto}
                </p>
                <p style={{ color:'rgba(255,255,255,0.75)', fontSize:'8px', letterSpacing:'0.8px', textTransform:'uppercase', marginBottom:'6px' }}>TITULAR</p>

                <div style={{ display:'inline-block', background:'rgba(255,255,255,0.18)', borderRadius:'6px', padding:'3px 8px', marginBottom:'4px' }}>
                  <p style={{ color:'#fcd34d', fontSize:'10px', fontWeight:700, letterSpacing:'0.5px' }}>
                    {membresia.tipo?.nombre?.toUpperCase() ?? 'PLAN'}
                  </p>
                </div>
                <div style={{ display:'flex', gap:'8px', marginTop:'4px' }}>
                  <div>
                    <p style={{ color:'rgba(255,255,255,0.55)', fontSize:'7px', textTransform:'uppercase', letterSpacing:'0.4px' }}>DESDE</p>
                    <p style={{ color:'#fff', fontSize:'9px', fontWeight:600 }}>{fmtFecha(membresia.fecha_inicio)}</p>
                  </div>
                  <div>
                    <p style={{ color:'rgba(255,255,255,0.55)', fontSize:'7px', textTransform:'uppercase', letterSpacing:'0.4px' }}>HASTA</p>
                    <p style={{ color:'#fcd34d', fontSize:'9px', fontWeight:600 }}>{fmtFecha(membresia.fecha_fin)}</p>
                  </div>
                </div>
              </div>

              {/* QR */}
              <div style={{ position:'absolute', top:'46px', right:'10px', background:'rgba(255,255,255,0.95)', borderRadius:'10px', padding:'5px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrUrl(qrData)} alt="QR" width="72" height="72" style={{ display:'block', borderRadius:'6px' }} />
              </div>

              {/* pie de la tarjeta */}
              <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'32px', background:'rgba(0,0,0,0.25)', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 14px' }}>
                <p style={{ color:'rgba(255,255,255,0.55)', fontSize:'7.5px', letterSpacing:'1px', textTransform:'uppercase' }}>
                  N° CARNET
                </p>
                <p style={{ color:'#fff', fontSize:'11px', fontWeight:700, letterSpacing:'2px', fontFamily:'monospace' }}>
                  {numCarnet}
                </p>
                {membresia.paciente?.telefono && (
                  <p style={{ color:'rgba(255,255,255,0.6)', fontSize:'8px' }}>
                    📞 {membresia.paciente.telefono}
                  </p>
                )}
              </div>
            </div>

            {/* TARJETA TRASERA */}
            <div style={{
              width:'340px', marginTop:'12px', borderRadius:'16px',
              background:'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
              border:'1.5px solid #cbd5e1', padding:'14px 16px',
              boxShadow:'0 4px 15px rgba(0,0,0,0.08)', fontFamily:"'Segoe UI',Arial,sans-serif",
            }}>
              <p style={{ fontSize:'8px', fontWeight:700, color:'#475569', textTransform:'uppercase', letterSpacing:'0.8px', marginBottom:'8px', borderBottom:'1px solid #e2e8f0', paddingBottom:'5px' }}>
                BENEFICIARIOS
              </p>
              {bensActivos.length > 0 ? (
                <div style={{ display:'flex', flexWrap:'wrap', gap:'5px', marginBottom:'8px' }}>
                  {bensActivos.map((b, i) => (
                    <div key={i} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'6px', padding:'3px 8px' }}>
                      <p style={{ fontSize:'9px', fontWeight:600, color:'#1e3a8a' }}>{b.nombre}</p>
                      <p style={{ fontSize:'7.5px', color:'#94a3b8' }}>{b.parentesco}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize:'9px', color:'#94a3b8', marginBottom:'8px' }}>Sin beneficiarios registrados</p>
              )}
              <div style={{ borderTop:'1px solid #e2e8f0', paddingTop:'6px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <p style={{ fontSize:'7.5px', color:'#94a3b8' }}>
                  Este carnet acredita al titular y beneficiarios como miembros activos del plan.
                </p>
                <p style={{ fontSize:'7px', color:'#cbd5e1', marginLeft:'8px', whiteSpace:'nowrap' }}>{clinicaNombre}</p>
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center">
            Haz clic en <strong>Imprimir carnet</strong> para abrir la vista de impresión.<br/>
            El carnet se imprime en tamaño similar a una tarjeta de crédito.
          </p>
        </div>
      </div>
    </div>
  )
}
