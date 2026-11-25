/**
 * Where users reach the developer about objectionable content or anything else
 * (App Store guideline 1.2 requires published contact information).
 * Placeholder until the mailbox on heimvis.no exists; update before submission.
 */
export const SUPPORT_EMAIL = 'support@heimvis.no';

export const supportMailto = (subject: string) => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
