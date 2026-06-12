export default function Loading() {
  return (
    <div className="p-4 sm:p-6 animate-pulse space-y-5">
      <div className="h-12 bg-slate-100 rounded-xl w-80" />
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 bg-slate-100 rounded-2xl" />
        ))}
      </div>
      <div className="h-12 bg-slate-100 rounded-xl" />
      <div className="h-96 bg-slate-100 rounded-2xl" />
    </div>
  )
}
