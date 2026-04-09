import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env file.')
}

// Give every browser tab its own unique storageKey so that multiple users
// logged in simultaneously (in different tabs) cannot overwrite each other's
// sessions. The unique key also scopes the Supabase BroadcastChannel to this
// tab only, preventing cross-tab SIGNED_IN / SIGNED_OUT events from kicking
// other users out.
//
// We use sessionStorage only to hold the tab's UUID (it's tab-scoped by the
// browser so each tab gets a different ID). The Supabase client itself keeps
// using the default localStorage so that OAuth PKCE code verifiers survive the
// Google redirect round-trip — switching to sessionStorage for the client
// storage broke that flow.
let tabKey = window.sessionStorage.getItem('_sb_tab_key')
if (!tabKey) {
  tabKey = crypto.randomUUID()
  window.sessionStorage.setItem('_sb_tab_key', tabKey)
}

// Remove stale Supabase session entries from localStorage that belong to
// other tabs or previous deploys. Supabase JS v2 tries to refresh any
// expired session it finds on startup, and if the network call hangs the
// entire initialization locks up. We keep only this tab's own key.
const myStorageKey = `sb-${tabKey}`
Object.keys(localStorage)
  .filter(k => k.startsWith('sb-') && !k.startsWith(myStorageKey))
  .forEach(k => localStorage.removeItem(k))

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: myStorageKey,
  },
})
