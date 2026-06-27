import { BRAND, FISCAL } from '@/lib/brand'
import { logoTicketHtml } from '@/lib/brand-logo'
import { lineaAtendidoPor } from '@/lib/medico-utils'

export interface FacturaPrintItem {
  descripcion: string
  subtotal: number
  cantidad?: number
  precio_unitario?: number
  isv_pct?: number
}

export interface FacturaPrintData {
  numero: string
  fecha: string
  hora?: string
  cliente_nombre: string
  cliente_rtn?: string | null
  rtn_emisor?: string | null
  correo_emisor?: string | null
  subtotal: number
  descuento_monto?: number
  isv_monto: number
  total: number
  exento_isv?: boolean
  cai?: string | null
  rango_inicio?: string | null
  rango_fin?: string | null
  fecha_limite_cai?: string | null
  cajero_nombre?: string | null
  medico_nombre?: string | null
  items: FacturaPrintItem[] | unknown
  estado?: string
  /** Acceso al portal del paciente (se imprime cuando la venta incluye laboratorio) */
  portal?: { usuario: string; password: string; url: string }
  /** Programa de fidelidad — puntos del paciente */
  fidelidad?: {
    puntos_acumulados: number
    puntos_ganados?: number
    mensaje_canje?: string
  }
}

export interface FacturaPrintOptions {
  autoPrint?: boolean
  incluirQr?: boolean
  mostrarBotonImprimir?: boolean
  /** Origen de la app (reservado; el logo va embebido en SVG) */
  baseUrl?: string
}

function L(n: number): string {
  return `L ${Number(n).toFixed(2)}`
}

function formatearFechaCai(val?: string | null): string {
  if (!val) return FISCAL.fechaLimiteCai
  const s = String(val)
  return s.length >= 10 ? s.slice(0, 10) : s
}

function normalizarItems(items: unknown): FacturaPrintItem[] {
  if (!items) return []
  let raw = items
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw) } catch { return [] }
  }
  if (!Array.isArray(raw)) return []
  return raw.map(it => ({
    descripcion: String(it.descripcion ?? ''),
    subtotal: Number(it.subtotal ?? 0),
    cantidad: it.cantidad != null ? Number(it.cantidad) : undefined,
    precio_unitario: it.precio_unitario != null ? Number(it.precio_unitario) : undefined,
    isv_pct: it.isv_pct != null ? Number(it.isv_pct) : undefined,
  }))
}

function numeroEnLetras(n: number): string {
  if (n === 0) return 'CERO LEMPIRAS EXACTOS'
  const unidades = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
    'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE']
  const decenas = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
  const centenas = ['', 'CIEN', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

  function convertir(num: number): string {
    if (num < 20) return unidades[num]
    if (num < 100) return decenas[Math.floor(num / 10)] + (num % 10 ? ' Y ' + unidades[num % 10] : '')
    if (num < 1000) return centenas[Math.floor(num / 100)] + (num % 100 ? ' ' + convertir(num % 100) : '')
    if (num < 1000000) {
      const miles = Math.floor(num / 1000)
      const resto = num % 1000
      return (miles === 1 ? 'MIL' : convertir(miles) + ' MIL') + (resto ? ' ' + convertir(resto) : '')
    }
    return String(num)
  }

  const entero = Math.floor(n)
  const decimal = Math.round((n - entero) * 100)
  return convertir(entero) + ' LEMPIRAS' + (decimal > 0 ? ` CON ${String(decimal).padStart(2, '0')}/100` : ' EXACTOS')
}

function filaMonospace(izq: string, der: string, negrita = false): string {
  const tag = negrita ? 'strong' : 'span'
  return `<div class="row"><${tag}>${izq}</${tag}><${tag}>${der}</${tag}></div>`
}

/** Texto bajo el logo — mismo orden que factura.php (nom, dir, RTN, Correo, Telefono) */
function encabezadoClinica(rtn?: string | null, correo?: string | null): string {
  const rtnVal = rtn || FISCAL.rtn
  const correoVal = correo || FISCAL.correo
  const dirHtml = [
    `Casa Matriz: ${FISCAL.casaMatriz}`,
    `Sucursal: ${FISCAL.sucursal1}`,
    `Sucursal#2: ${FISCAL.sucursal2}`,
  ].join('<br>')
  return `
  <div class="center bold nombre-clinica">CLINICA MEDICA JERUSALEN</div>
  <div class="center dir">${dirHtml}</div>
  <div class="center bold">RTN: ${rtnVal}</div>
  <div class="center">Correo: ${correoVal}</div>
  <div class="center">Telefono: ${FISCAL.telefonos}</div>`
}

/** HTML del ticket térmico 80mm — formato oficial Clínica Médica Jerusalén */
export function htmlFacturaTermica(f: FacturaPrintData, opts: FacturaPrintOptions = {}): string {
  const { incluirQr = false, mostrarBotonImprimir = true, autoPrint = false, baseUrl = '' } = opts
  const items = normalizarItems(f.items)
  const hora = (f.hora ?? '').slice(0, 8).slice(0, 5)
  const descuento = Number(f.descuento_monto ?? 0)
  const isvLabel = f.exento_isv ? 'ISV (Exento)' : 'ISV (15%)'
  const cai = f.cai || FISCAL.cai
  const rangoIni = f.rango_inicio || FISCAL.rangoInicio
  const rangoFin = f.rango_fin || FISCAL.rangoFin
  const limiteCai = formatearFechaCai(f.fecha_limite_cai)
  const anulada = f.estado === 'anulada'
  const atendidoPor = lineaAtendidoPor(f.cajero_nombre, f.medico_nombre)
  const logo = logoTicketHtml(baseUrl, 'print')

  const gravado15 = items.reduce((s, it) => s + (it.isv_pct === 15 ? it.subtotal : 0), 0)
  const gravado18 = items.reduce((s, it) => s + (it.isv_pct === 18 ? it.subtotal : 0), 0)
  const exento = items.reduce((s, it) => s + ((it.isv_pct ?? 15) === 0 ? it.subtotal : 0), 0)
  const isv15 = gravado15 * 0.15
  const isv18 = gravado18 * 0.18
  const totalIsv = isv15 + isv18
  const totalImporte = f.subtotal - descuento

  const qr = incluirQr
    ? `https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(
        `FACTURA:${f.numero}|RTN:${f.rtn_emisor || FISCAL.rtn}|TOTAL:${f.total}`
      )}&margin=4`
    : ''

  const itemsHtml = items.length > 0
    ? items.map(it => {
        const detalle = it.cantidad && it.precio_unitario
          ? `<br><span class="detalle">${it.cantidad} x L ${Number(it.precio_unitario).toFixed(2)}</span>`
          : ''
        return `<tr>
          <td class="desc">${it.descripcion}${detalle}</td>
          <td class="monto">${L(it.subtotal)}</td>
        </tr>`
      }).join('')
    : `<tr><td class="desc">Servicio médico</td><td class="monto">${L(f.subtotal)}</td></tr>`

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Factura ${f.numero}</title>
<style>
  html, body {
    margin: 0;
    padding: 0;
    height: auto;
    overflow: visible;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page { size: 80mm auto; margin: 2mm 1.5mm; }
  body {
    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.1px;
    color: #000;
    width: 76mm;
    max-width: 76mm;
    margin: 0 auto;
    padding: 3mm 2mm 8mm;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .logo-wrap { text-align: center; margin-bottom: 4px; }
  .logo-wrap img.logo-ticket { display: block; margin: 0 auto; width: 150px; max-width: 150px; height: auto; object-fit: contain; }
  .nombre-clinica { font-size: 12px; margin: 4px 0 2px; }
  .bloque-venta { text-align: left; margin: 6px 0; line-height: 1.5; }
  .dir { font-size: 9.5px; line-height: 1.4; font-weight: normal; padding: 0 1mm; }
  .line { border-top: 1px dashed #000; margin: 5px 0; }
  .line-solid { border-top: 2px solid #000; margin: 5px 0; }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 6px;
    line-height: 1.45;
  }
  .row span, .row strong { flex: 1; }
  .row span:last-child, .row strong:last-child { text-align: right; white-space: nowrap; flex: 0 0 auto; }
  .total-row { font-size: 13px; }
  .fiscal { font-size: 9px; line-height: 1.45; font-weight: normal; word-break: break-all; }
  .detalle { font-size: 9.5px; font-weight: normal; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td { padding: 2px 0; vertical-align: top; }
  td.desc { width: 68%; font-size: 10.5px; padding-right: 4px; word-break: break-word; }
  td.monto { width: 32%; text-align: right; white-space: nowrap; font-size: 10.5px; }
  .bloque-fiscal .row { font-size: 10px; font-weight: normal; }
  .pie { font-size: 9.5px; line-height: 1.45; font-weight: normal; }
  .anulada {
    position: absolute;
    top: 30%;
    left: 0;
    width: 100%;
    text-align: center;
    font-size: 38px;
    font-weight: 900;
    color: rgba(0,0,0,0.12);
    transform: rotate(-35deg);
    pointer-events: none;
    letter-spacing: 4px;
    z-index: 1;
  }
  .contenido { position: relative; z-index: 2; }
  .btn {
    display: block;
    margin: 8px auto 12px;
    padding: 8px 20px;
    background: #003366;
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
  }
  @media print {
    .no-print { display: none !important; }
    html, body { height: auto !important; overflow: visible !important; }
    body { padding-bottom: 12mm; }
  }
</style></head><body>
${anulada ? '<div class="anulada">*** ANULADA ***</div>' : ''}
<div class="contenido">
${mostrarBotonImprimir ? '<button class="btn no-print" onclick="window.print()">Imprimir</button>' : ''}

<div class="logo-wrap">${logo}</div>
${encabezadoClinica(f.rtn_emisor, f.correo_emisor)}
<div class="line"></div>

<div class="bloque-venta">
  <strong>FACTURA VENTA</strong><br>
  ${atendidoPor ? `<strong>Atendido Por: </strong>${atendidoPor}<br>` : ''}
  <strong>Atención 365 días del año 24/7</strong>
</div>
<div class="line"></div>

<div><strong>Factura No. </strong>${f.numero}</div>
<div><strong>Fecha: </strong>${f.fecha}${hora ? `&nbsp;&nbsp;<strong>Hora: </strong>${hora}` : ''}</div>
<div class="fiscal" style="margin-top:3px"><strong>C.A.I.: </strong>${cai}</div>
<div class="line"></div>

<div><strong>Cliente: </strong>${f.cliente_nombre}</div>
${f.cliente_rtn ? `<div><strong>RTN Cliente: </strong>${f.cliente_rtn}</div>` : ''}
<div class="line"></div>
<div class="pie">
  <strong>N. O/C Exenta: ________________________</strong><br>
  <strong>N. Reg Exonerado: ______________________</strong><br>
  <strong>N. Reg de la SAG: ______________________</strong>
</div>
<div class="line-solid"></div>

<table>
  <tr>
    <td class="desc"><b>Descripción</b></td>
    <td class="monto"><b>Monto</b></td>
  </tr>
  ${itemsHtml}
</table>
<div class="line"></div>

${filaMonospace('Subtotal:', L(f.subtotal))}
${descuento > 0 ? filaMonospace('Descuento:', `- ${L(descuento)}`) : ''}
${filaMonospace(`${isvLabel}:`, L(f.isv_monto))}
<div class="line-solid"></div>
${filaMonospace('TOTAL:', L(f.total), true)}
<div class="line"></div>

<div class="bloque-fiscal">
  ${filaMonospace('DESCUENTOS Y REBAJAS', descuento > 0 ? `- ${L(descuento)}` : L(0))}
  ${filaMonospace('IMPORTE EXENTO', L(exento))}
  ${filaMonospace('IMPORTE EXONERADO', L(0))}
  ${filaMonospace('IMPORTE GRAVADO 15%', L(gravado15))}
  ${filaMonospace('IMPORTE GRAVADO 18%', L(gravado18))}
  <div class="line"></div>
  ${filaMonospace('TOTAL IMPORTE', L(totalImporte))}
  ${filaMonospace('IMPUESTO 15%', L(isv15))}
  ${filaMonospace('IMPUESTO 18%', L(isv18))}
  ${filaMonospace('TOTAL IMPUESTO', L(totalIsv))}
</div>
<div class="line-solid"></div>

<div class="center pie">
  <strong>Total a Pagar en Letras:</strong><br>
  <span style="font-size:10px">${numeroEnLetras(f.total)}</span>
</div>
<div class="center pie" style="margin-top:6px">
  <strong>¡Gracias por su visita!</strong><br><br>
  <strong>Fecha Límite de Emisión:</strong> ${limiteCai}<br><br>
  <strong>Rango Autorizado:</strong><br>
  ${rangoIni} al ${rangoFin}<br><br>
  Síguenos en Facebook:<br>
  <strong>${FISCAL.facebook}</strong><br>
  ${FISCAL.web}
</div>

${f.portal ? `
<div class="line-solid"></div>
<div class="center pie" style="margin-top:4px">
  <strong>PORTAL DE RESULTADOS EN LÍNEA</strong><br>
  <span style="font-size:9px">Consulte y descargue sus resultados de laboratorio</span><br>
  <strong>${f.portal.url}</strong>
</div>
<div class="bloque-fiscal" style="margin-top:4px">
  ${filaMonospace('Usuario:', f.portal.usuario, true)}
  ${filaMonospace('Contraseña:', f.portal.password, true)}
</div>
<div class="center" style="font-size:8.5px;font-weight:normal;margin-top:2px">Guarde esta contraseña: no se vuelve a mostrar.</div>` : ''}

${f.fidelidad ? `
<div class="line-solid"></div>
<div class="center pie" style="margin-top:4px">
  <strong>PROGRAMA DE FIDELIDAD</strong><br>
  <span style="font-size:9px">Puntos acumulados</span><br>
  <strong style="font-size:16px">${f.fidelidad.puntos_acumulados} punto${f.fidelidad.puntos_acumulados !== 1 ? 's' : ''}</strong>
  ${f.fidelidad.puntos_ganados && f.fidelidad.puntos_ganados > 0
    ? `<br><span style="font-size:9px">En esta visita: +${f.fidelidad.puntos_ganados} punto${f.fidelidad.puntos_ganados !== 1 ? 's' : ''}</span>`
    : ''}
</div>
<div class="center" style="font-size:8.5px;font-weight:normal;margin-top:3px;padding:0 2mm;line-height:1.4">
  ${f.fidelidad.mensaje_canje ?? 'Sus puntos se pueden canjear en exámenes de laboratorio.'}
</div>` : ''}

${incluirQr && qr ? `<div class="center" style="margin-top:8px"><img src="${qr}" width="72" height="72" alt="QR"/></div>` : ''}
</div>

<script>
(function() {
  function imprimirCuandoListo() {
    var imgs = document.querySelectorAll('img');
    var pendientes = imgs.length;
    if (!pendientes) { window.print(); return; }
    imgs.forEach(function(img) {
      if (img.complete) {
        pendientes--;
        if (pendientes === 0) window.print();
      } else {
        img.onload = img.onerror = function() {
          pendientes--;
          if (pendientes === 0) window.print();
        };
      }
    });
  }
  ${autoPrint ? `
  window.addEventListener('load', function() {
    setTimeout(imprimirCuandoListo, 350);
  });
  ` : ''}
})();
</script>
</body></html>`
}

/** Convierte registro de BD / estado de caja al formato de impresión */
export function facturaPrintDesdeRegistro(f: Record<string, unknown>): FacturaPrintData {
  return {
    numero: String(f.numero ?? ''),
    fecha: String(f.fecha ?? ''),
    hora: f.hora as string | undefined,
    cliente_nombre: String(f.cliente_nombre ?? 'CONSUMIDOR FINAL'),
    cliente_rtn: f.cliente_rtn as string | undefined,
    rtn_emisor: f.rtn_emisor as string | undefined,
    correo_emisor: (f.sucursal as { email?: string } | undefined)?.email
      ?? (f.correo_emisor as string | undefined)
      ?? FISCAL.correo,
    subtotal: Number(f.subtotal ?? 0),
    descuento_monto: Number(f.descuento_monto ?? 0),
    isv_monto: Number(f.isv_monto ?? 0),
    total: Number(f.total ?? 0),
    exento_isv: Boolean(f.exento_isv),
    cai: f.cai as string | undefined,
    rango_inicio: f.rango_inicio as string | undefined,
    rango_fin: f.rango_fin as string | undefined,
    fecha_limite_cai: f.fecha_limite_cai as string | undefined,
    cajero_nombre: f.cajero_nombre as string | undefined,
    medico_nombre: f.medico_nombre as string | undefined,
    items: f.items,
    estado: f.estado as string | undefined,
    portal: f.portal as { usuario: string; password: string; url: string } | undefined,
    fidelidad: f.fidelidad as FacturaPrintData['fidelidad'],
  }
}

/** Abre ventana de impresión con el ticket térmico oficial */
export function abrirFacturaTermica(f: FacturaPrintData, opts: FacturaPrintOptions = {}): void {
  const win = window.open('', '_blank', 'width=420,height=900,scrollbars=yes')
  if (!win) {
    alert('Permita ventanas emergentes para imprimir la factura.')
    return
  }
  const printOpts: FacturaPrintOptions = {
    ...opts,
    baseUrl: opts.baseUrl ?? window.location.origin,
  }
  win.document.open()
  win.document.write(htmlFacturaTermica(f, printOpts))
  win.document.close()
  win.focus()
}
