export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      sucursales: {
        Row: {
          id: number
          nombre: string
          ciudad: string | null
          direccion: string | null
          telefono: string | null
          email: string | null
          rtn: string | null
          cai: string | null
          num_min: number
          num_max: number
          fecha_limite: string | null
          tercera_edad: number
          por_descuento: number
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['sucursales']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['sucursales']['Insert']>
      }
      roles: {
        Row: {
          id: number
          nombre: string
          descripcion: string | null
          es_admin: boolean
          color: string
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['roles']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['roles']['Insert']>
      }
      perfiles: {
        Row: {
          id: string
          nombre: string | null
          apellido: string | null
          cedula: string | null
          telefono: string | null
          avatar_url: string | null
          sucursal_id: number | null
          rol_id: number | null
          activo: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['perfiles']['Row'], 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['perfiles']['Insert']>
      }
      modulos: {
        Row: {
          id: number
          clave: string
          nombre: string
          icono: string | null
          orden: number
          activo: boolean
        }
        Insert: Omit<Database['public']['Tables']['modulos']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['modulos']['Insert']>
      }
    }
    Views: {
      mis_permisos: {
        Row: { modulo: string; accion: string }
      }
    }
  }
}

export type Sucursal = Database['public']['Tables']['sucursales']['Row']
export type Perfil   = Database['public']['Tables']['perfiles']['Row']
export type Rol      = Database['public']['Tables']['roles']['Row']
export type Modulo   = Database['public']['Tables']['modulos']['Row']
