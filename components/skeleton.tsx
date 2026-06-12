import { cn } from '@/lib/utils'

// ── Bloque base animado ───────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-lg bg-slate-200', className)} />
  )
}

// ── Fila de tabla ────────────────────────────────────────────────
export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  )
}

// ── Tarjeta KPI ──────────────────────────────────────────────────
export function SkeletonKpi() {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-8 rounded-xl" />
      </div>
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-32" />
    </div>
  )
}

// ── Lista de tabla con N filas ────────────────────────────────────
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      {/* header */}
      <div className="bg-slate-50 px-4 py-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {/* rows */}
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex gap-4 items-center">
            {Array.from({ length: cols }).map((_, j) => (
              <Skeleton key={j} className={`h-4 flex-1 ${j === 0 ? 'max-w-[180px]' : ''}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Page skeleton completa (KPIs + tabla) ────────────────────────
export function SkeletonPage({ kpis = 4, rows = 8, cols = 5 }: { kpis?: number; rows?: number; cols?: number }) {
  return (
    <div className="p-6 space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
        <Skeleton className="h-9 w-36 rounded-xl" />
      </div>
      {/* kpis */}
      <div className={`grid gap-3 grid-cols-2 md:grid-cols-${Math.min(kpis, 4)}`}>
        {Array.from({ length: kpis }).map((_, i) => <SkeletonKpi key={i} />)}
      </div>
      {/* filtros */}
      <div className="flex gap-3">
        <Skeleton className="h-9 flex-1 rounded-xl" />
        <Skeleton className="h-9 w-36 rounded-xl" />
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>
      {/* tabla */}
      <SkeletonTable rows={rows} cols={cols} />
    </div>
  )
}
