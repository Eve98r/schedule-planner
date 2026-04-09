import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check .env file.')
}

// Give every browser tab its own unique storage key so that multiple users
// logged in simultaneously (in different tabs) cannot overwrite each other's
// sessions via the shared localStorage key that Supabase uses by default.
// sessionStorage is already tab-isolated by the browser, and using a unique
// storageKey also scopes the BroadcastChannel to this tab only, preventing
// cross-tab SIGNED_IN / SIGNED_OUT events from kicking other users out.
let tabKey = window.sessionStorage.getItem('_sb_tab_key')
if (!tabKey) {
  tabKey = crypto.randomUUID()
  window.sessionStorage.setItem('_sb_tab_key', tabKey)
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: window.sessionStorage,
    storageKey: `sb-${tabKey}`,
  },
})
