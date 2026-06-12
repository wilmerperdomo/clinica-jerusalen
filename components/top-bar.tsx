'use client'



import NotificationBell from './notification-bell'
import SucursalNombre from './sucursal-nombre'



interface Props {

  userName?:       string

  sucursalNombre?: string

}



function saludo() {

  const h = new Date().getHours()

  return h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches'

}



function fechaHoy() {

  return new Date().toLocaleDateString('es-HN', {

    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',

  })

}



export default function TopBar({ userName, sucursalNombre }: Props) {

  const nombre = userName?.trim() || 'Usuario'



  return (

    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 px-4 md:px-6 py-3 bg-white/80 backdrop-blur border-b border-slate-100">

      {/* Espacio para el botón hamburguesa en móvil */}

      <div className="w-10 shrink-0 md:w-0" />



      <div className="flex-1 min-w-0">

        <p className="text-sm font-semibold text-slate-800 truncate">

          {saludo()}, {nombre} 👋

        </p>

        <p className="text-xs text-slate-500 truncate capitalize mt-0.5">

          <SucursalNombre
            inicial={sucursalNombre}
            className="text-blue-600 font-medium"
          />
          <span className="mx-1.5 text-slate-300">·</span>

          <span>{fechaHoy()}</span>

        </p>

      </div>



      <div className="flex items-center gap-2 shrink-0">

        <NotificationBell />

      </div>

    </header>

  )

}


