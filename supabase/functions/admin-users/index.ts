// Supabase Edge Function: admin-users
// Handles all admin user operations (create, delete, reset-password, force-signout)
// Deploy via Supabase Dashboard > Edge Functions

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
        const { data, error } = await adminClient.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { full_name },
        })
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
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
          return new Response(JSON.stringify({ error: profErr.message }), {
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
        // Delete claims, profile, then auth user
        await adminClient.from('shift_claims').delete().eq('claimed_by', userId)
        await adminClient.from('profiles').delete().eq('id', userId)
        const { error } = await adminClient.auth.admin.deleteUser(userId)
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
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
        const { error } = await adminClient.auth.admin.updateUserById(userId, { password })
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        await logAudit('reset-password', 'user', userId)
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'force-signout': {
        const { userId } = body
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
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
