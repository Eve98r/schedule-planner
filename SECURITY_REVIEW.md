# Security Review - Schedule Planner

**Date:** 2026-03-19
**Stack:** React 19 + TypeScript + Supabase (PostgreSQL) + Vite
**Architecture:** Fully client-side SPA — no backend server

---

## Stack Overview

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5.9, React Router 7 |
| Styling | Tailwind CSS 4, Radix UI |
| Database | Supabase (PostgreSQL with RLS) |
| Auth | Supabase GoTrue (email/password) |
| Build | Vite 7 |
| File Parsing | XLSX 0.18.5 |
| Hosting | GitHub Pages (static) |

---

## CRITICAL Vulnerabilities

### 1. Service Role Key Exposed in Client-Side Code

**Severity: CRITICAL**

The Supabase service role key (`VITE_SUPABASE_SERVICE_ROLE_KEY`) is bundled into the frontend JavaScript. This key **bypasses all Row-Level Security policies** and grants full read/write/delete access to every table in the database.

**Affected files:**
- `src/hooks/useShiftClaims.ts:12` — creates admin client with service key
- `src/components/Admin/UserManager.tsx:133` — user creation/deletion
- `src/components/Admin/AssignmentTable.tsx:95` — schedule management

**Impact:** Anyone can open browser DevTools, extract the key from the JS bundle, and:
- Read/modify/delete ALL user data
- Create admin accounts
- Delete all schedules and shift claims
- Access Supabase Auth admin API (create/delete users, reset passwords)

**Fix:** Move all admin operations to Supabase Edge Functions or a separate backend API. The service role key must NEVER leave a server environment.

---

### 2. Plaintext Passwords Stored in localStorage

**Severity: CRITICAL**

User passwords are stored as plaintext JSON in `localStorage` under the key `sp_passwords`.

**Affected file:** `src/components/Admin/UserManager.tsx:116-129`

**Impact:**
- Any XSS vulnerability instantly leaks all stored passwords
- Any browser extension with storage access can read them
- Passwords persist indefinitely (no expiry)
- Shared/public computers retain passwords after logout

**Fix:** Never store passwords client-side. Show the generated password once at creation time, and require the admin to copy it immediately. If password visibility is needed later, implement a secure server-side lookup.

---

## HIGH Severity Issues

### 3. No Backend API Layer

**Severity: HIGH**

All business logic runs in the browser. The only protection is Supabase RLS, which is bypassed by the exposed service role key (see #1). Even without the key leak, a client-only architecture means:
- Business rules can be inspected and bypassed
- Rate limiting is impossible to enforce
- No server-side validation of data integrity

**Fix:** Introduce Supabase Edge Functions or a lightweight API for:
- User management (create, delete, password reset)
- Admin data operations (import, bulk delete)
- Any operation requiring the service role key

### 4. No Input Validation or Sanitization

**Severity: HIGH**

- XLSX/CSV import (`src/lib/parseImport.ts`) has minimal validation
- No sanitization of employee names, shift types, or imported data
- Database constraints are the only line of defense
- No file size limits on uploads

**Fix:** Validate all imported data (types, lengths, allowed characters) before database insertion. Add file size limits. Sanitize string inputs.

### 5. RLS Policy Gap — Role Stored in `profiles` Table

**Severity: HIGH**

Admin RLS policies check `role` from the `profiles` table:
```sql
EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
```

If an attacker gains INSERT/UPDATE on `profiles` (e.g., via the exposed service key), they can escalate any user to admin. The role should ideally be stored in Supabase Auth metadata (`app_metadata.role`) which cannot be modified by RLS-governed queries.

---

## MEDIUM Severity Issues

### 6. No Rate Limiting

**Severity: MEDIUM**

No rate limiting exists on any operation — authentication attempts, shift claims, data queries, or user creation. This enables brute-force attacks and abuse.

**Fix:** Enable Supabase rate limiting. Add client-side debouncing. For auth, enable Supabase's built-in brute force protection.

### 7. No Security Headers

**Severity: MEDIUM**

As a GitHub Pages deployment, the app lacks proper security headers:
- No `Content-Security-Policy` (CSP)
- No `X-Frame-Options` (clickjacking risk)
- No `Strict-Transport-Security` (HSTS)
- No `X-Content-Type-Options`

**Fix:** If moving to a platform with header control (Vercel, Netlify, Cloudflare Pages), add:
```
Content-Security-Policy: default-src 'self'; connect-src https://*.supabase.co
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

### 8. Session Management Gaps

**Severity: MEDIUM**

- Session refresh runs every 30 seconds but only for non-admin users (`useAuth.ts:50`)
- No session timeout/idle logout
- No mechanism to revoke sessions remotely

**Fix:** Apply consistent session refresh for all roles. Add idle timeout (e.g., 30 min inactivity). Consider adding session revocation capability.

### 9. XLSX Library (SheetJS) — Known Supply Chain Target

**Severity: MEDIUM**

The `xlsx` (SheetJS) package v0.18.5 has had licensing and supply chain concerns in the past. Malformed spreadsheet files could potentially exploit parsing vulnerabilities.

**Fix:** Consider switching to a more actively maintained alternative. At minimum, validate file content strictly before processing.

---

## LOW Severity Issues

### 10. Verbose Error Messages

**Severity: LOW**

Supabase error messages are displayed directly to users via toast notifications. These may leak internal details (table names, constraint names, policy violations).

**Fix:** Map Supabase errors to user-friendly messages. Log detailed errors to a monitoring service.

### 11. No Audit Logging

**Severity: LOW**

No record of who did what — user creation, deletion, password resets, shift claim changes, and data imports are not logged.

**Fix:** Add an `audit_log` table recording admin actions with timestamp, actor, action, and target.

### 12. localStorage Data Not Encrypted

**Severity: LOW**

UI preferences and import logs stored in localStorage are unencrypted. While not highly sensitive on their own (month selections, employee filters), the password storage issue (#2) makes this pattern risky.

---

## What's Done Well

- RLS enabled on all tables with appropriate policies
- `.env` is in `.gitignore` (secrets not committed to git)
- TypeScript strict mode enabled
- Database-level constraints (unique claims per day, max 4/month trigger)
- Real-time subscriptions scoped per month
- No use of `dangerouslySetInnerHTML` (no XSS via React)
- Supabase handles HTTPS, CORS, and JWT token management

---

## TODO — Security Fixes (Priority Order)

- [ ] **P0 — Remove service role key from client code.** Create Supabase Edge Functions for: user creation, user deletion, password reset, admin shift claim management, admin schedule deletion. Remove `VITE_SUPABASE_SERVICE_ROLE_KEY` from `.env` entirely.
- [ ] **P0 — Rotate all Supabase keys immediately.** The current service role key and anon key are exposed in the codebase. After deploying Edge Functions, regenerate both keys in the Supabase dashboard.
- [ ] **P0 — Remove password storage from localStorage.** Delete all code related to `sp_passwords`. Show generated passwords only once during user creation with a copy button.
- [ ] **P1 — Move admin role to `app_metadata`.** Store the role in Supabase Auth `app_metadata.role` instead of the `profiles` table. Update RLS policies to check `auth.jwt() -> 'app_metadata' ->> 'role'`.
- [ ] **P1 — Add input validation for file imports.** Validate all fields from XLSX/CSV before database insertion. Add file size limit (e.g., 5MB). Validate MIME type.
- [ ] **P1 — Enable Supabase brute force protection.** Configure auth rate limiting in Supabase dashboard.
- [ ] **P2 — Add security headers.** Move hosting to a platform that supports custom headers, or add a `_headers` file if using Netlify/Cloudflare.
- [ ] **P2 — Add session idle timeout.** Log users out after 30 minutes of inactivity.
- [ ] **P2 — Add audit logging.** Create an `audit_log` table and log all admin actions.
- [ ] **P2 — Sanitize error messages.** Map Supabase errors to generic user-facing messages.
- [ ] **P3 — Evaluate XLSX library.** Assess whether `xlsx` 0.18.5 should be replaced with a maintained alternative.
- [ ] **P3 — Add rate limiting on shift claims.** Prevent rapid-fire claim/unclaim abuse.
