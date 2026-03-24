# Schedule Planner

Employee shift scheduling app. Admins import monthly schedules and bonus shift lists; employees claim available bonus shifts. Built with React + Supabase, deployed to GitHub Pages.

**Live:** [eve98r.github.io/schedule-planner](https://eve98r.github.io/schedule-planner/)

## Features

### Employee View
- Monthly calendar showing default schedule (N/M/E/T/OFF/V/W shifts)
- Claim available bonus shifts (EB, MB, NB, 1-PM) with one click
- Per-type and total bonus shift limits enforced in real-time
- Realtime updates when other employees claim shifts
- 30-minute idle session timeout

### Admin Panel
- **Data Import** — Upload .xlsx/.csv for bonus shifts and default schedules with preview and conflict detection
- **User Management** — Create/delete employee accounts, reset passwords, bulk operations via Edge Function
- **Assignment Overview** — View all bonus shifts and claims, filter, search, export to Excel, bulk unclaim
- **Shift Limits** — Configure per-employee limits (EB/MB/NB/Total/1-PM) with global defaults and custom overrides
- **Schedule Lock** — Per-month toggle to freeze employee claim/unclaim actions
- **Google OAuth** — Admin sign-in via Google

### Overview Page (Admin)
- **Daily Coverage** — Visual timeline showing unclaimed bonus shifts per type (M/E/N/T) for each day, with checkmarks for fully claimed days
- **All Schedules Grid** — Spreadsheet-style view of all employees sorted by shift type (M > T > E > N), with auto-detected night team clustering
- Crosshair hover navigation for easy row/column identification
- Click any day in coverage to see detailed staffing breakdown

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS 4, Radix UI
- **Backend:** Supabase (Auth, Postgres, Realtime, RLS, Edge Functions)
- **Libraries:** date-fns, xlsx, sonner, lucide-react
- **Routing:** react-router-dom v7
- **Deploy:** GitHub Pages

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# Start dev server
npm run dev
```

## Database Setup

Run the migrations in order on your Supabase project:

1. `supabase/migrations/001_init.sql` — Core tables (profiles, bonus_shifts, default_schedules, shift_claims)
2. `supabase/migrations/002_audit_log.sql` — Admin action logging
3. `supabase/migrations/003_1pm_exempt.sql` — 1-PM shift exemptions
4. `supabase/migrations/004_shift_limits_lock.sql` — Configurable shift limits, per-month schedule locks

## Commands

```bash
npm run dev       # Start dev server
npm run build     # TypeScript check + Vite build
npm run lint      # ESLint
npm run preview   # Preview production build
```

## Project Structure

```
src/
├── pages/              # Route pages (Login, Calendar, Admin, MasterCalendar)
├── components/
│   ├── Admin/          # ImportPanel, AssignmentTable, UserManager, ShiftLimitsManager, MasterCalendar
│   ├── Calendar/       # CalendarGrid, DayCell, ShiftDropdown
│   ├── Layout/         # Navbar
│   └── ui/             # Radix-based primitives (badge, button, card, dialog, select, tabs, MonthPicker)
├── hooks/              # useAuth, useCalendar, useShiftClaims, useShiftLimits, useScheduleLock
├── lib/                # supabase client, parsers, exporters, error messages, utilities
└── types/              # TypeScript interfaces
supabase/
├── migrations/         # SQL migration files
└── functions/          # Edge Functions (admin-users)
```
