// Row types mirroring supabase/migrations. Regenerate the full typed client with
// `npm run db:types` when postgres-meta is available.

export type Role = 'admin' | 'member';
export type MemberStatus = 'active' | 'pending';
export type Recurrence = 'once' | 'daily' | 'weekly' | 'biweekly' | 'monthly';

export interface Profile {
  id: string;
  display_name: string;
  avatar_path: string | null;
}

export interface Household {
  id: string;
  name: string;
  created_at: string;
  /** IANA time zone; chore dates are computed in it. */
  timezone: string;
}

export interface Member {
  household_id: string;
  user_id: string;
  role: Role;
  status: MemberStatus;
  joined_at: string;
}

export interface Invite {
  id: string;
  household_id: string;
  created_at: string;
  expires_at: string;
  max_uses: number;
  uses: number;
  requires_approval: boolean;
  revoked_at: string | null;
}

export interface Post {
  id: string;
  household_id: string;
  author_id: string;
  body: string;
  pinned: boolean;
  created_at: string;
  edited_at: string | null;
}

export interface Comment {
  id: string;
  post_id: string;
  household_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface Poll {
  id: string;
  household_id: string;
  created_by: string | null;
  question: string;
  multiple_choice: boolean;
  anonymous: boolean;
  closes_at: string | null;
  closed_at: string | null;
  created_at: string;
  poll_options: PollOption[];
}

export interface PollOption {
  id: string;
  poll_id: string;
  label: string;
  position: number;
}

export interface PollVote {
  poll_id: string;
  option_id: string;
  user_id: string;
}

export interface ShoppingList {
  id: string;
  household_id: string;
  name: string;
  archived: boolean;
}

export interface ShoppingItem {
  id: string;
  list_id: string;
  household_id: string;
  text: string;
  quantity: string | null;
  checked: boolean;
  checked_by: string | null;
  created_at: string;
}

export interface CalendarEvent {
  id: string;
  household_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  created_by: string | null;
}

export interface Chore {
  id: string;
  household_id: string;
  title: string;
  recurrence: Recurrence;
  rotation: string[];
  rotation_index: number;
  next_due: string;
  archived: boolean;
  created_by: string | null;
}

export type ReportReason = 'harassment' | 'hate' | 'sexual' | 'violence' | 'spam' | 'other';
export type ReportAction = 'dismiss' | 'delete_content' | 'remove_member';

/** What an admin sees. reporter_id is deliberately not selectable. */
export interface Report {
  id: string;
  household_id: string;
  reported_user_id: string;
  post_id: string | null;
  comment_id: string | null;
  reason: ReportReason;
  details: string | null;
  status: 'open' | 'resolved';
  created_at: string;
  posts: { body: string } | null;
  post_comments: { body: string; post_id: string } | null;
}

export interface Block {
  blocked_id: string;
  created_at: string;
}

export type RpcResult =
  | { ok: true; household_id?: string; status?: MemberStatus; household_name?: string; member_count?: number; requires_approval?: boolean }
  | { ok: false; error: 'invalid' | 'rate_limited' | 'too_many_households' | 'household_full' };
