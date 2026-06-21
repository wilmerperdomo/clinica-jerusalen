'use client'

import {
  DollarSign, Receipt, Save, Search, TrendingDown, Trash2,
} from 'lucide-react'

import BuscarPacienteInput from '@/components/buscar-paciente-input'
import { fmtCaja } from '@/lib/caja-format'
import { FORMAS_PAGO } from '@/lib/caja-constants'
import { TABS_CATALOGO_VENTA } from '@/lib/venta-rapida/constants'
import type {
  ConceptoEgreso,
  PruebaLabCatalogo,
  ProductoCatalogo,
  ServicioCatalogo,
} from '@/lib/venta-rapida/types'
import type { useVentaRapida } from '@/app/(dashboard)/ventas/hooks/use-venta-rapida'

import { CajaModal } from './caja-modal'

type VentaRapidaController = ReturnType<typeof useVentaRapida>

interface Props {
  venta: VentaRapidaController
  conceptos: ConceptoEgreso[]
  esAdmin: boolean
}

export default function VentaRapidaModal({ venta, conceptos, esAdmin }: Props) {
  if (!venta.abierto) return null

  const { form, setForm } = venta
  const esIngreso = form.tipo === 'INGRESO'

  return (
    <CajaModal
      title={esIngreso ? 'Venta rápida' : 'Registrar egreso'}
      subtitle={esIngreso
        ? 'Seleccione paciente del catálogo y agregue servicios, laboratorio o medicamentos'
        : 'Salida de efectivo o pago en contado desde caja'}
      size="xl"
      accent={esIngreso ? 'green' : 'default'}
      icon={esIngreso ? Receipt : TrendingDown}
      onClose={venta.cerrar}
    >
      <div className="space-y-4">
        <TipoMovimientoSelector tipo={form.tipo} onChange={tipo => setForm(p => ({ ...p, tipo, concepto_id: '', concepto_libre: '' }))} />

        {esIngreso && (
          <PacienteVentaSection
            formaPago={form.forma_pago}
            pacienteId={form.paciente_id}
            pacientes={venta.pacientes}
            onSeleccionar={venta.seleccionarPaciente}
            buscarRemoto={venta.buscarPacienteRemoto}
          />
        )}

        {esIngreso && (
          <CatalogoVentaSection
            tab={venta.tabCatalogo}
            onTabChange={tab => { venta.setTabCatalogo(tab); venta.setBusquedaCatalogo('') }}
            busqueda={venta.busquedaCatalogo}
            onBusquedaChange={venta.setBusquedaCatalogo}
            resultados={venta.resultadosCatalogo}
            onAgregar={venta.agregarItem}
            items={venta.items}
            onQuitar={venta.quitarItem}
            onAjustarCantidad={venta.ajustarCantidad}
          />
        )}

        {form.tipo === 'EGRESO' && (
          <EgresoFields form={form} conceptos={conceptos} onChange={setForm} />
        )}

        {esIngreso && venta.membActiva && venta.membInfo && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-bold text-emerald-800">Plan activo: {venta.membInfo.tipo}</p>
            <p className="text-xs text-emerald-800 mt-0.5">
              {[
                venta.membInfo.estructurados.pctMedicamentos > 0 ? `${venta.membInfo.estructurados.pctMedicamentos}% medicamentos` : '',
                venta.membInfo.estructurados.pctLaboratorio > 0 ? `${venta.membInfo.estructurados.pctLaboratorio}% laboratorio` : '',
                venta.membInfo.estructurados.pctServicios > 0 ? `${venta.membInfo.estructurados.pctServicios}% servicios` : '',
              ].filter(Boolean).join(' · ') || 'Beneficios del plan'} — aplicados automáticamente.
            </p>
          </div>
        )}

        {esIngreso && (form.paciente_id || venta.items.length > 0) && (
          <DescuentoVentaSection
            esAdmin={esAdmin}
            form={form}
            descuentoInfo={venta.descuentoInfo}
            subtotal={venta.subtotal}
            tienePaciente={Boolean(form.paciente_id)}
            onChange={setForm}
          />
        )}

        <FormaPagoSection form={form} onChange={setForm} />

        <NotaField nota={form.nota} onChange={nota => setForm(p => ({ ...p, nota }))} />

        {esIngreso && venta.total > 0 && (
          <div className="rounded-xl border border-green-200 bg-green-50/70 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-green-800">
              Total a cobrar · {venta.items.length} ítem(s)
            </span>
            <span className="text-xl font-bold text-green-700">{fmtCaja(venta.total)}</span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={venta.cerrar} className="px-4 py-2 border rounded-lg text-sm">
            Cancelar
          </button>
          <button
            type="button"
            onClick={venta.confirmar}
            disabled={!venta.puedeConfirmar || venta.guardando}
            className={`px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${
              esIngreso ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {esIngreso
              ? <><DollarSign className="w-4 h-4 inline mr-1" /> Cobrar {venta.total > 0 ? fmtCaja(venta.total) : 'venta'}</>
              : <><Save className="w-4 h-4 inline mr-1" /> Registrar egreso</>}
          </button>
        </div>
      </div>
    </CajaModal>
  )
}

function TipoMovimientoSelector({
  tipo,
  onChange,
}: {
  tipo: 'INGRESO' | 'EGRESO'
  onChange: (tipo: 'INGRESO' | 'EGRESO') => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {([
        { key: 'INGRESO' as const, label: 'Venta rápida', hint: 'Cobrar al paciente' },
        { key: 'EGRESO' as const, label: 'Egreso', hint: 'Salida de caja' },
      ]).map(t => (
        <button key={t.key} type="button" onClick={() => onChange(t.key)}
          className={`py-2.5 rounded-xl font-semibold text-sm border-2 transition-all text-left px-3 ${
            tipo === t.key
              ? t.key === 'INGRESO' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-500 bg-red-50 text-red-700'
              : 'border-gray-200 text-gray-500 hover:border-gray-300'
          }`}>
          <span className="block">{t.label}</span>
          <span className="block text-[10px] font-normal opacity-70 mt-0.5">{t.hint}</span>
        </button>
      ))}
    </div>
  )
}

function PacienteVentaSection({
  formaPago, pacienteId, pacientes, onSeleccionar, buscarRemoto,
}: {
  formaPago: string
  pacienteId: string
  pacientes: VentaRapidaController['pacientes']
  onSeleccionar: (id: string, paciente?: VentaRapidaController['pacientes'][number]) => void
  buscarRemoto: VentaRapidaController['buscarPacienteRemoto']
}) {
  return (
    <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4 space-y-2">
      <label className="block text-sm font-semibold text-gray-800">
        Paciente {formaPago === 'CREDITO' ? '*' : '(recomendado)'}
      </label>
      <BuscarPacienteInput
        pacientes={pacientes}
        value={pacienteId}
        onChange={id => onSeleccionar(id)}
        onSelectPaciente={p => onSeleccionar(String(p.id), p)}
        buscarRemoto={buscarRemoto}
        placeholder="Buscar paciente: nombre, código, RTN, teléfono, empresa…"
        required={formaPago === 'CREDITO'}
      />
      <p className="text-xs text-gray-500">
        Catálogo de pacientes registrados — escribe al menos 2 caracteres para buscar en todo el sistema.
      </p>
      {formaPago === 'CREDITO' && !pacienteId && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Las ventas a crédito requieren seleccionar un paciente registrado.
        </p>
      )}
    </div>
  )
}

function CatalogoVentaSection({
  tab, onTabChange, busqueda, onBusquedaChange, resultados, onAgregar, items, onQuitar, onAjustarCantidad,
}: {
  tab: VentaRapidaController['tabCatalogo']
  onTabChange: (tab: VentaRapidaController['tabCatalogo']) => void
  busqueda: string
  onBusquedaChange: (q: string) => void
  resultados: Array<ServicioCatalogo | ProductoCatalogo | PruebaLabCatalogo>
  onAgregar: VentaRapidaController['agregarItem']
  items: VentaRapidaController['items']
  onQuitar: (key: string) => void
  onAjustarCantidad: (key: string, delta: number) => void
}) {
  return (
    <div className="rounded-xl border border-teal-100 bg-teal-50/40 p-4 space-y-3">
      <label className="block text-sm font-semibold text-gray-800">Agregar del catálogo</label>
      <div className="flex flex-wrap gap-1">
        {TABS_CATALOGO_VENTA.map(t => (
          <button key={t.id} type="button" onClick={() => onTabChange(t.id)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t.id ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          value={busqueda}
          onChange={e => onBusquedaChange(e.target.value)}
          placeholder={
            tab === 'medicamentos' ? 'Buscar medicamento por nombre o código…' :
            tab === 'laboratorio'  ? 'Buscar prueba de laboratorio…' :
            'Buscar servicio médico…'
          }
          className="w-full border rounded-lg pl-8 pr-3 py-2 text-sm bg-white focus:ring-2 focus:ring-teal-500 focus:outline-none"
        />
      </div>
      <div className="border rounded-lg overflow-hidden max-h-44 overflow-y-auto bg-white shadow-sm">
        {resultados.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-4">Sin resultados — escribe para buscar</p>
        ) : (
          resultados.map(item => (
            <CatalogoVentaFila key={`${tab}-${'codigo' in item ? item.codigo : item.id}`} tab={tab} item={item} onAgregar={onAgregar} />
          ))
        )}
      </div>
      {items.length > 0 && (
        <CarritoVenta items={items} onQuitar={onQuitar} onAjustarCantidad={onAjustarCantidad} />
      )}
    </div>
  )
}

function CatalogoVentaFila({
  tab, item, onAgregar,
}: {
  tab: VentaRapidaController['tabCatalogo']
  item: ServicioCatalogo | ProductoCatalogo | PruebaLabCatalogo
  onAgregar: VentaRapidaController['agregarItem']
}) {
  if (tab === 'medicamentos') {
    const prod = item as ProductoCatalogo
    return (
      <button type="button"
        onClick={() => onAgregar({ tipo: 'MEDICAMENTO', nombre: prod.nombre, precio: Number(prod.precio_venta), refId: prod.id })}
        className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 border-b last:border-0 flex justify-between items-center gap-2">
        <span>
          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded mr-1">Med</span>
          {prod.nombre}
          <span className="text-gray-400 font-mono text-xs ml-1">{prod.codigo}</span>
        </span>
        <span className="font-semibold text-teal-700 shrink-0">{fmtCaja(prod.precio_venta)}</span>
      </button>
    )
  }

  if (tab === 'laboratorio') {
    const lab = item as PruebaLabCatalogo
    return (
      <button type="button"
        onClick={() => onAgregar({ tipo: 'LAB', nombre: lab.nombre, precio: Number(lab.costo) || 0, refId: lab.id })}
        className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 border-b last:border-0 flex justify-between items-center gap-2">
        <span>
          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded mr-1">Lab</span>
          {lab.nombre}
        </span>
        <span className="font-semibold text-teal-700 shrink-0">{fmtCaja(Number(lab.costo) || 0)}</span>
      </button>
    )
  }

  const serv = item as ServicioCatalogo
  return (
    <button type="button"
      onClick={() => onAgregar({ tipo: 'SERVICIO', nombre: serv.nombre, precio: Number(serv.precio), refId: serv.id })}
      className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b last:border-0 flex justify-between items-center gap-2">
      <span>
        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded mr-1">Serv</span>
        {serv.nombre}
        <span className="text-gray-400 text-xs ml-1">({serv.tipo})</span>
      </span>
      <span className="font-semibold text-teal-700 shrink-0">{fmtCaja(serv.precio)}</span>
    </button>
  )
}

function CarritoVenta({
  items, onQuitar, onAjustarCantidad,
}: {
  items: VentaRapidaController['items']
  onQuitar: (key: string) => void
  onAjustarCantidad: (key: string, delta: number) => void
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-600 uppercase">
        Carrito ({items.length})
      </div>
      <div className="divide-y max-h-40 overflow-y-auto">
        {items.map(item => (
          <div key={item.key} className="px-3 py-2 flex items-center gap-2 text-sm">
            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded shrink-0 ${
              item.tipo === 'LAB' ? 'bg-purple-100 text-purple-700'
                : item.tipo === 'MEDICAMENTO' ? 'bg-green-100 text-green-700'
                  : 'bg-blue-100 text-blue-700'
            }`}>
              {item.tipo === 'LAB' ? 'Lab' : item.tipo === 'MEDICAMENTO' ? 'Med' : 'Serv'}
            </span>
            <span className="flex-1 min-w-0 truncate">{item.nombre}</span>
            <div className="flex items-center gap-1 shrink-0">
              <button type="button" onClick={() => onAjustarCantidad(item.key, -1)}
                className="w-6 h-6 rounded border text-xs hover:bg-gray-50">−</button>
              <span className="w-5 text-center text-xs font-bold">{item.cantidad}</span>
              <button type="button" onClick={() => onAjustarCantidad(item.key, 1)}
                className="w-6 h-6 rounded border text-xs hover:bg-gray-50">+</button>
            </div>
            <span className="font-semibold text-gray-800 w-20 text-right shrink-0">
              {fmtCaja(item.precio * item.cantidad)}
            </span>
            <button type="button" onClick={() => onQuitar(item.key)}
              className="p-1 text-red-400 hover:text-red-600 shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function EgresoFields({
  form, conceptos, onChange,
}: {
  form: VentaRapidaController['form']
  conceptos: ConceptoEgreso[]
  onChange: VentaRapidaController['setForm']
}) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Concepto de egreso *</label>
        <select value={form.concepto_id}
          onChange={e => onChange(p => ({ ...p, concepto_id: e.target.value }))}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
          <option value="">— Seleccionar concepto —</option>
          {conceptos.filter(c => c.tipo === 'EGRESO').map(c => (
            <option key={c.id} value={c.id}>{c.nombre}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Monto del egreso *</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">L.</span>
          <input type="number" min="0" step="0.01" value={form.monto}
            onChange={e => onChange(p => ({ ...p, monto: e.target.value }))}
            className="w-full border rounded-lg pl-9 pr-3 py-2.5 text-lg font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        </div>
      </div>
    </>
  )
}

function fmtFechaNac(fecha?: string): string {
  if (!fecha) return ''
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(d.getTime())) return fecha
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function DescuentoVentaSection({
  esAdmin, form, descuentoInfo, subtotal, tienePaciente, onChange,
}: {
  esAdmin: boolean
  form: VentaRapidaController['form']
  descuentoInfo: VentaRapidaController['descuentoInfo']
  subtotal: number
  tienePaciente: boolean
  onChange: VentaRapidaController['setForm']
}) {
  const elegible = Boolean(descuentoInfo && !descuentoInfo.fechaSospechosa && descuentoInfo.pct > 0)
  const sospechosa = Boolean(descuentoInfo?.fechaSospechosa)
  const confirmado = form.descuento_confirmado && Number(form.descuento_pct) > 0

  const toggleConfirmar = (checked: boolean) => {
    if (!descuentoInfo) return
    onChange(p => checked
      ? { ...p, descuento_confirmado: true, descuento_pct: String(descuentoInfo.pct), descuento_motivo: descuentoInfo.motivo }
      : { ...p, descuento_confirmado: false, descuento_pct: '0', descuento_motivo: '' })
  }

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${
      sospechosa ? 'border-red-300 bg-red-50'
        : confirmado ? 'border-amber-300 bg-amber-50'
          : elegible ? 'border-amber-200 bg-amber-50/40'
            : 'border-gray-200'
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Descuento</span>
        {elegible && (
          <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full">
            {descuentoInfo!.motivo} {descuentoInfo!.pct}% · sugerido
          </span>
        )}
      </div>

      {/* Fecha de nacimiento sospechosa → no se sugiere descuento */}
      {sospechosa && (
        <p className="text-xs text-red-700 bg-red-100/60 border border-red-200 rounded-lg px-3 py-2">
          ⚠ La fecha de nacimiento del paciente es inválida o poco creíble
          {descuentoInfo?.fechaNac ? ` (${fmtFechaNac(descuentoInfo.fechaNac)})` : ''}.
          No se aplicará descuento por edad — verifique el expediente.
        </p>
      )}

      {/* Casilla de confirmación visible con edad y fecha a la vista */}
      {elegible && (
        <label className="flex items-start gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={form.descuento_confirmado}
            onChange={e => toggleConfirmar(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-amber-600"
          />
          <span className="text-sm text-gray-700">
            <span className="font-semibold">Aplicar descuento {descuentoInfo!.motivo} ({descuentoInfo!.pct}%)</span>
            <span className="block text-xs text-gray-600">
              Paciente de <b>{descuentoInfo!.edad} años</b>
              {descuentoInfo!.fechaNac ? ` · nació el ${fmtFechaNac(descuentoInfo!.fechaNac)}` : ''}.
              Confirmo que verifiqué su identidad.
            </span>
          </span>
        </label>
      )}

      {/* Admin: puede ajustar manualmente el porcentaje */}
      {esAdmin && (
        <div className="relative">
          <input type="number" min="0" max="100" step="0.01"
            value={form.descuento_pct}
            onChange={e => onChange(p => ({
              ...p,
              descuento_pct: e.target.value,
              descuento_confirmado: Number(e.target.value) > 0,
              descuento_motivo: Number(e.target.value) <= 0
                ? ''
                : (elegible && Number(e.target.value) === descuentoInfo!.pct ? descuentoInfo!.motivo : 'Manual admin'),
            }))}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none" />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
        </div>
      )}

      {/* Mensajes informativos para enfermería/caja */}
      {!esAdmin && !elegible && !sospechosa && (
        <p className="text-sm text-gray-600">
          {tienePaciente
            ? 'Paciente sin descuento por edad (tercera/cuarta edad según sucursal).'
            : 'Seleccione un paciente para sugerir descuento por edad.'}
        </p>
      )}
      {!esAdmin && (
        <p className="text-[11px] text-gray-500">
          El descuento por edad debe confirmarse en caja. Descuentos extra solo administrador.
        </p>
      )}

      {subtotal > 0 && confirmado && (
        <p className="text-xs text-amber-700">
          Ahorro: {fmtCaja(subtotal * Number(form.descuento_pct) / 100)}
        </p>
      )}
    </div>
  )
}

function FormaPagoSection({
  form, onChange,
}: {
  form: VentaRapidaController['form']
  onChange: VentaRapidaController['setForm']
}) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Forma de Pago *</label>
        <div className="grid grid-cols-2 gap-2">
          {FORMAS_PAGO.map(fp => (
            <button key={fp.key} type="button"
              onClick={() => onChange(p => ({ ...p, forma_pago: fp.key }))}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                form.forma_pago === fp.key
                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}>
              <fp.icon className="w-4 h-4" /> {fp.label}
            </button>
          ))}
        </div>
      </div>
      {['TARJETA', 'TRANSFERENCIA'].includes(form.forma_pago) && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {form.forma_pago === 'TARJETA' ? 'Número de Voucher' : 'Referencia de Transferencia'}
          </label>
          <input value={form.referencia_pago}
            onChange={e => onChange(p => ({ ...p, referencia_pago: e.target.value }))}
            className="w-full border rounded-lg px-3 py-2 text-sm" />
        </div>
      )}
    </>
  )
}

function NotaField({ nota, onChange }: { nota: string; onChange: (nota: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Nota (opcional)</label>
      <input value={nota} onChange={e => onChange(e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm" />
    </div>
  )
}
