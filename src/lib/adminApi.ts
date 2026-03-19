import { supabase } from './supabase'

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`

async function callAdminFunction(body: Record<string, unknown>) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const res = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`)
  }
  return data
}

export async function createUser(email: string, password: string, full_name: string, role = 'employee') {
  return callAdminFunction({ action: 'create-user', email, password, full_name, role })
}

export async function deleteUser(userId: string) {
  return callAdminFunction({ action: 'delete-user', userId })
}

export async function resetPassword(userId: string, password: string) {
  return callAdminFunction({ action: 'reset-password', userId, password })
}

export async function forceSignout(userId: string) {
  return callAdminFunction({ action: 'force-signout', userId })
}
