import { createServerClient } from '@supabase/ssr'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

import { cookies } from 'next/headers'

import { getPublicSupabaseEnv, getServiceRoleKey } from '@/lib/supabase/env'



export async function createClient() {

  const env = getPublicSupabaseEnv()

  if (!env) return null



  const cookieStore = await cookies()



  return createServerClient(env.url, env.anonKey, {

    cookies: {

      getAll() {

        return cookieStore.getAll()

      },

      setAll(cookiesToSet) {

        try {

          cookiesToSet.forEach(({ name, value, options }) =>

            cookieStore.set(name, value, options)

          )

        } catch {

          // Server Component — cookies de solo lectura

        }

      },

    },

  })

}



/** Cliente con service role — solo usar en Server Components para bypasear RLS */

export function createAdminClient() {

  const env = getPublicSupabaseEnv()

  const serviceKey = getServiceRoleKey()

  if (!env) return null



  return createSupabaseClient(env.url, serviceKey, {

    auth: { autoRefreshToken: false, persistSession: false },

  })

}


