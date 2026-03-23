import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { UserPlus, Check, X, Copy, Download, Trash2, Upload, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { createUser as apiCreateUser, deleteUser as apiDeleteUser, resetPassword as apiResetPassword, resetAllPasswords as apiResetAllPasswords, forceSignout as apiForceSignout } from '@/lib/adminApi'
import { toast } from 'sonner'
import { friendlyError } from '@/lib/errorMessages'
import * as XLSX from 'xlsx'

interface ExistingUser {
  id: string
  full_name: string
  email: string
  role: string
}

interface PendingUser {
  name: string
  email: string
  password: string
  allowed: boolean
}

interface CreatedUser {
  name: string
  email: string
  password: string
}

function generatePassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%'
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  let pw = ''
  for (let i = 0; i < 12; i++) {
    pw += chars[bytes[i] % chars.length]
  }
  return pw
}

function nameToEmail(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9.]/g, '') + '@hgrs.us'
}

interface EmployeeInfo {
  name: string
  email: string
  isDefault: boolean
}

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_ROWS = 10_000
const ALLOWED_EXTENSIONS = ['.xlsx', '.csv']

async function parseEmployeeInfo(file: File): Promise<EmployeeInfo[]> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed: 5 MB.`)
  }
  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Invalid file type "${ext}". Only .xlsx and .csv files are accepted.`)
  }
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target!.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true })
  if (raw.length > MAX_ROWS) {
    throw new Error(`File contains too many rows (${raw.length}). Maximum allowed: ${MAX_ROWS}.`)
  }

  const results: EmployeeInfo[] = []
  for (const row of raw) {
    const arr = row as unknown[]
    if (!arr[0] || !arr[1]) continue
    const col0 = String(arr[0]).trim()
    const col1 = String(arr[1]).trim()
    const col2 = String(arr[2] ?? '').trim().toLowerCase()
    // Skip header row
    if (col0.toLowerCase() === 'email' || col1.toLowerCase() === 'full_name') continue
    // Column A = email, Column B = name, Column C = default_employees
    const email = col0
    const name = col1
    if (!email.includes('@')) continue
    results.push({ name, email, isDefault: col2 === 'default' })
  }
  return results
}

import type { Profile } from '@/types'
import { Lock } from 'lucide-react'

interface UserManagerProps {
  profile: Profile
}

export function UserManager({ profile: currentUser }: UserManagerProps) {
  const [employeeNames, setEmployeeNames] = useState<string[]>([])
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set())
  const [existingUsers, setExistingUsers] = useState<ExistingUser[]>([])
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createdUsers, setCreatedUsers] = useState<CreatedUser[]>([])
  const [showResults, setShowResults] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ExistingUser | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteAll, setShowDeleteAll] = useState(false)
  const [showResetAll, setShowResetAll] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetTarget, setResetTarget] = useState<ExistingUser | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [manualForm, setManualForm] = useState({ name: '', email: '', password: '', role: 'employee' })
  const [manualCreating, setManualCreating] = useState(false)
  // Password map — persisted in localStorage so passwords survive page reloads
  const [passwordMap, setPasswordMap] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('sp_passwords') || '{}')
    } catch {
      return {}
    }
  })
  const [showPasswords, setShowPasswords] = useState(false)
  // Sync passwordMap to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('sp_passwords', JSON.stringify(passwordMap))
  }, [passwordMap])

  const [employeeInfoMap, setEmployeeInfoMap] = useState<Record<string, string>>({})
  const employeeInfoRef = useRef<HTMLInputElement>(null)

  const fetchUsers = async () => {
    const [schedRes, profRes] = await Promise.all([
      supabase.from('default_schedules').select('employee'),
      supabase.from('profiles').select('id, full_name, email, role'),
    ])
    const allNames = [...new Set((schedRes.data ?? []).map((r) => r.employee))].sort()
    const profiles = (profRes.data ?? []) as ExistingUser[]
    const existing = new Set(profiles.map((p) => p.full_name))
    setEmployeeNames(allNames)
    setExistingNames(existing)
    // Sort: current user first, then admins, then alphabetical
    setExistingUsers(profiles.sort((a, b) => {
      if (a.id === currentUser.id) return -1
      if (b.id === currentUser.id) return 1
      if (a.role === 'admin' && b.role !== 'admin') return -1
      if (a.role !== 'admin' && b.role === 'admin') return 1
      return a.full_name.localeCompare(b.full_name)
    }))
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const missingNames = employeeNames.filter((n) => !existingNames.has(n))

  const [importedEmployees, setImportedEmployees] = useState<EmployeeInfo[]>([])

  const handleImportEmployeeInfo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const rows = await parseEmployeeInfo(file)
      setImportedEmployees(rows)
      const map: Record<string, string> = { ...employeeInfoMap }
      for (const r of rows) {
        map[r.name] = r.email
      }
      setEmployeeInfoMap(map)
      const defaultCount = rows.filter((r) => r.isDefault).length
      toast.success(`Imported ${rows.length} employees (${defaultCount} marked as default)`)
    } catch {
      toast.error('Failed to parse employee info file')
    }
    e.target.value = ''
  }

  // Only create accounts for employees marked as "default" in the imported file
  const namesToCreate = importedEmployees.length > 0
    ? importedEmployees
        .filter((e) => e.isDefault && !existingNames.has(e.name))
        .map((e) => e.name)
    : missingNames

  const handleOpen = () => {
    setPendingUsers(
      namesToCreate.map((name) => ({
        name,
        email: employeeInfoMap[name] ?? nameToEmail(name),
        password: generatePassword(),
        allowed: true,
      }))
    )
    setShowDialog(true)
  }

  const toggleUser = (index: number) => {
    setPendingUsers((prev) =>
      prev.map((u, i) => (i === index ? { ...u, allowed: !u.allowed } : u))
    )
  }

  const allowAll = () => {
    setPendingUsers((prev) => prev.map((u) => ({ ...u, allowed: true })))
  }

  const disallowAll = () => {
    setPendingUsers((prev) => prev.map((u) => ({ ...u, allowed: false })))
  }

  const handleCreate = async () => {
    const toCreate = pendingUsers.filter((u) => u.allowed)
    if (toCreate.length === 0) {
      toast.error('No users selected')
      return
    }

    setCreating(true)

    const results = await Promise.allSettled(
      toCreate.map(async (u) => {
        await apiCreateUser(u.email, u.password, u.name, 'employee')
        return { name: u.name, email: u.email, password: u.password } as CreatedUser
      })
    )

    const created: CreatedUser[] = []
    let errors = 0
    for (const r of results) {
      if (r.status === 'fulfilled') {
        created.push(r.value)
      } else {
        errors++
      }
    }

    setCreating(false)
    setShowDialog(false)
    setCreatedUsers(created)
    setShowResults(true)
    setExistingNames((prev) => {
      const next = new Set(prev)
      for (const c of created) next.add(c.name)
      return next
    })

    // Store passwords for display
    setPasswordMap((prev) => {
      const next = { ...prev }
      for (const c of created) next[c.email] = c.password
      return next
    })

    if (created.length > 0) toast.success(`Created ${created.length} users`)
    if (errors > 0) toast.error(`${errors} users failed`)
    fetchUsers()
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)

    try {
      await apiDeleteUser(deleteTarget.id)
      toast.success(`Deleted ${deleteTarget.full_name}`)
    } catch (err) {
      toast.error(`Failed to delete ${deleteTarget.full_name}: ${friendlyError(err)}`)
    }

    setDeleting(false)
    setDeleteTarget(null)
    fetchUsers()
  }

  const handleDeleteAll = async () => {
    setDeleting(true)

    const usersToDelete = existingUsers.filter((u) => u.id !== currentUser.id)
    const results = await Promise.allSettled(
      usersToDelete.map((u) => apiDeleteUser(u.id))
    )

    let deleted = 0
    let errors = 0
    for (const r of results) {
      if (r.status === 'fulfilled') deleted++
      else errors++
    }

    setDeleting(false)
    setShowDeleteAll(false)
    if (deleted > 0) toast.success(`Deleted ${deleted} users`)
    if (errors > 0) toast.error(`${errors} deletions failed`)
    fetchUsers()
  }

  const signOutUser = async (userId: string) => {
    try {
      await apiForceSignout(userId)
    } catch {
      // Best-effort sign out
    }
  }

  const handleResetAllPasswords = async () => {
    setResetting(true)

    const usersToReset = existingUsers.filter((u) => u.id !== currentUser.id)
    const userPasswords = usersToReset.map((u) => ({ userId: u.id, email: u.email, password: generatePassword() }))

    try {
      const { results, successCount } = await apiResetAllPasswords(
        userPasswords.map((u) => ({ userId: u.userId, password: u.password }))
      )

      const newPasswords: Record<string, string> = {}
      for (let i = 0; i < results.length; i++) {
        if (results[i].success) {
          newPasswords[userPasswords[i].email] = userPasswords[i].password
        }
      }

      const errors = results.length - successCount
      setPasswordMap((prev) => ({ ...prev, ...newPasswords }))
      setShowPasswords(true)
      if (successCount > 0) toast.success(`Reset ${successCount} passwords`)
      if (errors > 0) toast.error(`${errors} resets failed`)
    } catch {
      toast.error('Failed to reset passwords')
    }

    setResetting(false)
    setShowResetAll(false)
  }

  const handleResetSingle = async () => {
    if (!resetTarget) return
    const newPw = generatePassword()
    try {
      await apiResetPassword(resetTarget.id, newPw)
      setPasswordMap((prev) => ({ ...prev, [resetTarget.email]: newPw }))
      setShowPasswords(true)
      if (resetTarget.id !== currentUser.id) {
        await signOutUser(resetTarget.id)
      }
      toast.success(`Password reset for ${resetTarget.full_name}`)
    } catch (err) {
      toast.error(`Failed: ${friendlyError(err)}`)
    }
    setResetTarget(null)
  }

  const handleManualCreate = async () => {
    if (!manualForm.name || !manualForm.email || !manualForm.password) {
      toast.error('All fields are required')
      return
    }
    setManualCreating(true)

    try {
      await apiCreateUser(manualForm.email, manualForm.password, manualForm.name, manualForm.role)
      toast.success(`Created ${manualForm.name}`)
      setPasswordMap((prev) => ({ ...prev, [manualForm.email]: manualForm.password }))
    } catch (err) {
      toast.error(friendlyError(err))
    }

    setManualCreating(false)
    setShowManual(false)
    setManualForm({ name: '', email: '', password: '', role: 'employee' })
    fetchUsers()
  }

  const copyCredentials = () => {
    const text = createdUsers
      .map((u) => `${u.name} | ${u.email} | ${u.password}`)
      .join('\n')
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const exportCredentials = () => {
    const rows = createdUsers.map((u) => ({
      Name: u.name,
      Email: u.email,
      Password: u.password,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Credentials')
    XLSX.writeFile(wb, 'user-credentials.xlsx')
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="shrink-0">
        <div className="pb-2">
          <h3 className="text-base font-semibold">User Accounts</h3>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {namesToCreate.length} employees ready to create.
            {existingNames.size > 0 && ` ${existingNames.size} already have accounts.`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              ref={employeeInfoRef}
              accept=".xlsx,.csv"
              onChange={handleImportEmployeeInfo}
              className="hidden"
            />
            <Button variant="outline" onClick={() => employeeInfoRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Import Employee Info
            </Button>
            <Button
              variant="outline"
              disabled={namesToCreate.length === 0}
              onClick={handleOpen}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Create Users from Imported File
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setManualForm({ name: '', email: '', password: generatePassword(), role: 'employee' })
                setShowManual(true)
              }}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Create Users Manually
            </Button>
            {importedEmployees.length > 0 && (
              <span className="text-xs text-green-600">
                {importedEmployees.length} emails loaded
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Existing users list */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-2 shrink-0 mb-2">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold shrink-0">Existing Users ({existingUsers.length})</h3>
            <input
              type="text"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search name or email..."
              className="flex h-8 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="flex gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowPasswords(!showPasswords)}
            >
              {showPasswords ? <EyeOff className="mr-1 h-3 w-3" /> : <Eye className="mr-1 h-3 w-3" />}
              {showPasswords ? 'Hide' : 'Show'} Passwords
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={existingUsers.length <= 1}
              onClick={() => setShowResetAll(true)}
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              Reset All Passwords
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={existingUsers.length <= 1}
              onClick={() => setShowDeleteAll(true)}
            >
              <Trash2 className="mr-1 h-3 w-3" />
              Delete All
            </Button>
          </div>
          </div>
        </div>
        <div className="flex-1 overflow-hidden min-h-0">
          {existingUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users yet.</p>
          ) : (
            <div className="flex flex-col h-full rounded-lg border border-border/10 overflow-hidden">
              <div className="border-b border-border/30 bg-gradient-to-b from-[#f0ede9] to-[#e6e3de] shadow-[0_1px_2px_rgba(0,0,0,0.06)] shrink-0">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr>
                      <th className="w-[25%] px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground/80 tracking-wide">Name</th>
                      <th className="w-[30%] px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground/80 tracking-wide">Email</th>
                      <th className="w-[20%] px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground/80 tracking-wide">Password</th>
                      <th className="w-[15%] px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground/80 tracking-wide">Role</th>
                      <th className="w-[10%] px-3 py-2.5"></th>
                    </tr>
                  </thead>
                </table>
              </div>
              <div className="overflow-auto flex-1">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col className="w-[25%]" />
                  <col className="w-[30%]" />
                  <col className="w-[20%]" />
                  <col className="w-[15%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <tbody>
                  {existingUsers.filter((u) => {
                    if (!userSearch) return true
                    const q = userSearch.toLowerCase()
                    return (
                      u.full_name.toLowerCase().includes(q) ||
                      u.email.toLowerCase().includes(q)
                    )
                  }).map((u, idx) => {
                    const isMe = u.id === currentUser.id
                    return (
                      <tr key={u.id} className={`transition-colors hover:bg-muted/20 ${idx % 2 === 0 ? 'bg-transparent' : 'bg-muted/10'}`}>
                        <td className="px-3 py-2 flex items-center gap-1">
                          {isMe && <Lock className="h-3 w-3 text-muted-foreground" />}
                          {u.full_name}
                          {isMe && <span className="text-xs text-muted-foreground">(you)</span>}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            {u.email}
                            <button
                              className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                              onClick={() => { navigator.clipboard.writeText(u.email); toast.success('Email copied') }}
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {u.role === 'admin' ? (
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <svg className="h-3 w-3" viewBox="0 0 24 24">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                              </svg>
                              <span className="font-sans text-xs">Google Sign-In</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              {passwordMap[u.email]
                                ? showPasswords
                                  ? passwordMap[u.email]
                                  : '••••••••'
                                : <span className="text-muted-foreground">—</span>}
                              {passwordMap[u.email] && (
                                <button
                                  className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                                  onClick={() => { navigator.clipboard.writeText(passwordMap[u.email]); toast.success('Password copied') }}
                                >
                                  <Copy className="h-3 w-3" />
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">{u.role}</td>
                        <td className="px-3 py-2 text-right flex justify-end gap-0.5">
                          {u.role !== 'admin' && (
                            <button
                              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors"
                              onClick={() => setResetTarget(u)}
                            >
                              <RefreshCw className="h-3 w-3" />
                            </button>
                          )}
                          {!isMe && (
                            <button
                              className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-destructive transition-colors"
                              onClick={() => setDeleteTarget(u)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Permanently delete <strong>{deleteTarget?.full_name}</strong> ({deleteTarget?.email})?
              This removes their account and profile. Their shift claims will remain.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete all confirmation dialog */}
      <Dialog open={showDeleteAll} onOpenChange={setShowDeleteAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete All Users</DialogTitle>
            <DialogDescription>
              This will permanently delete all {existingUsers.length - 1} users except your own admin account. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteAll(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteAll} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete All Users'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset all passwords dialog */}
      <Dialog open={showResetAll} onOpenChange={setShowResetAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset All Passwords</DialogTitle>
            <DialogDescription>
              Generate new random passwords for all {existingUsers.length - 1} users (except your admin account). Old passwords will stop working immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetAll(false)}>Cancel</Button>
            <Button onClick={handleResetAllPasswords} disabled={resetting}>
              {resetting ? 'Resetting...' : 'Reset All Passwords'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset single password dialog */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Generate a new random password for <strong>{resetTarget?.full_name}</strong> ({resetTarget?.email})? Their current password will stop working immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button onClick={handleResetSingle}>Reset Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual user creation dialog */}
      <Dialog open={showManual} onOpenChange={setShowManual}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create User Manually</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Full Name</label>
              <input
                value={manualForm.name}
                onChange={(e) => setManualForm((f) => ({ ...f, name: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Email</label>
              <input
                type="email"
                value={manualForm.email}
                onChange={(e) => setManualForm((f) => ({ ...f, email: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="john@example.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Password</label>
              <input
                value={manualForm.password}
                onChange={(e) => setManualForm((f) => ({ ...f, password: e.target.value }))}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Role</label>
              <Select
                value={manualForm.role}
                onValueChange={(v) => setManualForm((f) => ({ ...f, role: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowManual(false)}>Cancel</Button>
            <Button onClick={handleManualCreate} disabled={manualCreating}>
              {manualCreating ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User creation dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create User Accounts</DialogTitle>
            <DialogDescription>
              Toggle which employees should get accounts. Passwords are randomly generated.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 mb-2">
            <Button size="sm" variant="outline" onClick={allowAll}>
              <Check className="mr-1 h-3 w-3" /> Allow All
            </Button>
            <Button size="sm" variant="outline" onClick={disallowAll}>
              <X className="mr-1 h-3 w-3" /> Disallow All
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-2 py-1 text-left w-10"></th>
                  <th className="px-2 py-1 text-left">Name</th>
                  <th className="px-2 py-1 text-left">Email</th>
                  <th className="px-2 py-1 text-left">Password</th>
                </tr>
              </thead>
              <tbody>
                {pendingUsers.map((u, i) => (
                  <tr
                    key={u.name}
                    className={`border-b cursor-pointer ${!u.allowed ? 'opacity-40' : ''}`}
                    onClick={() => toggleUser(i)}
                  >
                    <td className="px-2 py-1">
                      {u.allowed ? (
                        <Check className="h-4 w-4 text-green-600" />
                      ) : (
                        <X className="h-4 w-4 text-red-500" />
                      )}
                    </td>
                    <td className="px-2 py-1">{u.name}</td>
                    <td className="px-2 py-1 text-muted-foreground">{u.email}</td>
                    <td className="px-2 py-1 font-mono text-xs">{u.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating...' : `Create ${pendingUsers.filter((u) => u.allowed).length} Users`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Results dialog with credentials */}
      <Dialog open={showResults} onOpenChange={setShowResults}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Users Created</DialogTitle>
            <DialogDescription>
              Copy these credentials now — passwords are shown only once and cannot be recovered later.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-2 py-1 text-left">Name</th>
                  <th className="px-2 py-1 text-left">Email</th>
                  <th className="px-2 py-1 text-left">Password</th>
                </tr>
              </thead>
              <tbody>
                {createdUsers.map((u) => (
                  <tr key={u.email} className="border-b">
                    <td className="px-2 py-1">{u.name}</td>
                    <td className="px-2 py-1">{u.email}</td>
                    <td className="px-2 py-1 font-mono text-xs">{u.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={copyCredentials}>
              <Copy className="mr-1 h-4 w-4" /> Copy All
            </Button>
            <Button variant="outline" onClick={exportCredentials}>
              <Download className="mr-1 h-4 w-4" /> Export XLSX
            </Button>
            <Button onClick={() => setShowResults(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
