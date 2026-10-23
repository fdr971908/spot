-- spot. — core relational schema
-- Conventions: uuid PKs, timestamptz everywhere, enums as CHECK constraints
-- (easy to extend in later phases without ALTER TYPE).

create schema if not exists app;

-- Current authenticated user for the transaction (set by the API layer with
-- set_config('app.user_id', ..., true)). On Supabase replace with auth.uid().
create or replace function app.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

-- ───────────────────────── Reference data ─────────────────────────
create table cities (
  id text primary key,
  name text not null,
  lat double precision not null,
  lng double precision not null
);

create table music_genres (
  id text primary key,
  label text not null,
  sort int not null default 0
);

create table event_categories (
  id text primary key,
  label text not null,
  emoji text,
  sort int not null default 0
);

-- Configurable recommendation weights (see src/server/recommend.ts)
create table recommendation_weights (
  key text primary key,
  value numeric not null,
  description text
);

-- ───────────────────────── Accounts ─────────────────────────
create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and position('@' in email) > 1),
  password_hash text not null,
  account_type text not null check (account_type in ('personal', 'business')),
  birthdate date,
  locale text not null default 'it',
  terms_accepted_at timestamptz not null,
  privacy_accepted_at timestamptz not null,
  marketing_consent_at timestamptz,
  onboarding_completed_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index users_email_key on users (email);

create table sessions (
  token_hash text primary key,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  user_agent text
);
create index sessions_user_idx on sessions (user_id);

create table personal_profiles (
  user_id uuid primary key references users (id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_.]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 50),
  avatar_url text,
  bio text check (char_length(bio) <= 280),
  city_id text references cities (id) on delete set null,
  is_private boolean not null default false,
  dm_policy text not null default 'connections' check (dm_policy in ('everyone', 'connections', 'nobody')),
  updated_at timestamptz not null default now()
);
create unique index personal_profiles_username_key on personal_profiles (username);

create table user_social_links (
  user_id uuid not null references users (id) on delete cascade,
  platform text not null check (platform in ('instagram', 'tiktok')),
  handle text not null check (handle ~ '^[A-Za-z0-9_.]{1,30}$'),
  is_visible boolean not null default true,
  primary key (user_id, platform)
);

create table user_preferences (
  user_id uuid primary key references users (id) on delete cascade,
  group_size text check (group_size in ('alone', '2', '3-5', '6-10', '10+')),
  venue_size text not null default 'any' check (venue_size in ('small', 'large', 'any')),
  setting text not null default 'any' check (setting in ('indoor', 'outdoor', 'any')),
  price_max int check (price_max >= 0),
  max_distance_km int not null default 25 check (max_distance_km between 1 and 500),
  preferred_days int[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table user_preferred_genres (
  user_id uuid not null references users (id) on delete cascade,
  genre_id text not null references music_genres (id) on delete cascade,
  primary key (user_id, genre_id)
);

create table user_preferred_categories (
  user_id uuid not null references users (id) on delete cascade,
  category_id text not null references event_categories (id) on delete cascade,
  primary key (user_id, category_id)
);

create table user_blocks (
  blocker_id uuid not null references users (id) on delete cascade,
  blocked_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on user_blocks (blocked_id);

-- ───────────────────────── Businesses ─────────────────────────
create table business_profiles (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9-]{3,40}$'),
  name text not null check (char_length(name) between 2 and 80),
  category text not null check (category in ('club', 'bar', 'restaurant', 'beach_club', 'venue', 'organizer', 'promoter', 'festival')),
  logo_url text,
  cover_url text,
  description text check (char_length(description) <= 2000),
  address text,
  city_id text references cities (id) on delete set null,
  neighborhood text,
  lat double precision,
  lng double precision,
  opening_hours jsonb not null default '{}',
  website text,
  instagram text,
  phone text,
  contact_email text,
  verification_status text not null default 'pending' check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  follower_count int not null default 0,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index business_profiles_slug_key on business_profiles (slug);

create table business_staff (
  business_id uuid not null references business_profiles (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'staff')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index business_staff_user_idx on business_staff (user_id);

create table user_follows (
  user_id uuid not null references users (id) on delete cascade,
  business_id uuid not null references business_profiles (id) on delete cascade,
  notify_promotions boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, business_id)
);
create index user_follows_business_idx on user_follows (business_id, created_at);

-- ───────────────────────── Events ─────────────────────────
create table events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profiles (id) on delete restrict,
  series_id uuid, -- recurring occurrences share a series; each occurrence keeps its own history
  title text not null check (char_length(title) between 3 and 120),
  description text check (char_length(description) <= 4000),
  cover_url text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue_name text not null,
  address text not null,
  city_id text not null references cities (id),
  neighborhood text,
  lat double precision,
  lng double precision,
  category_id text not null references event_categories (id),
  is_outdoor boolean not null default false,
  venue_size text not null default 'medium' check (venue_size in ('small', 'medium', 'large')),
  is_free boolean not null default false,
  price_min numeric(8, 2) check (price_min >= 0),
  price_max numeric(8, 2) check (price_max >= 0),
  min_age int check (min_age between 0 and 25),
  rules text check (char_length(rules) <= 2000),
  lineup text,
  ticket_url text,
  capacity int check (capacity > 0),
  group_friendly boolean not null default true,
  guest_list_enabled boolean not null default false,
  table_requests_enabled boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published', 'cancelled', 'completed')),
  published_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (is_free or price_min is not null)
);
create index events_feed_idx on events (status, starts_at);
create index events_business_idx on events (business_id, starts_at desc);
create index events_city_idx on events (city_id, starts_at);
create index events_series_idx on events (series_id) where series_id is not null;

create table event_music_genres (
  event_id uuid not null references events (id) on delete cascade,
  genre_id text not null references music_genres (id) on delete cascade,
  primary key (event_id, genre_id)
);
create index event_music_genres_genre_idx on event_music_genres (genre_id);

create table event_saves (
  user_id uuid not null references users (id) on delete cascade,
  event_id uuid not null references events (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index event_saves_event_idx on event_saves (event_id);

-- Attendance intention ("Partecipa"). Visibility is per event and defaults to private.
create table event_attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  event_id uuid not null references events (id) on delete cascade,
  status text not null default 'going' check (status in ('going', 'cancelled')),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  source text not null default 'event' check (source in ('event', 'group_rsvp')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, event_id)
);
create index event_attendance_event_idx on event_attendance (event_id, status, visibility);

-- User self-declared confirmation after the event. NOT an independent check-in.
create table attendance_confirmations (
  attendance_id uuid primary key references event_attendance (id) on delete cascade,
  response text not null check (response in ('attended', 'not_attended', 'skipped')),
  responded_at timestamptz not null default now()
);

create table event_feedback (
  user_id uuid not null references users (id) on delete cascade,
  event_id uuid not null references events (id) on delete cascade,
  kind text not null check (kind in ('interested', 'not_interested', 'fewer_like_this')),
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create table event_analytics (
  id bigserial primary key,
  event_id uuid not null references events (id) on delete cascade,
  kind text not null check (kind in ('impression', 'view', 'share', 'ticket_click', 'contact')),
  user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index event_analytics_idx on event_analytics (event_id, kind, created_at);

-- ───────────────────────── Messaging ─────────────────────────
create table conversations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('direct', 'group', 'business')),
  business_id uuid references business_profiles (id) on delete cascade,
  direct_key text, -- "<uuid-a>:<uuid-b>" sorted, dedupes direct chats
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check ((type = 'business') = (business_id is not null))
);
create unique index conversations_direct_key on conversations (direct_key) where direct_key is not null;
create index conversations_business_idx on conversations (business_id, last_message_at desc) where business_id is not null;

create table conversation_members (
  conversation_id uuid not null references conversations (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on conversation_members (user_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  sender_id uuid references users (id) on delete set null,
  as_business boolean not null default false,
  kind text not null default 'text' check (kind in ('text', 'event', 'system')),
  body text check (char_length(body) <= 2000),
  event_id uuid references events (id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (kind <> 'text' or (body is not null and char_length(trim(body)) > 0)),
  check (kind <> 'event' or event_id is not null)
);
create index messages_conversation_idx on messages (conversation_id, created_at desc);
create index messages_sender_idx on messages (sender_id, created_at desc);

-- business staff read state for business conversations
create table business_conversation_reads (
  conversation_id uuid primary key references conversations (id) on delete cascade,
  last_read_at timestamptz not null default now()
);

-- ───────────────────────── Groups ─────────────────────────
create table groups (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references conversations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 60),
  image_url text,
  emoji text,
  kind text not null check (kind in ('permanent', 'spot')),
  event_id uuid references events (id) on delete set null,
  created_by uuid references users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table group_members (
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'invited' check (status in ('invited', 'active', 'declined', 'left', 'removed')),
  invited_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on group_members (user_id, status);

create table group_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  event_id uuid not null references events (id) on delete cascade,
  shared_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (group_id, event_id)
);

-- Group RSVP is distinct from official event attendance.
create table group_rsvps (
  group_event_id uuid not null references group_events (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  status text not null check (status in ('going', 'maybe', 'not_going')),
  updated_at timestamptz not null default now(),
  primary key (group_event_id, user_id)
);

-- ───────────────────────── Guest lists & tables ─────────────────────────
create table guest_list_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  requester_id uuid not null references users (id) on delete cascade,
  group_id uuid references groups (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  note text check (char_length(note) <= 500),
  business_note text check (char_length(business_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index guest_list_requests_event_idx on guest_list_requests (event_id, status);
create unique index guest_list_requests_active on guest_list_requests (event_id, requester_id) where status in ('pending', 'confirmed');

-- Each name on a list needs that person's own consent (or is the requester).
create table guest_list_entries (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references guest_list_requests (id) on delete cascade,
  user_id uuid references users (id) on delete cascade,
  display_name text not null,
  consent text not null default 'pending' check (consent in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (request_id, user_id)
);

create table table_requests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  party_size int not null check (party_size between 1 and 50),
  contact_name text not null check (char_length(contact_name) between 2 and 80),
  contact_phone text not null check (contact_phone ~ '^[+0-9 ]{6,20}$'),
  notes text check (char_length(notes) <= 500),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  business_note text check (char_length(business_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index table_requests_event_idx on table_requests (event_id, status);

-- ───────────────────────── Notifications ─────────────────────────
create table notification_preferences (
  user_id uuid primary key references users (id) on delete cascade,
  event_reminders boolean not null default true,
  reminder_hours int not null default 24 check (reminder_hours in (2, 6, 24, 48)),
  group_activity boolean not null default true,
  messages boolean not null default true,
  request_updates boolean not null default true,
  suggestions boolean not null default true,
  promotional boolean not null default false,
  max_promotional_per_week int not null default 3 check (max_promotional_per_week between 0 and 10),
  updated_at timestamptz not null default now()
);

create table business_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references business_profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 60),
  message text not null check (char_length(message) between 3 and 240),
  audience text not null default 'followers' check (audience in ('followers', 'event_savers', 'event_attendees')),
  event_id uuid references events (id) on delete set null,
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'sent', 'cancelled')),
  sent_at timestamptz,
  recipients_count int not null default 0,
  skipped_count int not null default 0,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (audience = 'followers' or event_id is not null)
);
create index business_campaigns_business_idx on business_campaigns (business_id, created_at desc);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  category text not null check (category in ('transactional', 'promotional')),
  type text not null,
  title text not null,
  body text,
  link text,
  ref_id uuid, -- event / group / request the notification refers to (dedupe)
  campaign_id uuid references business_campaigns (id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);
create index notifications_dedupe_idx on notifications (user_id, type, ref_id);
create index notifications_campaign_idx on notifications (campaign_id) where campaign_id is not null;

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  platform text not null check (platform in ('web', 'ios', 'android')),
  endpoint text not null,
  keys jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- ───────────────────────── Trust & safety ─────────────────────────
create table user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references users (id) on delete cascade,
  target_user_id uuid references users (id) on delete set null,
  message_id uuid references messages (id) on delete set null,
  event_id uuid references events (id) on delete set null,
  reason text not null check (reason in ('spam', 'harassment', 'impersonation', 'inappropriate', 'underage', 'other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewed', 'actioned')),
  created_at timestamptz not null default now(),
  check (target_user_id is not null or message_id is not null or event_id is not null)
);

-- ───────────────────────── Recap ─────────────────────────
create table recap_statistics (
  user_id uuid not null references users (id) on delete cascade,
  year int not null,
  stats jsonb not null,
  computed_at timestamptz not null default now(),
  primary key (user_id, year)
);

-- ───────────────────────── Generic triggers ─────────────────────────
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger events_touch before update on events for each row execute function app.touch_updated_at();
create trigger attendance_touch before update on event_attendance for each row execute function app.touch_updated_at();
create trigger glr_touch before update on guest_list_requests for each row execute function app.touch_updated_at();
create trigger tr_touch before update on table_requests for each row execute function app.touch_updated_at();
create trigger prefs_touch before update on user_preferences for each row execute function app.touch_updated_at();
create trigger profiles_touch before update on personal_profiles for each row execute function app.touch_updated_at();
