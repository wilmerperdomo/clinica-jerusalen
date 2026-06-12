'use client'

import Link from 'next/link'
import {
  Search, BookOpen, FileText, Stethoscope, FlaskConical,
  ClipboardList, Shield, History,
} from 'lucide-react'
import { ModuleShell, ModuleHero, ModuleContent } from '@/components/module-layout'

export interface ExpedientePacienteRow {
  id: number
  codigo: string
  nombre: string | null
  apellido1: string | null
  apellido2: string | null
  fecha_nac: string | null
  genero: string | null
  celular: string | null
  foto_url: string | null
}

interface Props {
  pacientes: ExpedientePacienteRow[]
  q?: string
}

function calcEdad(fecha?: string | null) {
  if (!fecha) return null
  const diff = Date.now() - new Date(fecha + 'T00:00:00').getTime()
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000))
}

export default function ExpedienteIndexClient({ pacientes, q }: Props) {
  return (
    <ModuleShell tint="cyan">
      <ModuleHero
        title="Expediente Clínico"
        subtitle="Historial médico consolidado por paciente"
        badge="Consulta · Solo lectura"
        icon={BookOpen}
        gradient="cyan"
      />

      <ModuleContent maxWidth="3xl">
        <div className="bg-white rounded-2xl border shadow-sm p-5 sm:p-6 mb-6">
          <h2 className="text-sm font-bold text-[#003366] uppercase tracking-wide flex items-center gap-2 mb-3">
            <ClipboardList className="w-4 h-4" />
            Función del módulo
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            El expediente clínico es la <strong>vista unificada del historial médico</strong> de cada paciente.
            Reúne en un solo lugar las consultas atendidas, recetas, signos vitales, diagnósticos y resultados
            de laboratorio — sin modificar datos clínicos (eso se hace en Consultas y en la ficha del paciente).
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {[
              { icon: History, label: 'Historial de consultas', desc: 'Motivo, examen físico, diagnóstico y tratamiento' },
              { icon: Stethoscope, label: 'Recetas médicas', desc: 'Medicamentos prescritos por consulta, listos para imprimir' },
              { icon: FlaskConical, label: 'Laboratorio', desc: 'Órdenes, estados y resultados vinculados al paciente' },
              { icon: Shield, label: 'Antecedentes y alertas', desc: 'Alergias, antecedentes personales y familiares' },
            ].map(item => (
              <div key={item.label} className="flex gap-3 rounded-xl bg-slate-50 border border-slate-100 px-3 py-3">
                <item.icon className="w-5 h-5 text-[#003366] shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <form method="get" className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            name="q"
            defaultValue={q}
            className="w-full pl-11 pr-4 py-3.5 bg-white border border-slate-200 rounded-xl text-sm
                       focus:ring-2 focus:ring-[#003366]/20 focus:border-[#003366] outline-none shadow-sm"
            placeholder="Buscar por nombre, apellido o número de identidad..."
            autoFocus
            autoComplete="off"
          />
        </form>

        {!q?.trim() && (
          <p className="text-xs text-slate-400 mb-3 px-1">
            Escriba al menos un criterio de búsqueda o revise los últimos pacientes registrados.
          </p>
        )}

        {pacientes.length > 0 ? (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b bg-slate-50 text-xs text-slate-500 uppercase tracking-wide font-semibold">
              {q?.trim()
                ? `${pacientes.length} resultado(s) para «${q}»`
                : `Últimos ${pacientes.length} pacientes activos`}
            </div>
            <div className="divide-y divide-slate-100">
              {pacientes.map(p => {
                const nombre = `${p.nombre ?? ''} ${p.apellido1 ?? ''} ${p.apellido2 ?? ''}`.trim()
                const edad = calcEdad(p.fecha_nac)
                const inicia = nombre.slice(0, 2).toUpperCase()
                return (
                  <Link
                    key={p.id}
                    href={`/expediente/${p.id}`}
                    className="flex items-center gap-4 px-4 py-3.5 hover:bg-cyan-50/60 transition group"
                  >
                    {p.foto_url
                      ? <img src={p.foto_url} alt="" className="avatar-photo w-11 h-11 rounded-full border-2 border-slate-200 shrink-0" />
                      : <div className="w-11 h-11 rounded-full bg-[#003366]/10 text-[#003366] flex items-center justify-center text-sm font-bold shrink-0">
                          {inicia}
                        </div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 group-hover:text-[#003366] transition">{nombre}</p>
                      <p className="text-xs text-slate-400">
                        {p.codigo}
                        {edad !== null ? ` · ${edad} años` : ''}
                        {p.genero ? ` · ${p.genero}` : ''}
                      </p>
                    </div>
                    <span className="hidden sm:flex items-center gap-1.5 text-xs font-medium text-slate-400 group-hover:text-[#003366] transition">
                      Ver expediente
                      <FileText className="w-4 h-4" />
                    </span>
                  </Link>
                )
              })}
            </div>
          </div>
        ) : q?.trim() ? (
          <div className="text-center py-14 text-slate-400 bg-white rounded-2xl border">
            <Search className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No se encontraron pacientes con «{q}»</p>
            <Link href="/expediente" className="text-xs text-[#003366] hover:underline mt-2 inline-block">
              Limpiar búsqueda
            </Link>
          </div>
        ) : null}
      </ModuleContent>
    </ModuleShell>
  )
}
