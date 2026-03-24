# Schedule Planner — Claude Guide

## Overview

Employee shift scheduling app. Admins import monthly schedules and bonus shift lists; employees claim available bonus shifts (max 4/month). Built with React + Supabase, deployed to GitHub Pages.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 7, Tailwind CSS 4, Radix UI primitives
- **Backend**: Supabase (Auth, Postgres, Realtime, RLS)
- **Libs**: date-fns (dates), xlsx (import/export), sonner (toasts), lucide-react (icons)
- **Routing**: react-router-dom v7 — three routes: `/calendar`, `/admin`, `/master-calendar`
- **Deploy**: GitHub Pages (`base: '/Schedule-Planner/'` in vite.config.ts)

## Commands

```bash
npm run dev       # Start dev server
npm run build     # TypeScript check + Vite build
npm run lint      # ESLint
npm run preview   # Preview production build
```

## Architecture

### Database (Supabase)

Schema in `supabase/migrations/001_init.sql`. Four tables with RLS:

| Table | Purpose | Key Fields |
|---|---|---|
| `profiles` | User accounts (linked to auth.users) | id (uuid), email, full_name, role ('employee'/'admin') |
| `bonus_shifts` | Available bonus shifts per month | date, shift_type, row_number, id_shift_type (unique), month_year |
| `default_schedules` | Employee default schedule per month | date, employee (name string), day_type, month_year |
| `shift_claims` | Who claimed which bonus shift | id_shift_type (FK→bonus_shifts), claimed_by (FK→profiles), date, month_year |
| `global_shift_limits` | Global default shift limits (single config row) | eb_limit, mb_limit, nb_limit, total_bonus_limit, pm1_limit (nullable) |
| `employee_shift_limits` | Per-employee shift limit overrides | employee_id (FK→profiles), is_custom, eb_limit, mb_limit, nb_limit, total_bonus_limit, pm1_limit |
| `schedule_locks` | Per-month schedule lock state | month_year (unique), is_locked |

**Key constraints:**
- `shift_claims.id_shift_type` is UNIQUE (one person per shift)
- Partial unique index `uq_one_per_day_non_1pm` on `(claimed_by, date)` for non-1-PM shifts (one non-1-PM claim per day)
- Partial unique index `uq_one_1pm_per_day` on `(claimed_by, date)` for 1-PM shifts (one 1-PM claim per day)
- 1-PM shifts can stack with other bonus shifts on the same day
- DB trigger `check_monthly_claim_limit()` enforces dynamic per-type and total limits from `global_shift_limits`/`employee_shift_limits`, checks schedule lock, **excluding 1-PM shifts from total count** (1-PM has its own `pm1_limit`, null = unlimited)
- DB trigger `check_schedule_lock_on_delete()` prevents unclaiming shifts when month is locked
- Realtime enabled on `shift_claims` and `schedule_locks` tables

**Shift compatibility rules (enforced in frontend):**
- EB blocked on E, T day types
- MB blocked on M, T day types
- NB blocked on N day type
- 1-PM blocked on N, NB, M, MB, T day types (and when existing claim is NB or MB)

**RLS rules:** Employees see own profile + own schedules + all bonus shifts + all claims. Admins see everything. Only admins can insert/update/delete schedules and bonus shifts.

### Auth Flow

- Supabase email/password auth
- `useAuth` hook manages session, auto-refreshes every 30s for non-admins (forces logout if password was reset), 30-min idle timeout for all users
- Admin operations (user CRUD, password reset) go through Supabase Edge Function (`admin-users`) — service role key never leaves server
- Client calls Edge Function via `src/lib/adminApi.ts` with the user's JWT for auth

### Day Types

`N` (Night), `M` (Morning), `E` (Evening), `T` (Training), `OFF`, `V` (Vacation), `W` (Work/available for bonus). Bonus shift types: `NB`, `MB`, `EB`, `1-PM`. Note: DB uses `1-PM` prefix (with hyphen). 1-PM shifts are a special category — exempt from the 4/month limit, can stack with other claims, and have distinct styling (dark badge on non-W days, black text on W days). Color mappings defined in `CalendarGrid.tsx` and `DayCell.tsx`.

## File Map

### Entry & Routing
- `src/main.tsx` — App bootstrap (BrowserRouter, Toaster)
- `src/App.tsx` — Route setup, auth gate. Unauthenticated → LoginPage; authenticated → Navbar + routes

### Pages
- `src/pages/LoginPage.tsx` — Email/password login form
- `src/pages/CalendarPage.tsx` — Thin wrapper around CalendarGrid
- `src/pages/AdminPage.tsx` — Admin-only (redirects employees). Four tabs: Data Import, Users, Assignment Overview, Shift Limits. Per-month lock toggle in header.
- `src/pages/MasterCalendarPage.tsx` — Admin-only master calendar wrapper

### Calendar Components
- `src/components/Calendar/CalendarGrid.tsx` — **Main calendar view**. Month navigation, admin employee selector, renders grid of DayCells. Manages claim/unclaim logic with dynamic shift limits and lock state. Uses `useCalendar` + `useShiftClaims` + `useShiftLimits` + `useScheduleLock` hooks.
- `src/components/Calendar/DayCell.tsx` — Single day cell. Shows day type badge, bonus claim badge, claim/unclaim UI with confirmation dialogs. Handles click-to-claim (single shift) or opens picker (multiple available).
- `src/components/Calendar/ShiftDropdown.tsx` — Dropdown select for claiming when multiple shifts available on a day. Also shows unclaim button with confirmation.

### Admin Components
- `src/components/Admin/ImportPanel.tsx` — Upload .xlsx/.csv for bonus shifts and default schedules. Preview before insert. Conflict detection for duplicate shift IDs across months. Clear data per month.
- `src/components/Admin/AssignmentTable.tsx` — View all bonus shifts and claims for a month. Filter by claimed/unclaimed, search, export to XLSX, bulk unclaim all.
- `src/components/Admin/UserManager.tsx` — Create user accounts (bulk from imported file or manual). List/search/delete users. Reset passwords (single or all). Stores passwords in localStorage. Import employee info from XLSX.
- `src/components/Admin/ShiftLimitsManager.tsx` — Configure per-employee and global default shift limits (EB, MB, NB, Total, 1-PM). Custom toggle per employee.
- `src/components/Admin/MasterCalendar.tsx` — Spreadsheet-style overview of all employees' shifts for a month. Color-coded cells, sticky headers, export to Excel.

### Hooks
- `src/hooks/useAuth.ts` — Auth state, profile fetch, session refresh, sign in/out
- `src/hooks/useCalendar.ts` — Fetches default_schedules + bonus_shifts for a month/employee
- `src/hooks/useShiftClaims.ts` — Fetches claims, realtime subscription, claim/unclaim actions.
- `src/hooks/useShiftLimits.ts` — Fetches global and per-employee shift limits. Provides `getEffectiveLimits(employeeId)` resolver, CRUD for updating limits.
- `src/hooks/useScheduleLock.ts` — Fetches per-month lock state with realtime subscription. Provides `isLocked` and `toggleLock()` for admins.

### Lib/Utils
- `src/lib/supabase.ts` — Supabase client singleton (uses VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
- `src/lib/parseImport.ts` — Parse .xlsx/.csv files into BonusShiftRow[] or DefaultScheduleRow[]. Handles Excel date serial numbers.
- `src/lib/exportXlsx.ts` — Export bonus shift assignments and master calendar to .xlsx
- `src/lib/cn.ts` — clsx + tailwind-merge utility
- `src/lib/errorMessages.ts` — Maps Supabase/Postgres errors to user-friendly messages
- `src/lib/adminApi.ts` — Client-side wrapper for admin Edge Function calls

### UI Components
- `src/components/ui/` — Radix-based primitives: badge, button, card, dialog, select, tabs, MonthPicker

### Types
- `src/types/index.ts` — Profile, BonusShift, DefaultSchedule, ShiftClaim, DayType, ShiftLimits, GlobalShiftLimits, EmployeeShiftLimit, ScheduleLock

### Config
- `vite.config.ts` — Vite config with `@` alias, GitHub Pages base path
- `.env` / `.env.example` — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_SERVICE_ROLE_KEY

## Implementation Guide: What to Read/Update

| Task | Read First | Update |
|---|---|---|
| New day type / shift type | `src/types/index.ts`, `DayCell.tsx` (dayTypeStyles), `CalendarGrid.tsx` (dayTypeStyles) | Types, both style maps, possibly `ShiftDropdown.tsx` (claimColors) |
| New DB table or column | `supabase/migrations/001_init.sql`, `src/types/index.ts` | Migration SQL, types, relevant hooks, components that fetch/display the data |
| New page/route | `src/App.tsx`, existing page for pattern | App.tsx routes, new page component, Navbar if adding nav link |
| Modify calendar display | `CalendarGrid.tsx`, `DayCell.tsx` | The component being changed, possibly hooks if data changes |
| Modify claim logic | `useShiftClaims.ts`, `DayCell.tsx`, `CalendarGrid.tsx` | Hook + components + possibly DB trigger in migration |
| Admin feature | `AdminPage.tsx`, relevant Admin component | AdminPage tabs if new tab, the admin component |
| Import/export change | `src/lib/parseImport.ts` or `src/lib/exportXlsx.ts` | Parser/exporter + ImportPanel or AssignmentTable |
| Shift limit change | `useShiftLimits.ts`, `CalendarGrid.tsx`, `004_shift_limits_lock.sql` | Hook, trigger function, ShiftLimitsManager if UI change |
| Schedule lock change | `useScheduleLock.ts`, `CalendarGrid.tsx`, `AdminPage.tsx` | Hook + calendar lock banner + admin toggle |
| Overview page change | `MasterCalendar.tsx`, `src/index.css` (crosshair CSS) | Component + possibly exportXlsx if export changes |
| Auth change | `useAuth.ts`, `src/lib/supabase.ts` | Hook, possibly LoginPage, possibly RLS policies |
| UI component | `src/components/ui/` (check if Radix primitive exists) | Existing ui component or create new one |
| Styling/theme | `src/index.css`, component with inline styles | CSS vars or component styles (app uses both Tailwind + inline style objects for brand colors) |

## Brand Colors

- Primary dark: `#1a1a3e` (navbar, login, buttons)
- Purple accent: `#3b0f62` (bonus shifts, calendar header gradient)
- Gold accent: `#f8d040` / `#c9a020` (schedules import, MB shifts)
- Light text on dark: `#e8e0f0`

## Environment Variables

```
VITE_SUPABASE_URL=         # Supabase project URL
VITE_SUPABASE_ANON_KEY=    # Supabase anon/public key
```

> **Note:** Service role key is used only in the Supabase Edge Function (`admin-users`), configured as an environment secret in the Supabase dashboard. It must never be in client-side code.

## Rules for Claude

1. **Update this file** after each implementation before committing. Add new files to the file map, update the implementation guide if new patterns emerge, and log the change in the changelog below.
2. **Read before modify**: Always read the files listed in the "Read First" column of the Implementation Guide before making changes.
3. **Type safety**: Update `src/types/index.ts` whenever DB schema changes.
4. **Style consistency**: Use existing dayTypeStyles/bonusPrefixStyles patterns for new shift types. Use brand colors from the Brand Colors section.
5. **Supabase patterns**: Use the existing hook pattern (useCalendar, useShiftClaims) for new data fetching. Use service role client only for admin operations that need RLS bypass.
6. **Migration safety**: New DB changes go in a new migration file (`supabase/migrations/005_*.sql`). Never modify existing migration files.
7. **No unnecessary files**: Prefer editing existing files. The UI components in `src/components/ui/` follow Radix patterns — extend them rather than creating alternatives.

## Changelog

| Date | Change | Files Affected |
|---|---|---|
| Initial | Schedule Planner application created | All files |
| 2026-03-19 | Security hardening: removed localStorage password storage (show-once pattern), added file import validation (5MB limit, field sanitization, row count limit), added 30-min idle session timeout, added error message sanitization (friendlyError utility), added audit_log table and Edge Function logging | `UserManager.tsx`, `parseImport.ts`, `useAuth.ts`, `errorMessages.ts` (new), `002_audit_log.sql` (new), `admin-users/index.ts`, `DayCell.tsx`, `ShiftDropdown.tsx`, `AssignmentTable.tsx`, `ImportPanel.tsx` |
| 2026-03-20 | Fixed edge function auth: replaced getUser() with direct /auth/v1/user fetch (getUser fails in edge functions), use adminClient for profile lookup, fixed logAudit try/catch (query builder has no .catch()). Always show Reset All Passwords and Delete All buttons regardless of user count. Added supabase/.temp/ to .gitignore. | `admin-users/index.ts`, `UserManager.tsx`, `.gitignore` |
| 2026-03-20 | Bug/security audit fixes: LoginPage uses friendlyError instead of leaking raw errors. Edge function sanitizes all error responses and validates all input fields. Password generation uses crypto.getRandomValues with 12-char length and expanded charset. Mobile calendar list matches desktop admin shift management. parseEmployeeInfo validates file size, extension, and row count. | `LoginPage.tsx`, `admin-users/index.ts`, `UserManager.tsx`, `CalendarGrid.tsx` |
| 2026-03-20 | Moved toast notifications from top-right to bottom-right to avoid overlapping navbar buttons | `src/main.tsx` |
| 2026-03-20 | Added Google OAuth for admin sign-in, blocked non-admin OAuth users, removed service role key from .env, admin shows "Google Sign-In" instead of password in Users page, hide reset password button for admins, persist admin tab in URL, fix page refresh losing current route | `useAuth.ts`, `LoginPage.tsx`, `App.tsx`, `AdminPage.tsx`, `UserManager.tsx` |
| 2026-03-24 | 1-PM shift support: styling (dark badge on non-W, black text on W), fix invisible badge (DB uses `1-PM` not `1PM`), exempt from 4/month limit and one-per-day constraint, stackable with other bonus shifts, shift compatibility rules (EB blocked on E/T, MB on M/T, NB on N, 1-PM on N/NB/M/MB/T), 1-PM count in header, removed "Viewing schedule" text, removed accent borders, lighter day numbers, hidden shift IDs in badges, always-open claim picker dialog. DB migration `003_1pm_exempt.sql`. | `CalendarGrid.tsx`, `DayCell.tsx`, `ShiftDropdown.tsx`, `useShiftClaims.ts`, `003_1pm_exempt.sql` (new) |
| 2026-03-24 | Per-employee shift limits (EB/MB/NB/Total/1-PM), per-month schedule lock toggle, master calendar page. New DB tables: `global_shift_limits`, `employee_shift_limits`, `schedule_locks`. Updated `check_monthly_claim_limit()` trigger for dynamic limits and lock check. New `check_schedule_lock_on_delete()` trigger. Admin "Shift Limits" tab with global defaults and per-employee overrides. Lock toggle in admin header (per-month, green/red). Employee lock banner + disabled claim/unclaim. Master calendar at `/master-calendar` with all-employees grid view, color-coded cells, sticky columns, export to Excel. | `004_shift_limits_lock.sql` (new), `types/index.ts`, `useShiftLimits.ts` (new), `useScheduleLock.ts` (new), `ShiftLimitsManager.tsx` (new), `MasterCalendar.tsx` (new), `MasterCalendarPage.tsx` (new), `AdminPage.tsx`, `CalendarGrid.tsx`, `DayCell.tsx`, `ShiftDropdown.tsx`, `Navbar.tsx`, `App.tsx`, `exportXlsx.ts`, `errorMessages.ts` |
