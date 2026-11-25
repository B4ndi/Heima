import { nb } from '@/i18n/nb';

/**
 * Map backend errors to safe Norwegian messages. Raw database/HTTP errors are
 * never shown to users (they can reveal schema details); our own RPCs raise
 * Norwegian messages with SQLSTATE P0001, which are safe to show as-is.
 */
export function userMessage(err: unknown): string {
  const e = err as { code?: string; message?: string; status?: number; name?: string } | null;
  if (!e) return nb.errors.generic;
  if (e.name === 'ZodError') return nb.errors.validation;
  if (e.message && /network|fetch failed|Failed to fetch/i.test(e.message)) return nb.errors.network;
  switch (e.code) {
    case 'P0001':
      return e.message ?? nb.errors.generic; // business-rule message written by us
    case '42501':
      return nb.errors.forbidden;
    case '28000':
    case 'PGRST301':
      return nb.errors.session;
    case '23514':
    case '22023':
    case '23502':
      return nb.errors.validation;
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return nb.errors.tooMany;
  }
  if (e.status === 429) return nb.errors.tooMany;
  return nb.errors.generic;
}

export function rpcErrorMessage(code: string): string {
  switch (code) {
    case 'rate_limited':
      return nb.errors.tooMany;
    case 'too_many_households':
      return nb.errors.tooManyHouseholds;
    case 'household_full':
      return nb.errors.householdFull;
    default:
      return nb.errors.invalidCode;
  }
}
