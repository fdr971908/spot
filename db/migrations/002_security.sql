-- spot. — authorization: helper predicates, row-level security, triggers.
-- All helper predicates are SECURITY DEFINER so policies can reference other
-- RLS-protected tables without recursion. They only ever answer about app.uid().

-- ───────────────────────── Predicates ─────────────────────────
create or replace function app.is_staff(p_business uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from business_staff where business_id = p_business and user_id = app.uid())
$$;

create or replace function app.staff_role(p_business uuid) returns text
language sql stable security definer set search_path = public, app as $$
  select role from business_staff where business_id = p_business and user_id = app.uid()
$$;

create or replace function app.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select a is not null and b is not null and exists (
    select 1 from user_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
$$;

create or replace function app.is_adult(p_user uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce((select birthdate <= (current_date - interval '18 years') from users where id = p_user), false)
$$;

create or replace function app.group_status(p_group uuid) returns text
language sql stable security definer set search_path = public, app as $$
  select status from group_members where group_id = p_group and user_id = app.uid()
$$;

create or replace function app.is_group_admin(p_group uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from group_members where group_id = p_group and user_id = app.uid() and status = 'active' and role = 'admin')
$$;

create or replace function app.can_access_conversation(p_conv uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from conversation_members where conversation_id = p_conv and user_id = app.uid())
      or exists (select 1 from conversations c join business_staff s on s.business_id = c.business_id
                 where c.id = p_conv and s.user_id = app.uid())
$$;

create or replace function app.event_business(p_event uuid) returns uuid
language sql stable security definer set search_path = public, app as $$
  select business_id from events where id = p_event
$$;

create or replace function app.is_event_staff(p_event uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select app.is_staff(app.event_business(p_event))
$$;

-- "Connections" for the DM policy: share an active group, or both PUBLICLY
-- attend the same event. Hidden attendance is never used (no indirect leaks).
create or replace function app.are_connected(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from group_members x join group_members y on y.group_id = x.group_id
    where x.user_id = a and y.user_id = b and x.status = 'active' and y.status = 'active'
  ) or exists (
    select 1 from event_attendance x join event_attendance y on y.event_id = x.event_id
    where x.user_id = a and y.user_id = b and x.status = 'going' and y.status = 'going'
      and x.visibility = 'public' and y.visibility = 'public'
  ) or exists (
    select 1 from conversations c
    where c.direct_key = least(a::text, b::text) || ':' || greatest(a::text, b::text)
  )
$$;

-- Whether the current user may post in a conversation (as themself or as the business).
create or replace function app.can_send_message(p_conv uuid, p_as_business boolean) returns boolean
language plpgsql stable security definer set search_path = public, app as $$
declare
  c conversations;
  other uuid;
begin
  select * into c from conversations where id = p_conv;
  if not found then return false; end if;
  if p_as_business then
    return c.type = 'business' and app.is_staff(c.business_id);
  end if;
  if not exists (select 1 from conversation_members where conversation_id = p_conv and user_id = app.uid()) then
    return false;
  end if;
  if c.type = 'direct' then
    select user_id into other from conversation_members where conversation_id = p_conv and user_id <> app.uid() limit 1;
    if app.is_blocked_between(app.uid(), other) then return false; end if;
  elsif c.type = 'group' then
    if exists (select 1 from groups g where g.conversation_id = p_conv and g.archived_at is not null) then return false; end if;
  end if;
  return true;
end $$;

-- ───────────────────────── RLS ─────────────────────────
alter table users enable row level security;
create policy users_self on users for select using (id = app.uid());
create policy users_register on users for insert with check (true);
create policy users_update_self on users for update using (id = app.uid()) with check (id = app.uid());
create policy users_delete_self on users for delete using (id = app.uid());

alter table personal_profiles enable row level security;
create policy pp_self on personal_profiles for all using (user_id = app.uid()) with check (user_id = app.uid());

alter table user_social_links enable row level security;
create policy usl_self on user_social_links for all using (user_id = app.uid()) with check (user_id = app.uid());

alter table user_preferences enable row level security;
create policy up_self on user_preferences for all using (user_id = app.uid()) with check (user_id = app.uid());
alter table user_preferred_genres enable row level security;
create policy upg_self on user_preferred_genres for all using (user_id = app.uid()) with check (user_id = app.uid());
alter table user_preferred_categories enable row level security;
create policy upc_self on user_preferred_categories for all using (user_id = app.uid()) with check (user_id = app.uid());

alter table user_blocks enable row level security;
create policy ub_self on user_blocks for all using (blocker_id = app.uid()) with check (blocker_id = app.uid());

alter table business_profiles enable row level security;
create policy bp_read on business_profiles for select using (true);
create policy bp_update on business_profiles for update using (app.staff_role(id) in ('owner', 'manager')) with check (app.staff_role(id) in ('owner', 'manager'));

alter table business_staff enable row level security;
create policy bs_read on business_staff for select using (user_id = app.uid() or app.is_staff(business_id));
create policy bs_owner_delete on business_staff for delete using (app.staff_role(business_id) = 'owner' and user_id <> app.uid());

alter table user_follows enable row level security;
create policy uf_self on user_follows for all using (user_id = app.uid()) with check (user_id = app.uid());

alter table events enable row level security;
create policy ev_read on events for select using (status <> 'draft' or app.is_staff(business_id));
create policy ev_insert on events for insert with check (app.is_staff(business_id));
create policy ev_update on events for update using (app.is_staff(business_id)) with check (app.is_staff(business_id));
create policy ev_delete_draft on events for delete using (status = 'draft' and app.is_staff(business_id));

alter table event_music_genres enable row level security;
create policy emg_read on event_music_genres for select using (exists (select 1 from events e where e.id = event_id));
create policy emg_write on event_music_genres for all using (app.is_event_staff(event_id)) with check (app.is_event_staff(event_id));

alter table event_saves enable row level security;
create policy es_self on event_saves for all using (user_id = app.uid()) with check (user_id = app.uid());

-- Attendance rows are only ever readable by their owner. Public attendee lists
-- and counts go through app.event_public_attendees / app.event_attendance_counts.
alter table event_attendance enable row level security;
create policy ea_self on event_attendance for all using (user_id = app.uid()) with check (user_id = app.uid());

alter table attendance_confirmations enable row level security;
create policy ac_self on attendance_confirmations for all
  using (exists (select 1 from event_attendance a where a.id = attendance_id and a.user_id = app.uid()))
  with check (exists (select 1 from event_attendance a where a.id = attendance_id and a.user_id = app.uid()));

alter table event_feedback enable row level security;
create policy ef_self on event_feedback for all using (user_id = app.uid()) with check (user_id = app.uid());

alter table event_analytics enable row level security;
create policy ean_insert on event_analytics for insert
  with check ((user_id is null or user_id = app.uid()) and exists (select 1 from events e where e.id = event_id));
-- no select policy: raw analytics are only read through aggregate functions

alter table conversations enable row level security;
create policy cv_read on conversations for select using (app.can_access_conversation(id));

alter table conversation_members enable row level security;
create policy cm_read on conversation_members for select using (app.can_access_conversation(conversation_id));
create policy cm_update_self on conversation_members for update using (user_id = app.uid()) with check (user_id = app.uid());

alter table messages enable row level security;
create policy msg_read on messages for select using (app.can_access_conversation(conversation_id));
create policy msg_insert on messages for insert with check (sender_id = app.uid() and kind in ('text', 'event') and app.can_send_message(conversation_id, as_business));
create policy msg_soft_delete on messages for update using (sender_id = app.uid()) with check (sender_id = app.uid());

alter table business_conversation_reads enable row level security;
create policy bcr_staff on business_conversation_reads for all
  using (app.is_staff((select business_id from conversations where id = conversation_id)))
  with check (app.is_staff((select business_id from conversations where id = conversation_id)));

alter table groups enable row level security;
create policy gr_read on groups for select using (app.group_status(id) in ('active', 'invited'));
create policy gr_update on groups for update using (app.is_group_admin(id)) with check (app.is_group_admin(id));

alter table group_members enable row level security;
create policy gm_read on group_members for select using (app.group_status(group_id) in ('active', 'invited'));

alter table group_events enable row level security;
create policy ge_read on group_events for select using (app.group_status(group_id) = 'active');
create policy ge_insert on group_events for insert with check (shared_by = app.uid() and app.group_status(group_id) = 'active');

alter table group_rsvps enable row level security;
create policy grs_read on group_rsvps for select
  using (app.group_status((select group_id from group_events where id = group_event_id)) = 'active');
create policy grs_write on group_rsvps for insert
  with check (user_id = app.uid() and app.group_status((select group_id from group_events where id = group_event_id)) = 'active');
create policy grs_update on group_rsvps for update using (user_id = app.uid()) with check (user_id = app.uid());
create policy grs_delete on group_rsvps for delete using (user_id = app.uid());

alter table guest_list_requests enable row level security;
create policy glr_read on guest_list_requests for select using (
  requester_id = app.uid() or app.is_event_staff(event_id)
  or exists (select 1 from guest_list_entries e where e.request_id = guest_list_requests.id and e.user_id = app.uid()));
create policy glr_insert on guest_list_requests for insert with check (requester_id = app.uid() and status = 'pending');
create policy glr_update on guest_list_requests for update
  using (requester_id = app.uid() or app.is_event_staff(event_id))
  with check (requester_id = app.uid() or app.is_event_staff(event_id));

create or replace function app.request_requester(p_request uuid) returns uuid
language sql stable security definer set search_path = public, app as $$
  select requester_id from guest_list_requests where id = p_request
$$;
create or replace function app.request_event(p_request uuid) returns uuid
language sql stable security definer set search_path = public, app as $$
  select event_id from guest_list_requests where id = p_request
$$;

alter table guest_list_entries enable row level security;
-- Business staff only ever see names whose owner consented.
create policy gle_read on guest_list_entries for select using (
  user_id = app.uid() or app.request_requester(request_id) = app.uid()
  or (consent = 'accepted' and app.is_event_staff(app.request_event(request_id))));
create policy gle_insert on guest_list_entries for insert with check (app.request_requester(request_id) = app.uid());
create policy gle_consent on guest_list_entries for update using (user_id = app.uid()) with check (user_id = app.uid());

alter table table_requests enable row level security;
create policy tr_read on table_requests for select using (user_id = app.uid() or app.is_event_staff(event_id));
create policy tr_insert on table_requests for insert with check (user_id = app.uid() and status = 'pending');
create policy tr_update on table_requests for update
  using (user_id = app.uid() or app.is_event_staff(event_id))
  with check (user_id = app.uid() or app.is_event_staff(event_id));

alter table notification_preferences enable row level security;
create policy np_self on notification_preferences for all using (user_id = app.uid()) with check (user_id = app.uid());

alter table notifications enable row level security;
create policy n_self_read on notifications for select using (user_id = app.uid());
create policy n_self_update on notifications for update using (user_id = app.uid()) with check (user_id = app.uid());
create policy n_self_delete on notifications for delete using (user_id = app.uid());

alter table push_subscriptions enable row level security;
create policy ps_self on push_subscriptions for all using (user_id = app.uid()) with check (user_id = app.uid());

alter table business_campaigns enable row level security;
create policy bc_staff on business_campaigns for all using (app.is_staff(business_id)) with check (app.is_staff(business_id) and status in ('draft', 'scheduled', 'cancelled'));

alter table user_reports enable row level security;
create policy ur_self on user_reports for select using (reporter_id = app.uid());
create policy ur_insert on user_reports for insert with check (reporter_id = app.uid());

alter table recap_statistics enable row level security;
create policy rs_self on recap_statistics for select using (user_id = app.uid());

-- ───────────────────────── Integrity triggers ─────────────────────────

-- Request status machine: requester may only cancel; staff decide.
create or replace function app.guard_request_status() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  is_owner boolean := coalesce(to_jsonb(new)->>'user_id', to_jsonb(new)->>'requester_id')::uuid = app.uid();
begin
  if new.event_id <> old.event_id then raise exception 'immutable_event' using errcode = '42501'; end if;
  if new.status is distinct from old.status then
    if app.is_event_staff(new.event_id) then
      if old.status = 'cancelled' then raise exception 'request_cancelled' using errcode = '22023'; end if;
    elsif is_owner and new.status = 'cancelled' then
      null;
    else
      raise exception 'invalid_status_transition' using errcode = '42501';
    end if;
  end if;
  if not app.is_event_staff(new.event_id) and new.business_note is distinct from old.business_note then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger glr_guard before update on guest_list_requests for each row execute function app.guard_request_status();
create trigger tr_guard before update on table_requests for each row execute function app.guard_request_status();

-- Age restrictions for attendance / lists / tables.
create or replace function app.guard_event_age() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_min int;
  v_birth date;
  v_user uuid;
begin
  v_user := coalesce(to_jsonb(new)->>'user_id', to_jsonb(new)->>'requester_id')::uuid;
  select min_age into v_min from events where id = new.event_id;
  if coalesce(v_min, 0) > 0 then
    select birthdate into v_birth from users where id = v_user;
    if v_birth is null or v_birth > current_date - make_interval(years => v_min) then
      raise exception 'age_restricted' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger ea_age before insert on event_attendance for each row execute function app.guard_event_age();
create trigger glr_age before insert on guest_list_requests for each row execute function app.guard_event_age();
create trigger tr_age before insert on table_requests for each row execute function app.guard_event_age();

-- Only published, future events accept new intentions/requests.
create or replace function app.guard_event_open() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_status text; v_ends timestamptz;
begin
  select status, ends_at into v_status, v_ends from events where id = new.event_id;
  if v_status is distinct from 'published' or v_ends < now() then
    raise exception 'event_not_open' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger glr_open before insert on guest_list_requests for each row execute function app.guard_event_open();
create trigger tr_open before insert on table_requests for each row execute function app.guard_event_open();

create or replace function app.guard_attendance_open() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_status text; v_ends timestamptz;
begin
  if tg_op = 'UPDATE' and new.status = old.status then return new; end if;
  if new.status = 'going' then
    select status, ends_at into v_status, v_ends from events where id = new.event_id;
    if v_status is distinct from 'published' or v_ends < now() then
      raise exception 'event_not_open' using errcode = '22023';
    end if;
  end if;
  return new;
end $$;
create trigger ea_open before insert or update on event_attendance for each row execute function app.guard_attendance_open();

-- Confirmation only after the event ended.
create or replace function app.guard_confirmation() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare v_ends timestamptz;
begin
  select e.ends_at into v_ends from event_attendance a join events e on e.id = a.event_id where a.id = new.attendance_id;
  if v_ends > now() then raise exception 'event_not_ended' using errcode = '22023'; end if;
  return new;
end $$;
create trigger ac_guard before insert or update on attendance_confirmations for each row execute function app.guard_confirmation();

-- Basic anti-spam: at most 20 messages per minute per sender.
create or replace function app.guard_message_rate() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.kind <> 'system' and (select count(*) from messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'rate_limited' using errcode = '54000';
  end if;
  return new;
end $$;
create trigger msg_rate before insert on messages for each row execute function app.guard_message_rate();

-- Bump conversation + realtime fan-out. Payload contains only ids; clients
-- refetch through the API, where RLS applies again.
create or replace function app.on_message_insert() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare recipients jsonb;
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  if new.sender_id is not null then
    update conversation_members set last_read_at = new.created_at
    where conversation_id = new.conversation_id and user_id = new.sender_id;
  end if;
  select coalesce(jsonb_agg(distinct uid), '[]') into recipients from (
    select user_id as uid from conversation_members where conversation_id = new.conversation_id
    union
    select s.user_id from conversations c join business_staff s on s.business_id = c.business_id where c.id = new.conversation_id
  ) r;
  perform pg_notify('spot_realtime', jsonb_build_object('t', 'message', 'c', new.conversation_id, 'm', new.id, 'u', recipients)::text);
  return new;
end $$;
create trigger msg_after_insert after insert on messages for each row execute function app.on_message_insert();

create or replace function app.on_notification_insert() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  perform pg_notify('spot_realtime', jsonb_build_object('t', 'notification', 'u', jsonb_build_array(new.user_id))::text);
  return new;
end $$;
create trigger n_after_insert after insert on notifications for each row execute function app.on_notification_insert();

-- Follower counter
create or replace function app.on_follow_change() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if tg_op = 'INSERT' then
    update business_profiles set follower_count = follower_count + 1 where id = new.business_id;
  elsif tg_op = 'DELETE' then
    update business_profiles set follower_count = greatest(follower_count - 1, 0) where id = old.business_id;
  end if;
  return null;
end $$;
create trigger uf_count after insert or delete on user_follows for each row execute function app.on_follow_change();

-- ───────────────────────── Safe read models ─────────────────────────

-- Public profile card. Private profiles expose only name/username/avatar.
-- Users who blocked the viewer (or were blocked by them) disappear.
create view profile_cards with (security_barrier) as
select p.user_id, p.username, p.display_name, p.avatar_url, p.is_private,
       (p.is_private = false or p.user_id = app.uid()) as is_visible,
       case when p.is_private = false or p.user_id = app.uid() then p.bio end as bio,
       case when p.is_private = false or p.user_id = app.uid() then c.name end as city_name
from personal_profiles p
left join cities c on c.id = p.city_id
where not app.is_blocked_between(p.user_id, app.uid());

create view visible_social_links with (security_barrier) as
select l.user_id, l.platform, l.handle
from user_social_links l join personal_profiles p on p.user_id = l.user_id
where (l.user_id = app.uid())
   or (l.is_visible and p.is_private = false and not app.is_blocked_between(l.user_id, app.uid()));

-- Consenting attendees only: public visibility, still going (or declared
-- attended), adult attendee AND adult viewer, no blocks in either direction.
create or replace function app.event_public_attendees(p_event uuid)
returns table (user_id uuid, username text, display_name text, avatar_url text, is_private boolean,
               bio text, instagram text, tiktok text, is_me boolean)
language sql stable security definer set search_path = public, app as $$
  select p.user_id, p.username, p.display_name, p.avatar_url, p.is_private,
         case when p.is_private then null else p.bio end,
         case when p.is_private then null else (select handle from user_social_links l where l.user_id = p.user_id and l.platform = 'instagram' and l.is_visible) end,
         case when p.is_private then null else (select handle from user_social_links l where l.user_id = p.user_id and l.platform = 'tiktok' and l.is_visible) end,
         p.user_id = app.uid()
  from event_attendance a
  join personal_profiles p on p.user_id = a.user_id
  left join attendance_confirmations ac on ac.attendance_id = a.id
  where a.event_id = p_event
    and a.status = 'going'
    and a.visibility = 'public'
    and coalesce(ac.response, 'attended') <> 'not_attended'
    and app.uid() is not null
    and app.is_adult(app.uid())
    and app.is_adult(a.user_id)
    and not app.is_blocked_between(a.user_id, app.uid())
    and exists (select 1 from events e where e.id = p_event and e.status <> 'draft')
  order by (p.user_id = app.uid()) desc, a.created_at
$$;

-- Counts. `going_total` includes private intentions; the API only exposes it
-- when it is large enough not to single anyone out (see server/events.ts).
create or replace function app.event_attendance_counts(p_event uuid)
returns table (going_total int, visible_total int)
language sql stable security definer set search_path = public, app as $$
  select count(*) filter (where a.status = 'going')::int,
         (select count(*) from app.event_public_attendees(p_event))::int
  from event_attendance a where a.event_id = p_event
$$;

-- Credential lookup for login (runs before an identity is bound).
create or replace function app.auth_credentials(p_email text)
returns table (id uuid, password_hash text)
language sql stable security definer set search_path = public, app as $$
  select id, password_hash from users where email = lower(p_email)
$$;

create or replace function app.username_available(p_username text)
returns boolean language sql stable security definer set search_path = public, app as $$
  select not exists (select 1 from personal_profiles where username = lower(p_username) and user_id is distinct from app.uid())
$$;

-- Blocked users are hidden from profile_cards; the blocker still needs names to unblock.
create or replace function app.my_blocks()
returns table (user_id uuid, username text, display_name text, avatar_url text, created_at timestamptz)
language sql stable security definer set search_path = public, app as $$
  select b.blocked_id, p.username, p.display_name, p.avatar_url, b.created_at
  from user_blocks b join personal_profiles p on p.user_id = b.blocked_id
  where b.blocker_id = app.uid() order by b.created_at desc
$$;

create or replace function app.distance_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)))
$$;

-- Same rules as app.start_direct, without side effects (for the "Scrivi" button).
create or replace function app.can_dm(p_target uuid)
returns boolean language sql stable security definer set search_path = public, app as $$
  select app.uid() is not null and p_target <> app.uid()
    and (select account_type from users where id = app.uid()) = 'personal'
    and not app.is_blocked_between(app.uid(), p_target)
    and coalesce((select case dm_policy when 'everyone' then true when 'connections' then app.are_connected(app.uid(), p_target) else
          exists (select 1 from conversations c where c.direct_key = least(app.uid()::text, p_target::text) || ':' || greatest(app.uid()::text, p_target::text)) end
        from personal_profiles where user_id = p_target), false)
    and ((app.is_adult(app.uid()) and app.is_adult(p_target)) or exists (
      select 1 from group_members x join group_members y on y.group_id = x.group_id
      where x.user_id = app.uid() and y.user_id = p_target and x.status = 'active' and y.status = 'active'))
$$;
