-- spot. — privileges for the application role (spot_app).
-- The role is NOT the table owner, so every RLS policy applies to it.
-- On Supabase, grant the same privileges to the `authenticated` role.

grant usage on schema public, app to spot_app;

grant select on cities, music_genres, event_categories, recommendation_weights to spot_app;

grant select, delete on users to spot_app;
grant insert (id, email, password_hash, account_type, birthdate, locale, terms_accepted_at, privacy_accepted_at, marketing_consent_at) on users to spot_app;
grant update (password_hash, birthdate, locale, marketing_consent_at, onboarding_completed_at) on users to spot_app;
grant select, insert, delete on sessions to spot_app;

grant select, insert, update, delete on personal_profiles, user_social_links, user_preferences,
  user_preferred_genres, user_preferred_categories, user_blocks, user_follows, event_saves,
  event_attendance, attendance_confirmations, event_feedback, notification_preferences,
  push_subscriptions to spot_app;

grant select on business_profiles to spot_app;
grant update (name, category, logo_url, cover_url, description, address, city_id, neighborhood, lat, lng,
  opening_hours, website, instagram, phone, contact_email) on business_profiles to spot_app;
grant select, delete on business_staff to spot_app;

grant select, insert, update, delete on events, event_music_genres to spot_app;
grant insert on event_analytics to spot_app;
grant usage on sequence event_analytics_id_seq to spot_app;

grant select on conversations, conversation_members to spot_app;
grant update (last_read_at, muted) on conversation_members to spot_app;
grant select, insert on messages to spot_app;
grant update (deleted_at) on messages to spot_app;
grant select, insert, update on business_conversation_reads to spot_app;

grant select on groups, group_members to spot_app;
grant update (name, image_url, emoji) on groups to spot_app;
grant select, insert on group_events to spot_app;
grant select, insert, update, delete on group_rsvps to spot_app;

grant select, insert on guest_list_requests, table_requests to spot_app;
grant update (status, business_note, note) on guest_list_requests to spot_app;
grant update (status, business_note) on table_requests to spot_app;
grant select, insert on guest_list_entries to spot_app;
grant update (consent) on guest_list_entries to spot_app;

grant select, update (read_at), delete on notifications to spot_app;
grant select, insert, update, delete on business_campaigns to spot_app;
grant select, insert on user_reports to spot_app;
grant select on recap_statistics to spot_app;

grant select on profile_cards, visible_social_links to spot_app;

revoke execute on function app._deliver_campaign(uuid) from public;
