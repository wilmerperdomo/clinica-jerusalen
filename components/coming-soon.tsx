import Header from '@/components/header'
import { Construction } from 'lucide-react'

interface ComingSoonProps {
  title:       string
  description: string
  icon?:       React.ElementType
}

export default function ComingSoon({ title, description, icon: Icon = Construction }: ComingSoonProps) {
  return (
    <>
      <Header title={title} />
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-blue-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">{title}</h2>
        <p className="text-slate-500 text-sm max-w-sm">{description}</p>
        <div className="mt-6 px-4 py-2 bg-blue-50 text-blue-600 text-xs font-medium rounded-full">
          Módulo en desarrollo
        </div>
      </main>
    </>
  )
}
