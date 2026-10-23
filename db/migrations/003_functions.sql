-- spot. — multi-party operations. These run as SECURITY DEFINER because they
-- write rows on behalf of several users (e.g. both sides of a chat), so every
-- function performs its own authorization checks against app.uid() first.

create or replace function app.require_uid() returns uuid
language plpgsql stable as $$
begin
  if app.uid() is null then raise exception 'auth_required' using errcode = '28000'; end if;
  return app.uid();
end $$;

create or replace function app.require_personal() returns uuid
language plpgsql stable security definer set search_path = public, app as $$
declare v uuid := app.require_uid();
begin
  if (select account_type from users where id = v) <> 'personal' then
    raise exception 'personal_account_required' using errcode = '42501';
  end if;
  return v;
end $$;

-- ───────────────────────── Notifications ─────────────────────────
-- Transactional notification honoring the recipient's preferences.
create or replace function app.notify(p_user uuid, p_type text, p_title text, p_body text, p_link text, p_ref uuid)
returns void language plpgsql security definer set search_path = public, app as $$
declare np notification_preferences;
begin
  select * into np from notification_preferences where user_id = p_user;
  if found then
    if p_type in ('event_reminder', 'attendance_prompt') and not np.event_reminders then return; end if;
    if p_type in ('group_invite', 'group_event', 'group_joined') and not np.group_activity then return; end if;
    if p_type in ('guest_list_update', 'table_update', 'guest_list_consent') and not np.request_updates then return; end if;
    if p_type in ('business_message') and not np.messages then return; end if;
    if p_type in ('suggestion') and not np.suggestions then return; end if;
  end if;
  insert into notifications (user_id, category, type, title, body, link, ref_id)
  values (p_user, 'transactional', p_type, p_title, p_body, p_link, p_ref);
end $$;

-- ───────────────────────── Businesses ─────────────────────────
create or replace function app.create_business(p_slug text, p_name text, p_category text, p_city text, p_address text, p_description text)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_user uuid := app.require_uid(); v_id uuid;
begin
  if (select account_type from users where id = v_user) <> 'business' then
    raise exception 'business_account_required' using errcode = '42501';
  end if;
  if (select count(*) from business_staff where user_id = v_user and role = 'owner') >= 5 then
    raise exception 'too_many_businesses' using errcode = '54000';
  end if;
  insert into business_profiles (slug, name, category, city_id, address, description, verification_status)
  values (p_slug, p_name, p_category, p_city, p_address, p_description, 'pending')
  returning id into v_id;
  insert into business_staff (business_id, user_id, role) values (v_id, v_user, 'owner');
  return v_id;
end $$;

create or replace function app.add_staff(p_business uuid, p_email text, p_role text)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_target uuid;
begin
  if app.staff_role(p_business) is distinct from 'owner' then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('manager', 'staff') then raise exception 'invalid_role' using errcode = '22023'; end if;
  select id into v_target from users where email = lower(p_email) and account_type = 'business';
  if v_target is null then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  insert into business_staff (business_id, user_id, role) values (p_business, v_target, p_role)
  on conflict (business_id, user_id) do update set role = excluded.role where business_staff.role <> 'owner';
  return v_target;
end $$;

-- ───────────────────────── Conversations ─────────────────────────
create or replace function app.start_direct(p_target uuid)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare
  v_me uuid := app.require_personal();
  v_key text := least(v_me::text, p_target::text) || ':' || greatest(v_me::text, p_target::text);
  v_conv uuid;
  v_policy text;
begin
  if p_target = v_me then raise exception 'invalid_target' using errcode = '22023'; end if;
  select dm_policy into v_policy from personal_profiles where user_id = p_target;
  if v_policy is null then raise exception 'user_not_found' using errcode = 'P0002'; end if;
  if app.is_blocked_between(v_me, p_target) then raise exception 'dm_not_allowed' using errcode = '42501'; end if;
  select id into v_conv from conversations where direct_key = v_key;
  if v_conv is not null then return v_conv; end if;
  if v_policy = 'nobody' or (v_policy = 'connections' and not app.are_connected(v_me, p_target)) then
    raise exception 'dm_not_allowed' using errcode = '42501';
  end if;
  -- Minors: direct messages only with people they already share a group with.
  if (not app.is_adult(v_me) or not app.is_adult(p_target)) and not exists (
    select 1 from group_members x join group_members y on y.group_id = x.group_id
    where x.user_id = v_me and y.user_id = p_target and x.status = 'active' and y.status = 'active') then
    raise exception 'dm_not_allowed' using errcode = '42501';
  end if;
  insert into conversations (type, direct_key) values ('direct', v_key) returning id into v_conv;
  insert into conversation_members (conversation_id, user_id) values (v_conv, v_me), (v_conv, p_target);
  return v_conv;
end $$;

create or replace function app.start_business_conversation(p_business uuid)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_me uuid := app.require_personal(); v_conv uuid;
begin
  if not exists (select 1 from business_profiles where id = p_business) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select c.id into v_conv from conversations c join conversation_members m on m.conversation_id = c.id
  where c.type = 'business' and c.business_id = p_business and m.user_id = v_me limit 1;
  if v_conv is not null then return v_conv; end if;
  insert into conversations (type, business_id) values ('business', p_business) returning id into v_conv;
  insert into conversation_members (conversation_id, user_id) values (v_conv, v_me);
  return v_conv;
end $$;

-- ───────────────────────── Groups ─────────────────────────
create or replace function app.system_message(p_conv uuid, p_actor uuid, p_body text)
returns void language sql security definer set search_path = public, app as $$
  insert into messages (conversation_id, sender_id, kind, body) values (p_conv, p_actor, 'system', p_body)
$$;

create or replace function app.create_group(p_name text, p_kind text, p_event uuid, p_emoji text)
returns uuid language plpgsql security definer set search_path = public, app as $$
declare v_me uuid := app.require_personal(); v_conv uuid; v_group uuid;
begin
  if p_kind = 'spot' and p_event is null then raise exception 'event_required' using errcode = '22023'; end if;
  if p_event is not null and not exists (select 1 from events where id = p_event and status in ('published', 'completed')) then
    raise exception 'event_not_found' using errcode = 'P0002';
  end if;
  insert into conversations (type) values ('group') returning id into v_conv;
  insert into groups (conversation_id, name, kind, event_id, created_by, emoji)
  values (v_conv, p_name, p_kind, p_event, v_me, p_emoji) returning id into v_group;
  insert into group_members (group_id, user_id, role, status) values (v_group, v_me, 'admin', 'active');
  insert into conversation_members (conversation_id, user_id) values (v_conv, v_me);
  perform app.system_message(v_conv, v_me, 'group_created');
  if p_event is not null then
    insert into group_events (group_id, event_id, shared_by) values (v_group, p_event, v_me);
    insert into messages (conversation_id, sender_id, kind, event_id) values (v_conv, v_me, 'event', p_event);
  end if;
  return v_group;
end $$;

create or replace function app.invite_to_group(p_group uuid, p_users uuid[])
returns int language plpgsql security definer set search_path = public, app as $$
declare
  v_me uuid := app.require_personal();
  v_target uuid; v_count int := 0; v_n int; v_group groups; v_name text;
begin
  if not app.is_group_admin(p_group) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into v_group from groups where id = p_group;
  if v_group.archived_at is not null then raise exception 'group_archived' using errcode = '22023'; end if;
  select display_name into v_name from personal_profiles where user_id = v_me;
  foreach v_target in array p_users loop
    continue when v_target = v_me or app.is_blocked_between(v_me, v_target);
    continue when not exists (select 1 from users where id = v_target and account_type = 'personal');
    insert into group_members (group_id, user_id, role, status, invited_by)
    values (p_group, v_target, 'member', 'invited', v_me)
    on conflict (group_id, user_id) do update set status = 'invited', invited_by = v_me, role = 'member'
      where group_members.status in ('declined', 'left', 'removed');
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_count := v_count + 1;
      perform app.notify(v_target, 'group_invite', v_name || ' ti ha invitato in ' || v_group.name,
                         'Entra nel gruppo per organizzare insieme.', '/gruppi/' || p_group, p_group);
    end if;
  end loop;
  return v_count;
end $$;

create or replace function app.respond_group_invite(p_group uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public, app as $$
declare v_me uuid := app.require_personal(); v_conv uuid;
begin
  if app.group_status(p_group) is distinct from 'invited' then raise exception 'no_invite' using errcode = 'P0002'; end if;
  select conversation_id into v_conv from groups where id = p_group;
  if p_accept then
    update group_members set status = 'active' where group_id = p_group and user_id = v_me;
    insert into conversation_members (conversation_id, user_id) values (v_conv, v_me) on conflict do nothing;
    perform app.system_message(v_conv, v_me, 'member_joined');
  else
    update group_members set status = 'declined' where group_id = p_group and user_id = v_me;
  end if;
end $$;

create or replace function app.ensure_group_admin(p_group uuid)
returns void language sql security definer set search_path = public, app as $$
  update group_members set role = 'admin'
  where group_id = p_group and user_id = (
    select user_id from group_members where group_id = p_group and status = 'active' order by created_at limit 1)
  and not exists (select 1 from group_members where group_id = p_group and status = 'active' and role = 'admin')
$$;

create or replace function app.leave_group(p_group uuid)
returns void language plpgsql security definer set search_path = public, app as $$
declare v_me uuid := app.require_personal(); v_conv uuid;
begin
  if app.group_status(p_group) is distinct from 'active' then raise exception 'not_member' using errcode = '42501'; end if;
  select conversation_id into v_conv from groups where id = p_group;
  update group_members set status = 'left', role = 'member' where group_id = p_group and user_id = v_me;
  delete from conversation_members where conversation_id = v_conv and user_id = v_me;
  perform app.system_message(v_conv, v_me, 'member_left');
  perform app.ensure_group_admin(p_group);
end $$;

create or replace function app.remove_group_member(p_group uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public, app as $$
declare v_me uuid := app.require_personal(); v_conv uuid; v_name text;
begin
  if not app.is_group_admin(p_group) or p_user = v_me then raise exception 'forbidden' using errcode = '42501'; end if;
  update group_members set status = 'removed', role = 'member'
  where group_id = p_group and user_id = p_user and status in ('active', 'invited');
  if not found then raise exception 'not_member' using errcode = 'P0002'; end if;
  select conversation_id into v_conv from groups where id = p_group;
  delete from conversation_members where conversation_id = v_conv and user_id = p_user;
  select display_name into v_name from personal_profiles where user_id = p_user;
  perform app.system_message(v_conv, v_me, 'member_removed|' || coalesce(v_name, ''));
end $$;

create or replace function app.set_group_role(p_group uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_group_admin(p_group) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_role not in ('admin', 'member') then raise exception 'invalid_role' using errcode = '22023'; end if;
  update group_members set role = p_role where group_id = p_group and user_id = p_user and status = 'active';
  perform app.ensure_group_admin(p_group);
end $$;

create or replace function app.archive_group(p_group uuid)
returns void language plpgsql security definer set search_path = public, app as $$
declare v_conv uuid;
begin
  if not app.is_group_admin(p_group) then raise exception 'forbidden' using errcode = '42501'; end if;
  select conversation_id into v_conv from groups where id = p_group;
  perform app.system_message(v_conv, app.uid(), 'group_archived');
  update groups set archived_at = now() where id = p_group;
end $$;

-- Guest-list co-guests: create pending entries; each person must consent.
create or replace function app.add_guest_list_guests(p_request uuid, p_users uuid[])
returns int language plpgsql security definer set search_path = public, app as $$
declare
  v_me uuid := app.require_personal();
  r guest_list_requests; v_target uuid; v_n int := 0; v_title text; v_name text;
begin
  select * into r from guest_list_requests where id = p_request;
  if r.requester_id is distinct from v_me then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.group_id is null then raise exception 'group_required' using errcode = '22023'; end if;
  select title into v_title from events where id = r.event_id;
  select display_name into v_name from personal_profiles where user_id = v_me;
  foreach v_target in array p_users loop
    continue when v_target = v_me;
    -- only active members of the request's group can be proposed
    continue when not exists (select 1 from group_members where group_id = r.group_id and user_id = v_target and status = 'active');
    insert into guest_list_entries (request_id, user_id, display_name, consent)
    select p_request, v_target, p.display_name, 'pending' from personal_profiles p where p.user_id = v_target
    on conflict do nothing;
    if found then
      v_n := v_n + 1;
      perform app.notify(v_target, 'guest_list_consent', v_name || ' vuole metterti in lista',
        'Conferma per comparire nella lista di ' || v_title || '. Il tuo nome verrà inviato solo se accetti.', '/profilo/richieste', p_request);
    end if;
  end loop;
  return v_n;
end $$;

-- ───────────────────────── Campaigns ─────────────────────────
create or replace function app._deliver_campaign(p_campaign uuid)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare c business_campaigns; b business_profiles; v_total int; v_sent int; v_link text;
begin
  select * into c from business_campaigns where id = p_campaign for update;
  if c.status not in ('draft', 'scheduled') then raise exception 'campaign_not_sendable' using errcode = '22023'; end if;
  if (select count(*) from business_campaigns where business_id = c.business_id and status = 'sent' and sent_at > now() - interval '7 days') >= 3 then
    raise exception 'campaign_weekly_limit' using errcode = '54000';
  end if;
  select * into b from business_profiles where id = c.business_id;
  v_link := case when c.event_id is not null then '/eventi/' || c.event_id else '/locali/' || b.slug end;

  create temporary table _aud on commit drop as
  select f.user_id from user_follows f
  join users u on u.id = f.user_id and u.marketing_consent_at is not null
  join notification_preferences np on np.user_id = f.user_id and np.promotional
  where f.business_id = c.business_id and f.notify_promotions
    and (c.audience = 'followers'
      or (c.audience = 'event_savers' and exists (select 1 from event_saves s where s.user_id = f.user_id and s.event_id = c.event_id))
      or (c.audience = 'event_attendees' and exists (select 1 from event_attendance a where a.user_id = f.user_id and a.event_id = c.event_id and a.status = 'going')));
  select count(*) into v_total from _aud;

  insert into notifications (user_id, category, type, title, body, link, ref_id, campaign_id)
  select a.user_id, 'promotional', 'campaign', b.name || ' · ' || c.title, c.message, v_link, coalesce(c.event_id, c.business_id), c.id
  from _aud a join notification_preferences np on np.user_id = a.user_id
  where (select count(*) from notifications n where n.user_id = a.user_id and n.category = 'promotional'
         and n.created_at > now() - interval '7 days') < np.max_promotional_per_week;
  get diagnostics v_sent = row_count;

  update business_campaigns set status = 'sent', sent_at = now(), recipients_count = v_sent, skipped_count = v_total - v_sent
  where id = p_campaign;
  drop table _aud;
  return jsonb_build_object('recipients', v_sent, 'skipped', v_total - v_sent);
end $$;

create or replace function app.send_campaign(p_campaign uuid)
returns jsonb language plpgsql security definer set search_path = public, app as $$
begin
  if not app.is_staff((select business_id from business_campaigns where id = p_campaign)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return app._deliver_campaign(p_campaign);
end $$;

-- Eligible audience size (for the campaign composer), aggregate only.
create or replace function app.campaign_audience_size(p_business uuid, p_audience text, p_event uuid)
returns int language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.is_staff(p_business) then raise exception 'forbidden' using errcode = '42501'; end if;
  return (select count(*) from user_follows f
    join users u on u.id = f.user_id and u.marketing_consent_at is not null
    join notification_preferences np on np.user_id = f.user_id and np.promotional
    where f.business_id = p_business and f.notify_promotions
      and (p_audience = 'followers'
        or (p_audience = 'event_savers' and exists (select 1 from event_saves s where s.user_id = f.user_id and s.event_id = p_event))
        or (p_audience = 'event_attendees' and exists (select 1 from event_attendance a where a.user_id = f.user_id and a.event_id = p_event and a.status = 'going'))));
end $$;

-- ───────────────────────── Scheduled work ─────────────────────────
-- Idempotent; call periodically (see /api/cron/tick).
create or replace function app.cron_tick()
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare v_completed int; v_reminders int; v_prompts int; v_campaigns int := 0; c record;
begin
  update events set status = 'completed' where status = 'published' and ends_at < now();
  get diagnostics v_completed = row_count;

  insert into notifications (user_id, category, type, title, body, link, ref_id)
  select distinct x.user_id, 'transactional', 'event_reminder', 'Promemoria: ' || e.title,
         to_char(e.starts_at at time zone 'Europe/Rome', 'DD/MM HH24:MI') || ' · ' || e.venue_name,
         '/eventi/' || e.id, e.id
  from (select user_id, event_id from event_attendance where status = 'going'
        union select user_id, event_id from event_saves) x
  join events e on e.id = x.event_id and e.status = 'published'
  join notification_preferences np on np.user_id = x.user_id and np.event_reminders
  where e.starts_at > now() and e.starts_at <= now() + make_interval(hours => np.reminder_hours)
    and not exists (select 1 from notifications n where n.user_id = x.user_id and n.type = 'event_reminder' and n.ref_id = e.id);
  get diagnostics v_reminders = row_count;

  insert into notifications (user_id, category, type, title, body, link, ref_id)
  select a.user_id, 'transactional', 'attendance_prompt', 'Hai partecipato a ' || e.title || '?',
         'Conferma per tenere traccia delle tue esperienze. Solo tu vedrai il tuo storico.', '/calendario?view=past', e.id
  from event_attendance a join events e on e.id = a.event_id
  left join notification_preferences np on np.user_id = a.user_id
  where a.status = 'going' and e.ends_at < now() and e.ends_at > now() - interval '14 days'
    and coalesce(np.event_reminders, true)
    and not exists (select 1 from attendance_confirmations ac where ac.attendance_id = a.id)
    and not exists (select 1 from notifications n where n.user_id = a.user_id and n.type = 'attendance_prompt' and n.ref_id = e.id);
  get diagnostics v_prompts = row_count;

  for c in select id from business_campaigns where status = 'scheduled' and scheduled_at <= now() loop
    begin
      perform app._deliver_campaign(c.id);
      v_campaigns := v_campaigns + 1;
    exception when others then
      update business_campaigns set status = 'cancelled' where id = c.id;
    end;
  end loop;

  delete from sessions where expires_at < now();
  return jsonb_build_object('completed', v_completed, 'reminders', v_reminders, 'prompts', v_prompts, 'campaigns', v_campaigns);
end $$;

-- ───────────────────────── Recap ─────────────────────────
create or replace function app.compute_recap(p_year int)
returns jsonb language plpgsql security definer set search_path = public, app as $$
declare v_me uuid := app.require_personal(); v jsonb;
begin
  with att as (
    select a.id, a.event_id, e.business_id, e.city_id, e.category_id, e.starts_at,
           coalesce(ac.response, 'unconfirmed') as resp
    from event_attendance a
    join events e on e.id = a.event_id
    left join attendance_confirmations ac on ac.attendance_id = a.id
    where a.user_id = v_me and a.status = 'going' and e.ends_at < now()
      and extract(year from e.starts_at at time zone 'Europe/Rome') = p_year
  ), conf as (select * from att where resp = 'attended')
  select jsonb_build_object(
    'year', p_year,
    'confirmed_events', (select count(*) from conf),
    'unconfirmed_events', (select count(*) from att where resp in ('unconfirmed', 'skipped')),
    'venues_count', (select count(distinct business_id) from conf),
    'cities_count', (select count(distinct city_id) from conf),
    'top_venues', coalesce((select jsonb_agg(x) from (
        select b.name, b.slug, count(*) as n from conf join business_profiles b on b.id = conf.business_id
        group by b.name, b.slug order by n desc, b.name limit 5) x), '[]'),
    'top_categories', coalesce((select jsonb_agg(x) from (
        select c.id, c.label, count(*) as n from conf join event_categories c on c.id = conf.category_id
        group by c.id, c.label order by n desc, c.label limit 5) x), '[]'),
    'top_genres', coalesce((select jsonb_agg(x) from (
        select g.id, g.label, count(*) as n from conf join event_music_genres eg on eg.event_id = conf.event_id
        join music_genres g on g.id = eg.genre_id group by g.id, g.label order by n desc, g.label limit 5) x), '[]'),
    'months', (select jsonb_agg(coalesce(m.n, 0) order by gs.mo) from generate_series(1, 12) gs(mo)
        left join (select extract(month from starts_at at time zone 'Europe/Rome')::int as mo, count(*) as n from conf group by 1) m on m.mo = gs.mo),
    'most_active_month', (select extract(month from starts_at at time zone 'Europe/Rome')::int from conf group by 1 order by count(*) desc, 1 limit 1),
    'active_groups', (select count(*) from group_members where user_id = v_me and status = 'active'),
    'events_with_groups', (select count(distinct conf.event_id) from conf
        join group_events ge on ge.event_id = conf.event_id
        join group_members gm on gm.group_id = ge.group_id and gm.user_id = v_me and gm.status = 'active'),
    'saved_events', (select count(*) from event_saves s join events e on e.id = s.event_id
        where s.user_id = v_me and extract(year from e.starts_at at time zone 'Europe/Rome') = p_year)
  ) into v;
  insert into recap_statistics (user_id, year, stats, computed_at) values (v_me, p_year, v, now())
  on conflict (user_id, year) do update set stats = excluded.stats, computed_at = now();
  return v;
end $$;

-- ───────────────────────── Business analytics (aggregates only) ─────────────────────────
create or replace function app.biz_event_stats(p_business uuid, p_since timestamptz)
returns table (event_id uuid, title text, starts_at timestamptz, status text, cover_url text,
               impressions int, views int, ticket_clicks int, shares int, saves int, going int,
               declared_attended int, gl_requests int, gl_confirmed int, gl_pending int,
               tables_requests int, tables_confirmed int, tables_pending int)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.is_staff(p_business) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select e.id, e.title, e.starts_at, e.status, e.cover_url,
    (select count(*) from event_analytics x where x.event_id = e.id and x.kind = 'impression' and x.created_at >= p_since)::int,
    (select count(*) from event_analytics x where x.event_id = e.id and x.kind = 'view' and x.created_at >= p_since)::int,
    (select count(*) from event_analytics x where x.event_id = e.id and x.kind = 'ticket_click' and x.created_at >= p_since)::int,
    (select count(*) from event_analytics x where x.event_id = e.id and x.kind = 'share' and x.created_at >= p_since)::int,
    (select count(*) from event_saves s where s.event_id = e.id)::int,
    (select count(*) from event_attendance a where a.event_id = e.id and a.status = 'going')::int,
    (select count(*) from event_attendance a join attendance_confirmations ac on ac.attendance_id = a.id
       where a.event_id = e.id and ac.response = 'attended')::int,
    (select count(*) from guest_list_requests g where g.event_id = e.id and g.status <> 'cancelled')::int,
    (select count(*) from guest_list_requests g where g.event_id = e.id and g.status = 'confirmed')::int,
    (select count(*) from guest_list_requests g where g.event_id = e.id and g.status = 'pending')::int,
    (select count(*) from table_requests t where t.event_id = e.id and t.status <> 'cancelled')::int,
    (select count(*) from table_requests t where t.event_id = e.id and t.status = 'confirmed')::int,
    (select count(*) from table_requests t where t.event_id = e.id and t.status = 'pending')::int
  from events e where e.business_id = p_business
  order by e.starts_at desc;
end $$;

create or replace function app.biz_timeseries(p_business uuid, p_days int)
returns table (day date, impressions int, views int, saves int, going int, follows int, followers_total int)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.is_staff(p_business) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  with days as (select generate_series(current_date - (p_days - 1), current_date, interval '1 day')::date as d),
  ev as (select id from events where business_id = p_business)
  select days.d,
    (select count(*) from event_analytics x where x.event_id in (select id from ev) and x.kind = 'impression' and x.created_at::date = days.d)::int,
    (select count(*) from event_analytics x where x.event_id in (select id from ev) and x.kind = 'view' and x.created_at::date = days.d)::int,
    (select count(*) from event_saves s where s.event_id in (select id from ev) and s.created_at::date = days.d)::int,
    (select count(*) from event_attendance a where a.event_id in (select id from ev) and a.status = 'going' and a.created_at::date = days.d)::int,
    (select count(*) from user_follows f where f.business_id = p_business and f.created_at::date = days.d)::int,
    (select count(*) from user_follows f where f.business_id = p_business and f.created_at::date <= days.d)::int
  from days order by days.d;
end $$;

create or replace function app.biz_message_stats(p_business uuid, p_since timestamptz)
returns table (conversations int, inbound int, outbound int, unread int)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.is_staff(p_business) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select (select count(*) from conversations c where c.business_id = p_business)::int,
         (select count(*) from messages m join conversations c on c.id = m.conversation_id
           where c.business_id = p_business and not m.as_business and m.kind <> 'system' and m.created_at >= p_since)::int,
         (select count(*) from messages m join conversations c on c.id = m.conversation_id
           where c.business_id = p_business and m.as_business and m.created_at >= p_since)::int,
         (select count(*) from conversations c left join business_conversation_reads r on r.conversation_id = c.id
           where c.business_id = p_business and exists (
             select 1 from messages m where m.conversation_id = c.id and not m.as_business
               and m.created_at > coalesce(r.last_read_at, '-infinity')))::int;
end $$;

create or replace function app.biz_campaign_stats(p_business uuid)
returns table (campaign_id uuid, opened int)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.is_staff(p_business) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select c.id, (select count(*) from notifications n where n.campaign_id = c.id and n.read_at is not null)::int
  from business_campaigns c where c.business_id = p_business;
end $$;

-- Follower-level demographics are intentionally NOT exposed: only counts by city.
create or replace function app.biz_followers_by_city(p_business uuid)
returns table (city text, n int)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.is_staff(p_business) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query
  select coalesce(ci.name, 'Altro'), count(*)::int from user_follows f
  join personal_profiles p on p.user_id = f.user_id left join cities ci on ci.id = p.city_id
  where f.business_id = p_business group by 1 having count(*) >= 3 order by 2 desc;
end $$;

create or replace function app.biz_staff_list(p_business uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, app as $$
begin
  if not app.is_staff(p_business) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select s.user_id, u.email, s.role, s.created_at
    from business_staff s join users u on u.id = s.user_id where s.business_id = p_business order by s.created_at;
end $$;

-- Notify everyone with a stake in an event (going or saved). Staff only.
create or replace function app.notify_event_audience(p_event uuid, p_type text, p_title text, p_body text)
returns int language plpgsql security definer set search_path = public, app as $$
declare v_n int;
begin
  if not app.is_event_staff(p_event) then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into notifications (user_id, category, type, title, body, link, ref_id)
  select x.user_id, 'transactional', p_type, p_title, p_body, '/eventi/' || p_event, p_event
  from (select user_id from event_attendance where event_id = p_event and status = 'going'
        union select user_id from event_saves where event_id = p_event) x;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
