# Schedule Planner — Claude Guide

## Overview

Employee shift scheduling app. Admins import monthly schedules and bonus shift lists; employees claim available bonus shifts (max 4/month). Built with React + Supabase, deployed to GitHub Pages.

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 7, Tailwind CSS 4, Radix UI primitives
- **Backend**: Supabase (Auth, Postgres, Realtime, RLS)
- **Libs**: date-fns (dates), xlsx (import/export), sonner (toasts), lucide-react (icons)
- **Routing**: react-router-dom v7 — two routes: `/calendar`, `/admin`
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

**Key constraints:**
- `shift_claims.id_shift_type` is UNIQUE (one person per shift)
- `shift_claims(claimed_by, date)` is UNIQUE (one claim per employee per day)
- DB trigger `check_monthly_claim_limit()` enforces max 4 claims/month/user
- Realtime enabled on `shift_claims` table

**RLS rules:** Employees see own profile + own schedules + all bonus shifts + all claims. Admins see everything. Only admins can insert/update/delete schedules and bonus shifts.

### Auth Flow

- Supabase email/password auth
- `useAuth` hook manages session, auto-refreshes every 30s for non-admins (forces logout if password was reset), 30-min idle timeout for all users
- Admin operations (user CRUD, password reset) go through Supabase Edge Function (`admin-users`) — service role key never leaves server
- Client calls Edge Function via `src/lib/adminApi.ts` with the user's JWT for auth

### Day Types

`N` (Night), `M` (Morning), `E` (Evening), `T` (Training), `OFF`, `V` (Vacation), `W` (Work/available for bonus). Bonus shift types: `NB`, `MB`, `EB`, `1PM`. Color mappings defined in `CalendarGrid.tsx` and `DayCell.tsx`.

## File Map

### Entry & Routing
- `src/main.tsx` — App bootstrap (BrowserRouter, Toaster)
- `src/App.tsx` — Route setup, auth gate. Unauthenticated → LoginPage; authenticated → Navbar + routes

### Pages
- `src/pages/LoginPage.tsx` — Email/password login form
- `src/pages/CalendarPage.tsx` — Thin wrapper around CalendarGrid
- `src/pages/AdminPage.tsx` — Admin-only (redirects employees). Three tabs: Data Import, Users, Assignment Overview

### Calendar Components
- `src/components/Calendar/CalendarGrid.tsx` — **Main calendar view**. Month navigation, admin employee selector, renders grid of DayCells. Manages claim/unclaim logic. Uses `useCalendar` + `useShiftClaims` hooks.
- `src/components/Calendar/DayCell.tsx` — Single day cell. Shows day type badge, bonus claim badge, claim/unclaim UI with confirmation dialogs. Handles click-to-claim (single shift) or opens picker (multiple available).
- `src/components/Calendar/ShiftDropdown.tsx` — Dropdown select for claiming when multiple shifts available on a day. Also shows unclaim button with confirmation.

### Admin Components
- `src/components/Admin/ImportPanel.tsx` — Upload .xlsx/.csv for bonus shifts and default schedules. Preview before insert. Conflict detection for duplicate shift IDs across months. Clear data per month.
- `src/components/Admin/AssignmentTable.tsx` — View all bonus shifts and claims for a month. Filter by claimed/unclaimed, search, export to XLSX, bulk unclaim all.
- `src/components/Admin/UserManager.tsx` — Create user accounts (bulk from imported file or manual). List/search/delete users. Reset passwords (single or all). Stores passwords in localStorage. Import employee info from XLSX.

### Hooks
- `src/hooks/useAuth.ts` — Auth state, profile fetch, session refresh, sign in/out
- `src/hooks/useCalendar.ts` — Fetches default_schedules + bonus_shifts for a month/employee
- `src/hooks/useShiftClaims.ts` — Fetches claims, realtime subscription, claim/unclaim actions. Creates admin client when `isAdmin=true`.

### Lib/Utils
- `src/lib/supabase.ts` — Supabase client singleton (uses VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)
- `src/lib/parseImport.ts` — Parse .xlsx/.csv files into BonusShiftRow[] or DefaultScheduleRow[]. Handles Excel date serial numbers.
- `src/lib/exportXlsx.ts` — Export bonus shift assignments to .xlsx
- `src/lib/cn.ts` — clsx + tailwind-merge utility
- `src/lib/errorMessages.ts` — Maps Supabase/Postgres errors to user-friendly messages
- `src/lib/adminApi.ts` — Client-side wrapper for admin Edge Function calls

### UI Components
- `src/components/ui/` — Radix-based primitives: badge, button, card, dialog, select, tabs, MonthPicker

### Types
- `src/types/index.ts` — Profile, BonusShift, DefaultSchedule, ShiftClaim, DayType

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
6. **Migration safety**: New DB changes go in a new migration file (`supabase/migrations/002_*.sql`). Never modify `001_init.sql`.
7. **No unnecessary files**: Prefer editing existing files. The UI components in `src/components/ui/` follow Radix patterns — extend them rather than creating alternatives.

## Changelog

| Date | Change | Files Affected |
|---|---|---|
| Initial | Schedule Planner application created | All files |
| 2026-03-19 | Security hardening: removed localStorage password storage (show-once pattern), added file import validation (5MB limit, field sanitization, row count limit), added 30-min idle session timeout, added error message sanitization (friendlyError utility), added audit_log table and Edge Function logging | `UserManager.tsx`, `parseImport.ts`, `useAuth.ts`, `errorMessages.ts` (new), `002_audit_log.sql` (new), `admin-users/index.ts`, `DayCell.tsx`, `ShiftDropdown.tsx`, `AssignmentTable.tsx`, `ImportPanel.tsx` |
| 2026-03-20 | Fixed edge function auth: replaced getUser() with direct /auth/v1/user fetch (getUser fails in edge functions), use adminClient for profile lookup, fixed logAudit try/catch (query builder has no .catch()). Always show Reset All Passwords and Delete All buttons regardless of user count. Added supabase/.temp/ to .gitignore. | `admin-users/index.ts`, `UserManager.tsx`, `.gitignore` |
| 2026-03-20 | Bug/security audit fixes: LoginPage uses friendlyError instead of leaking raw errors. Edge function sanitizes all error responses and validates all input fields. Password generation uses crypto.getRandomValues with 12-char length and expanded charset. Mobile calendar list matches desktop admin shift management. parseEmployeeInfo validates file size, extension, and row count. | `LoginPage.tsx`, `admin-users/index.ts`, `UserManager.tsx`, `CalendarGrid.tsx` |
