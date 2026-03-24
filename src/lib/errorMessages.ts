/**
 * Maps Supabase/Postgres error messages to user-friendly messages.
 * Prevents leaking internal details (table names, constraint names, policy violations).
 */

const ERROR_MAP: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /duplicate key.*shift_claims_id_shift_type/, message: 'This shift has already been claimed.' },
  { pattern: /duplicate key.*shift_claims_claimed_by_date/, message: 'You already have a claim on this date.' },
  { pattern: /Schedule is currently locked/i, message: 'The schedule is currently locked by your manager. You\'ll be notified once changes are available.' },
  { pattern: /reached your EB shift limit/i, message: 'You have reached your EB shift limit for this month.' },
  { pattern: /reached your MB shift limit/i, message: 'You have reached your MB shift limit for this month.' },
  { pattern: /reached your NB shift limit/i, message: 'You have reached your NB shift limit for this month.' },
  { pattern: /reached your 1-PM shift limit/i, message: 'You have reached your 1-PM shift limit for this month.' },
  { pattern: /reached your total bonus shift limit/i, message: 'You have reached your total bonus shift limit for this month.' },
  { pattern: /check_monthly_claim_limit|max.*4.*claims/i, message: 'Maximum bonus shift claims per month reached.' },
  { pattern: /duplicate key/i, message: 'This record already exists.' },
  { pattern: /violates row-level security/i, message: 'You do not have permission to perform this action.' },
  { pattern: /violates foreign key/i, message: 'Referenced record not found.' },
  { pattern: /violates not-null/i, message: 'A required field is missing.' },
  { pattern: /violates check constraint/i, message: 'Invalid value provided.' },
  { pattern: /invalid input syntax/i, message: 'Invalid data format.' },
  { pattern: /JWT expired/i, message: 'Your session has expired. Please sign in again.' },
  { pattern: /invalid.*password|invalid.*credentials/i, message: 'Invalid email or password.' },
  { pattern: /email.*already.*registered/i, message: 'An account with this email already exists.' },
  { pattern: /rate.*limit|too many requests/i, message: 'Too many requests. Please wait a moment and try again.' },
]

export function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  for (const { pattern, message } of ERROR_MAP) {
    if (pattern.test(raw)) return message
  }
  // Generic fallback — no internal details leaked
  return 'Something went wrong. Please try again.'
}
