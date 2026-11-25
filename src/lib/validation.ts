import { z } from 'zod';

// Client-side validation mirrors the DB CHECK constraints for fast feedback.
// The database remains the authority.
const text = (max: number) => z.string().trim().min(1).max(max);

export const schemas = {
  email: z.email().max(254),
  otp: z.string().regex(/^\d{6,10}$/),
  displayName: text(50),
  householdName: text(60),
  inviteCode: z
    .string()
    .transform((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, ''))
    .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{10}$/)),
  postBody: text(4000),
  commentBody: text(1000),
  pollQuestion: text(300),
  pollOptions: z.array(text(100)).min(2).max(10),
  listName: text(60),
  itemText: text(120),
  quantity: z.string().trim().max(30).optional(),
  eventTitle: text(120),
  eventDescription: z.string().trim().max(1000).optional(),
  eventLocation: z.string().trim().max(120).optional(),
  choreTitle: text(100),
};

/** Format a normalised code as XXXXX-XXXXX for display. */
export function formatCode(code: string): string {
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length > 5 ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}
