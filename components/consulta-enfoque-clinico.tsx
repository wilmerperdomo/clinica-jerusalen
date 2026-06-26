'use client'

import type { ReactNode } from 'react'
import { Baby, Venus, Stethoscope, Sparkles } from 'lucide-react'
import {
  type EnfoqueClinico,
  type FormPediatria,
  type FormGinecologia,
  etiquetaEnfoque,
  edadDetallada,
  actualizarFechasGestacion,
} from '@/lib/consulta-especialidad-utils'
import ControlPrenatalPanel from '@/components/control-prenatal-panel'
import ConsultaPanelGeneral from '@/components/consulta-panel-general'
import type { FormControlPrenatal } from '@/lib/control-prenatal-utils'
import type { FormConsultaGeneral } from '@/lib/consulta-general-utils'
import {
  CONTROLES_NINO_SANO, HITOS_DESARROLLO, TIPOS_ALIMENTACION,
  calcularDosisPediatricas, formatearDosisPediatricas,
} from '@/lib/dosis-pediatricas'
import {
  CHECKLIST_T1_ITEMS, CHECKLIST_T2_ITEMS, CHECKLIST_T3_ITEMS,
  parseChecklist, stringifyChecklist, checklistVacio,
} from '@/lib/consulta-gineco-utils'
import { AlertTriangle, Calculator } from 'lucide-react'

interface Props {
  enfoque: EnfoqueClinico
  enfoqueSugerido?: EnfoqueClinico
  fechaNac?: string | null
  formPediatria: FormPediatria
  formGinecologia: FormGinecologia
  formConsultaGeneral?: FormConsultaGeneral
  formControlPrenatal?: FormControlPrenatal
  onEnfoqueChange: (enfoque: EnfoqueClinico) => void
  onPediatriaChange: (form: FormPediatria) => void
  onGinecologiaChange: (form: FormGinecologia) => void
  onGeneralChange?: (form: FormConsultaGeneral) => void
  onAplicarPlantilla?: (id: string) => void
  onControlPrenatalChange?: (form: FormControlPrenatal) => void
  onAgregarProtocoloLab?: () => void
  onConectarMedicamentos?: () => void
  onConectarEstudios?: () => void
  pesoPaciente?: string | null
  tallaPaciente?: string | null
}

const ENFOQUES: { id: EnfoqueClinico; icon: typeof Stethoscope; label: string }[] = [
  { id: 'general', icon: Stethoscope, label: 'General' },
  { id: 'pediatria', icon: Baby, label: 'Niño / Pediatría' },
  { id: 'ginecologia', icon: Venus, label: 'Mujer / Gineco' },
]

function Campo({
  label,
  children,
  className = '',
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-violet-200 focus:border-violet-400 outline-none'
const textareaCls = `${inputCls} resize-y min-h-[3rem]`

function PanelPediatria({
  form,
  onChange,
  edadTexto,
  pesoKg,
}: {
  form: FormPediatria
  onChange: (f: FormPediatria) => void
  edadTexto: string
  pesoKg?: number | null
}) {
  const set = <K extends keyof FormPediatria>(key: K, value: FormPediatria[K]) =>
    onChange({ ...form, [key]: value })

  const calcularDosis = () => {
    if (!pesoKg || pesoKg <= 0) { alert('Registre el peso en signos vitales primero.'); return }
    set('dosis_calculadas', formatearDosisPediatricas(pesoKg))
  }

  const toggleHito = (hito: string) => {
    const lineas = form.hitos_desarrollo.split('\n').map(s => s.trim()).filter(Boolean)
    const idx = lineas.indexOf(hito)
    if (idx >= 0) lineas.splice(idx, 1)
    else lineas.push(hito)
    set('hitos_desarrollo', lineas.join('\n'))
  }

  return (
    <div className="space-y-4">
      {edadTexto && (
        <p className="text-xs text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
          Edad: <span className="font-semibold">{edadTexto}</span>
          {pesoKg ? <span className="ml-2">· Peso: {pesoKg} kg</span> : null}
        </p>
      )}

      <Campo label="Control niño sano">
        <select value={form.control_nino_sano} onChange={e => set('control_nino_sano', e.target.value)} className={inputCls}>
          <option value="">— Seleccionar edad de control —</option>
          {CONTROLES_NINO_SANO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </Campo>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Hitos de desarrollo</p>
        <div className="flex flex-wrap gap-2">
          {HITOS_DESARROLLO.map(h => {
            const activo = form.hitos_desarrollo.includes(h)
            return (
              <button key={h} type="button" onClick={() => toggleHito(h)}
                className={`text-[11px] px-2 py-1 rounded-full border transition ${activo ? 'bg-sky-600 text-white border-sky-600' : 'bg-white border-gray-200 text-gray-600'}`}>
                {h}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Campo label="Tipo de alimentación">
          <select value={form.tipo_alimentacion} onChange={e => set('tipo_alimentacion', e.target.value)} className={inputCls}>
            <option value="">—</option>
            {TIPOS_ALIMENTACION.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Campo>
        <Campo label="Alimentación (detalle)">
          <input value={form.alimentacion} onChange={e => set('alimentacion', e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Hidratación">
          <input value={form.hidratacion} onChange={e => set('hidratacion', e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Desarrollo (notas)">
          <input value={form.desarrollo} onChange={e => set('desarrollo', e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="Vacunas">
          <select value={form.vacunas_estado} onChange={e => set('vacunas_estado', e.target.value as FormPediatria['vacunas_estado'])} className={inputCls}>
            <option value="">—</option>
            <option value="al_dia">Al día</option>
            <option value="pendiente">Pendientes</option>
            <option value="desconocido">Desconocido</option>
          </select>
        </Campo>
        <Campo label="Acompañante">
          <input value={form.acompanante} onChange={e => set('acompanante', e.target.value)} className={inputCls} />
        </Campo>
      </div>

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Tamizaje de alarma
        </p>
        <div className="flex flex-wrap gap-3">
          {([
            ['alarma_fiebre_rn', 'Fiebre menor 3 meses'],
            ['alarma_dificultad_resp', 'Dificultad respiratoria'],
            ['alarma_deshidratacion', 'Deshidratación'],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form[key]} onChange={e => set(key, e.target.checked)} className="rounded text-sky-600" />
              <span>{label}</span>
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.convulsiones} onChange={e => set('convulsiones', e.target.checked)} className="rounded text-sky-600" />
            Convulsiones
          </label>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(['fiebre', 'tos', 'diarrea', 'vomitos'] as const).map(k => (
          <Campo key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}>
            <input value={form[k]} onChange={e => set(k, e.target.value)} className={inputCls} />
          </Campo>
        ))}
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold text-sky-800 flex items-center gap-1"><Calculator className="w-3.5 h-3.5" /> Dosis pediátricas por peso</p>
          <button type="button" onClick={calcularDosis} className="text-[11px] font-semibold px-2 py-1 bg-sky-600 text-white rounded-lg">Calcular</button>
        </div>
        {form.dosis_calculadas ? (
          <pre className="text-[11px] text-sky-900 whitespace-pre-wrap font-sans">{form.dosis_calculadas}</pre>
        ) : pesoKg ? (
          <ul className="text-[11px] text-sky-800 space-y-0.5">
            {calcularDosisPediatricas(pesoKg).map(d => (
              <li key={d.medicamento}><b>{d.medicamento}:</b> {d.dosis} {d.frecuencia}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-sky-600 italic">Ingrese peso en signos vitales para calcular dosis.</p>
        )}
      </div>

      <Campo label="Notas pediátricas">
        <textarea rows={2} value={form.notas_pediatria} onChange={e => set('notas_pediatria', e.target.value)} className={textareaCls} />
      </Campo>
    </div>
  )
}

function ChecklistTrimestre({
  titulo, items, json, onChange,
}: { titulo: string; items: readonly string[]; json: string; onChange: (v: string) => void }) {
  const estado = { ...checklistVacio(items), ...parseChecklist(json) }
  const toggle = (item: string) => {
    estado[item] = !estado[item]
    onChange(stringifyChecklist(estado))
  }
  return (
    <div className="rounded-lg border border-pink-100 bg-pink-50/30 p-3">
      <p className="text-xs font-bold text-pink-800 mb-2">{titulo}</p>
      <div className="space-y-1">
        {items.map(item => (
          <label key={item} className="flex items-start gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={!!estado[item]} onChange={() => toggle(item)} className="mt-0.5 rounded text-pink-600" />
            <span>{item}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function PanelGinecologia({
  form,
  onChange,
}: {
  form: FormGinecologia
  onChange: (f: FormGinecologia) => void
}) {
  const set = <K extends keyof FormGinecologia>(key: K, value: FormGinecologia[K]) =>
    onChange({ ...form, [key]: value })

  const onFumChange = (fum: string) => {
    const fechas = fum ? actualizarFechasGestacion(fum) : { fpp: '', semanas_gestacion: '' }
    onChange({ ...form, fum, ...fechas })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([
          ['menarquia', 'Menarquia (edad)'],
          ['ciclos_menstruales', 'Ciclos menstruales'],
          ['pap', 'Último PAP'],
          ['its', 'ITS / antecedentes'],
          ['mamografia', 'Mamografía'],
          ['planificacion', 'Planificación familiar'],
        ] as const).map(([key, label]) => (
          <Campo key={key} label={label}>
            <input value={form[key]} onChange={e => set(key, e.target.value)} className={inputCls} />
          </Campo>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {([
          ['gestas', 'Gestas'],
          ['partos', 'Partos'],
          ['cesareas', 'Cesáreas'],
          ['abortos', 'Abortos'],
          ['hijos_vivos', 'Hijos vivos'],
        ] as const).map(([key, label]) => (
          <Campo key={key} label={label}>
            <input
              type="number"
              min="0"
              value={form[key]}
              onChange={e => set(key, e.target.value)}
              className={inputCls}
            />
          </Campo>
        ))}
        <Campo label="Embarazo activo">
          <label className="flex items-center gap-2 h-[38px] px-3 border border-gray-200 rounded-lg bg-white cursor-pointer">
            <input type="checkbox" checked={form.embarazo_activo} onChange={e => set('embarazo_activo', e.target.checked)} className="rounded border-gray-300 text-pink-600" />
            <span className="text-sm text-gray-700">Sí</span>
          </label>
        </Campo>
        <Campo label="Riesgo prenatal">
          <select value={form.riesgo_prenatal} onChange={e => set('riesgo_prenatal', e.target.value as FormGinecologia['riesgo_prenatal'])} className={inputCls}>
            <option value="">—</option>
            <option value="bajo">Bajo</option>
            <option value="alto">Alto</option>
          </select>
        </Campo>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Campo label="FUM (última menstruación)">
          <input type="date" value={form.fum} onChange={e => onFumChange(e.target.value)} className={inputCls} />
        </Campo>
        <Campo label="FPP estimada">
          <input type="date" value={form.fpp} readOnly className={`${inputCls} bg-gray-50 text-gray-600`} />
        </Campo>
        <Campo label="Semanas de gestación">
          <input value={form.semanas_gestacion} readOnly className={`${inputCls} bg-gray-50 text-gray-600`} placeholder="Auto desde FUM" />
        </Campo>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([
          ['dolor_pelvico', 'Dolor pélvico'],
          ['sangrado', 'Sangrado'],
          ['flujo_vaginal', 'Flujo vaginal'],
        ] as const).map(([key, label]) => (
          <Campo key={key} label={label}>
            <input value={form[key]} onChange={e => set(key, e.target.value)} className={inputCls} />
          </Campo>
        ))}
      </div>

      {form.embarazo_activo && (
        <>
          <div>
            <p className="text-xs font-semibold text-red-700 uppercase mb-2 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> Alarmas obstétricas (presentes en esta consulta)
            </p>
            <div className="flex flex-wrap gap-3">
              {([
                ['alarma_sangrado', 'Sangrado anormal'],
                ['alarma_cefalea', 'Cefalea intensa'],
                ['alarma_edema', 'Edema importante'],
                ['alarma_dolor_epigastrico', 'Dolor epigástrico'],
                ['alarma_mov_fetales', '↓ Movimientos fetales'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-xs cursor-pointer text-red-900">
                  <input type="checkbox" checked={form[key]} onChange={e => set(key, e.target.checked)} className="rounded text-red-600" />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <ChecklistTrimestre titulo="1er trimestre" items={CHECKLIST_T1_ITEMS} json={form.checklist_t1} onChange={v => set('checklist_t1', v)} />
            <ChecklistTrimestre titulo="2do trimestre" items={CHECKLIST_T2_ITEMS} json={form.checklist_t2} onChange={v => set('checklist_t2', v)} />
            <ChecklistTrimestre titulo="3er trimestre" items={CHECKLIST_T3_ITEMS} json={form.checklist_t3} onChange={v => set('checklist_t3', v)} />
          </div>

          <div>
            <p className="text-xs font-semibold text-pink-800 uppercase mb-2">Plan de parto</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Hospital / centro recomendado">
                <input value={form.plan_parto_hospital} onChange={e => set('plan_parto_hospital', e.target.value)} className={inputCls} />
              </Campo>
              <Campo label="Signos de trabajo de parto">
                <input value={form.plan_parto_signos} onChange={e => set('plan_parto_signos', e.target.value)} className={inputCls} placeholder="Contracciones regulares, ruptura..." />
              </Campo>
              <Campo label="Notas plan de parto" className="sm:col-span-2">
                <textarea rows={2} value={form.plan_parto_notas} onChange={e => set('plan_parto_notas', e.target.value)} className={textareaCls} />
              </Campo>
            </div>
          </div>
        </>
      )}

      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Examen ginecológico</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {([
            ['examen_vulva', 'Vulva'],
            ['examen_especulo', 'Especuloscopía'],
            ['examen_tv', 'Tacto vaginal'],
          ] as const).map(([key, label]) => (
            <Campo key={key} label={label}>
              <textarea rows={2} value={form[key]} onChange={e => set(key, e.target.value)} className={textareaCls} />
            </Campo>
          ))}
        </div>
      </div>

      <Campo label="Notas ginecológicas">
        <textarea
          rows={3}
          value={form.notas_ginecologia}
          onChange={e => set('notas_ginecologia', e.target.value)}
          className={textareaCls}
          placeholder="Observaciones adicionales del enfoque ginecológico..."
        />
      </Campo>
    </div>
  )
}

export default function ConsultaEnfoqueClinico({
  enfoque,
  enfoqueSugerido,
  fechaNac,
  formPediatria,
  formGinecologia,
  formConsultaGeneral,
  formControlPrenatal,
  onEnfoqueChange,
  onPediatriaChange,
  onGinecologiaChange,
  onGeneralChange,
  onAplicarPlantilla,
  onControlPrenatalChange,
  onAgregarProtocoloLab,
  onConectarMedicamentos,
  onConectarEstudios,
  pesoPaciente,
  tallaPaciente,
}: Props) {
  const edadTexto = edadDetallada(fechaNac)
  const muestraSugerencia = enfoqueSugerido && enfoqueSugerido !== 'general' && enfoque !== enfoqueSugerido

  return (
    <div className="rounded-xl border border-violet-200 bg-gradient-to-br from-violet-50/90 to-white overflow-hidden">
      <div className="px-4 py-3 border-b border-violet-100 bg-white/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-violet-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Enfoque clínico
            </p>
            <p className="text-[11px] text-violet-600/80 mt-0.5">
              Complemento opcional — el examen general sigue igual
            </p>
          </div>
          {muestraSugerencia && (
            <button
              type="button"
              onClick={() => onEnfoqueChange(enfoqueSugerido!)}
              className="text-[11px] font-semibold text-violet-700 bg-violet-100 hover:bg-violet-200 px-2.5 py-1 rounded-full transition"
            >
              Sugerido: {etiquetaEnfoque(enfoqueSugerido!)}
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {ENFOQUES.map(({ id, icon: Icon, label }) => {
            const activo = enfoque === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => onEnfoqueChange(id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition ${
                  activo
                    ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-violet-300 hover:bg-violet-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="p-4">
        {enfoque === 'general' && formConsultaGeneral && onGeneralChange && onAplicarPlantilla && (
          <ConsultaPanelGeneral
            form={formConsultaGeneral}
            onChange={onGeneralChange}
            onAplicarPlantilla={onAplicarPlantilla}
            onConectarMedicamentos={onConectarMedicamentos}
            onConectarEstudios={onConectarEstudios}
            peso={pesoPaciente}
            talla={tallaPaciente}
          />
        )}
        {enfoque === 'pediatria' && (
          <PanelPediatria
            form={formPediatria}
            onChange={onPediatriaChange}
            edadTexto={edadTexto}
            pesoKg={pesoPaciente ? Number(pesoPaciente) : null}
          />
        )}
        {enfoque === 'ginecologia' && (
          <>
            <PanelGinecologia form={formGinecologia} onChange={onGinecologiaChange} />
            {formGinecologia.embarazo_activo && formControlPrenatal && onControlPrenatalChange && (
              <div className="mt-4">
                <ControlPrenatalPanel
                  form={formControlPrenatal}
                  onChange={onControlPrenatalChange}
                  onAgregarProtocoloLab={onAgregarProtocoloLab}
                  semanasAuto={formGinecologia.semanas_gestacion}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
