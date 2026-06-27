/** Contrato / comprobante de afiliación a plan médico */

import { BRAND } from '@/lib/brand'
import { beneficiosDesdeTipo } from '@/lib/membresia-utils'
import { numCuotasPlan } from '@/lib/membresia-estado'

const fmt = (n: number) => `L. ${n.toLocaleString('es-HN', { minimumFractionDigits: 2 })}`

export interface ContratoMembresiaData {
  paciente: { nombre: string; apellido1: string; apellido2?: string; telefono?: string; celular?: string }
  membresia: {
    numero_carnet?: string
    fecha_inicio: string
    fecha_fin: string
    comentarios?: string
    tipo?: {
      nombre: string
      precio: number
      duracion_dias: number
      descripcion?: string
      consulta_gratis?: boolean
      pct_consulta?: number
      pct_laboratorio?: number
      pct_medicamentos?: number
      pct_servicios?: number
    }
    beneficiarios?: { nombre: string; parentesco?: string }[]
    sucursal?: { nombre: string }
  }
}

function resumenBeneficios(tipo: ContratoMembresiaData['membresia']['tipo']) {
  if (!tipo) return []
  const b = beneficiosDesdeTipo(tipo)
  const lineas: string[] = []
  if (b.consultaGratis) lineas.push('Consulta médica gratis')
  if (b.pctConsulta > 0) lineas.push(`${b.pctConsulta}% de descuento en consultas`)
  if (b.pctLaboratorio > 0) lineas.push(`${b.pctLaboratorio}% de descuento en laboratorio`)
  if (b.pctMedicamentos > 0) lineas.push(`${b.pctMedicamentos}% de descuento en medicamentos`)
  if (b.pctServicios > 0) lineas.push(`${b.pctServicios}% de descuento en servicios`)
  return lineas
}

export function imprimirContratoMembresia(data: ContratoMembresiaData) {
  const { paciente, membresia } = data
  const tipo = membresia.tipo
  const nombre = `${paciente.nombre} ${paciente.apellido1} ${paciente.apellido2 || ''}`.trim()
  const tel = paciente.celular || paciente.telefono || '—'
  const cuotas = tipo ? numCuotasPlan(tipo.duracion_dias) : 1
  const montoCuota = tipo ? tipo.precio / cuotas : 0
  const beneficios = resumenBeneficios(tipo)

  const w = window.open('', '_blank', 'width=820,height=900')
  if (!w) return

  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Contrato Plan Médico</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:24px;line-height:1.45}
  h1{font-size:18px;margin:0 0 4px;color:${BRAND.navy}}
  h2{font-size:13px;margin:18px 0 8px;color:${BRAND.navy};border-bottom:1px solid #ddd;padding-bottom:4px}
  .muted{color:#666;font-size:11px}
  .box{border:1px solid #ddd;border-radius:8px;padding:12px;margin:10px 0}
  table{width:100%;border-collapse:collapse}
  td,th{padding:6px 8px;border-bottom:1px solid #eee;text-align:left;font-size:11px}
  ul{margin:6px 0;padding-left:18px}
  .sign{margin-top:36px;display:flex;justify-content:space-between;gap:24px}
  .sign div{width:45%;border-top:1px solid #333;padding-top:6px;text-align:center;font-size:11px}
  @media print{body{margin:12mm}}
</style></head><body>
  <h1>${BRAND.nombreCorto}</h1>
  <p class="muted">Contrato de afiliación — Plan médico</p>
  <p class="muted">Impreso: ${new Date().toLocaleString('es-HN')}</p>

  <h2>Datos del afiliado</h2>
  <div class="box">
    <p><strong>Nombre:</strong> ${nombre}</p>
    <p><strong>Teléfono:</strong> ${tel}</p>
    <p><strong>Carnet:</strong> ${membresia.numero_carnet || '—'}</p>
    <p><strong>Sucursal:</strong> ${membresia.sucursal?.nombre || 'General'}</p>
  </div>

  <h2>Plan contratado</h2>
  <div class="box">
    <p><strong>Plan:</strong> ${tipo?.nombre || '—'}</p>
    <p><strong>Precio total:</strong> ${tipo ? fmt(tipo.precio) : '—'}</p>
    <p><strong>Vigencia:</strong> ${membresia.fecha_inicio} al ${membresia.fecha_fin} (${tipo?.duracion_dias || '—'} días)</p>
    <p><strong>Cuotas:</strong> ${cuotas} × ${fmt(montoCuota)}</p>
    ${tipo?.descripcion ? `<p><strong>Descripción:</strong> ${tipo.descripcion}</p>` : ''}
  </div>

  <h2>Beneficios del plan</h2>
  <div class="box">
    ${beneficios.length ? `<ul>${beneficios.map(b => `<li>${b}</li>`).join('')}</ul>` : '<p class="muted">Sin beneficios estructurados registrados.</p>'}
  </div>

  <h2>Beneficiarios</h2>
  <div class="box">
    ${(membresia.beneficiarios?.length ?? 0) > 0
      ? `<table><thead><tr><th>Nombre</th><th>Parentesco</th></tr></thead><tbody>
        ${membresia.beneficiarios!.map(b => `<tr><td>${b.nombre}</td><td>${b.parentesco || '—'}</td></tr>`).join('')}
        </tbody></table>`
      : '<p class="muted">Sin beneficiarios adicionales.</p>'}
  </div>

  ${membresia.comentarios ? `<h2>Observaciones</h2><div class="box"><p>${membresia.comentarios}</p></div>` : ''}

  <p style="margin-top:18px;font-size:11px">
    El afiliado declara conocer las condiciones del plan médico y acepta el calendario de cuotas indicado.
  </p>

  <div class="sign">
    <div>Firma del afiliado</div>
    <div>Sello / firma ${BRAND.nombreCorto}</div>
  </div>
</body></html>`)
  w.document.close()
  w.focus()
  setTimeout(() => { w.print() }, 400)
}
