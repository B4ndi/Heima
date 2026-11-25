import { t } from '@/i18n';

/**
 * Map backend errors to safe Norwegian messages. Raw database/HTTP errors are
 * never shown to users (they can reveal schema details); our own RPCs raise
 * Norwegian messages with SQLSTATE P0001, which are safe to show as-is.
 */
export function userMessage(err: unknown): string {
  const e = err as { code?: string; message?: string; status?: number; name?: string } | null;
  if (!e) return t.errors.generic;
  if (e.name === 'ZodError') return t.errors.validation;
  if (e.message && /network|fetch failed|Failed to fetch/i.test(e.message)) return t.errors.network;
  switch (e.code) {
    case 'image_too_large':
      return t.errors.imageTooLarge;
    case 'P0001':
      return e.message ?? t.errors.generic; // business-rule message written by us
    case '42501':
      return t.errors.forbidden;
    case '28000':
    case 'PGRST301':
      return t.errors.session;
    case '23514':
    case '22023':
    case '23502':
      return t.errors.validation;
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return t.errors.tooMany;
  }
  if (e.status === 429) return t.errors.tooMany;
  return t.errors.generic;
}

export function rpcErrorMessage(code: string): string {
  switch (code) {
    case 'rate_limited':
      return t.errors.tooMany;
    case 'too_many_households':
      return t.errors.tooManyHouseholds;
    case 'household_full':
      return t.errors.householdFull;
    default:
      return t.errors.invalidCode;
  }
}
