// Supabase Edge Function: admin-users
// Handles all admin user operations (create, delete, reset-password, force-signout)
// Deploy via Supabase Dashboard > Edge Functions

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/** Map internal error messages to safe user-facing messages */
function safeErrorMessage(raw: string): string {
  if (/duplicate.*email|email.*already.*registered/i.test(raw)) return 'An account with this email already exists.'
  if (/invalid.*password|password.*too/i.test(raw)) return 'Invalid password. Must be at least 6 characters.'
  if (/user.*not.*found/i.test(raw)) return 'User not found.'
  if (/duplicate key/i.test(raw)) return 'This record already exists.'
  if (/violates.*foreign key/i.test(raw)) return 'Referenced record not found.'
  return 'Operation failed. Please try again.'
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the caller is authenticated and is an admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify the user's JWT by calling the auth API directly
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: authHeader,
        apikey: Deno.env.get('SUPABASE_ANON_KEY')!,
      },
    })
    const userBody = await userRes.json()
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const user = userBody

    // Check admin role from profiles table using service role client
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: profile } = await adminClient.from('profiles').select('role').eq('id', user.id).single()
    if (!profile || profile.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const logAudit = async (action: string, targetType: string, targetId: string, details: Record<string, unknown> = {}) => {
      try {
        await adminClient.from('audit_log').insert({
          actor_id: user.id,
          action,
          target_type: targetType,
          target_id: targetId,
          details,
        })
      } catch { /* best-effort logging */ }
    }

    const body = await req.json()
    const { action } = body

    switch (action) {
      case 'create-user': {
        const { email, password, full_name, role = 'employee' } = body
        if (!email || typeof email !== 'string' || !password || typeof password !== 'string' || !full_name || typeof full_name !== 'string') {
          return new Response(JSON.stringify({ error: 'Missing required fields: email, password, full_name' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (!['employee', 'admin'].includes(role)) {
          return new Response(JSON.stringify({ error: 'Invalid role. Must be "employee" or "admin".' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const { data, error } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name },
        })
        if (error) {
          return new Response(JSON.stringify({ error: safeErrorMessage(error.message) }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        // Create profile
        const { error: profErr } = await adminClient.from('profiles').insert({
          id: data.user.id,
          email,
          full_name,
          role,
        })
        if (profErr) {
          return new Response(JSON.stringify({ error: safeErrorMessage(profErr.message) }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        await logAudit('create-user', 'user', data.user.id, { email, full_name, role })
        return new Response(JSON.stringify({ user: { id: data.user.id, email, full_name, role } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'delete-user': {
        const { userId } = body
        if (!userId || typeof userId !== 'string') {
          return new Response(JSON.stringify({ error: 'Missing or invalid userId' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        // Delete claims, profile, then auth user
        await adminClient.from('shift_claims').delete().eq('claimed_by', userId)
        await adminClient.from('profiles').delete().eq('id', userId)
        const { error } = await adminClient.auth.admin.deleteUser(userId)
        if (error) {
          return new Response(JSON.stringify({ error: safeErrorMessage(error.message) }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        await logAudit('delete-user', 'user', userId)
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'reset-password': {
        const { userId, password } = body
        if (!userId || typeof userId !== 'string' || !password || typeof password !== 'string') {
          return new Response(JSON.stringify({ error: 'Missing or invalid userId/password' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const { error } = await adminClient.auth.admin.updateUserById(userId, { password })
        if (error) {
          return new Response(JSON.stringify({ error: safeErrorMessage(error.message) }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        await logAudit('reset-password', 'user', userId)
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'reset-all-passwords': {
        const { users } = body
        if (!Array.isArray(users) || users.length === 0) {
          return new Response(JSON.stringify({ error: 'Missing or empty users array' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const results: { userId: string; success: boolean }[] = []
        for (const u of users) {
          if (!u.userId || typeof u.userId !== 'string' || !u.password || typeof u.password !== 'string') {
            results.push({ userId: u.userId || 'unknown', success: false })
            continue
          }
          const { error } = await adminClient.auth.admin.updateUserById(u.userId, { password: u.password })
          results.push({ userId: u.userId, success: !error })
          if (!error) {
            // Fire-and-forget signout
            fetch(`${supabaseUrl}/auth/v1/admin/users/${u.userId}`, {
              method: 'PUT',
              headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ app_metadata: { force_signout: Date.now() } }),
            }).catch(() => {})
          }
        }
        const successCount = results.filter(r => r.success).length
        await logAudit('reset-all-passwords', 'bulk', user.id, { count: successCount, total: users.length })
        return new Response(JSON.stringify({ results, successCount }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'force-signout': {
        const { userId } = body
        if (!userId || typeof userId !== 'string') {
          return new Response(JSON.stringify({ error: 'Missing or invalid userId' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        // Delete MFA factors to invalidate sessions
        await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}/factors`, {
          method: 'DELETE',
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        }).catch(() => {})
        // Force token refresh by updating app_metadata
        await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
          method: 'PUT',
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ app_metadata: { force_signout: Date.now() } }),
        }).catch(() => {})
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
  } catch (err) {
    console.error('admin-users error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error. Please try again.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
