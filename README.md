# spot. — Good plans. Great people.

Functional MVP of **spot.**, a social-first platform for discovering events, planning them with friends, talking to venues and keeping a private history of your nights out. The UI is in Italian, and all copy lives in a dictionary so more languages can be added.

> **What this is:** a working, mobile-first **PWA plus a responsive business dashboard**, backed by a real PostgreSQL database with row-level security. It is **not** a React Native/Expo binary: this environment cannot build or run native apps. See [Path to iOS/Android](#path-to-iosandroid). Native push, Apple/Google login and payments are **not** implemented. They are listed as placeholders, never faked.

---

## Quick start

```bash
# 1. Postgres 16 (or use your own)
docker compose up -d db

# 2. App
cp .env.example .env          # defaults work with docker-compose
npm install
npm run db:reset              # migrations + demo data
npm run dev                   # http://localhost:3000
```

| Demo account | Password | What it shows |
|---|---|---|
| `giulia@spot.demo` | `spotdemo123` | Main persona: feed, groups, chats, calendar, recap |
| `luca@spot.demo`, `sara@spot.demo`, `marco@spot.demo` … | `spotdemo123` | Friends in the groups |
| `chiara@spot.demo` | `spotdemo123` | Private profile |
| `alessio@spot.demo` | `spotdemo123` | Always attends privately |
| `martina@spot.demo` | `spotdemo123` | 16-year-old account (minor safeguards) |
| `business@spot.demo` | `spotdemo123` | Owner of *Magazzino 21* (dashboard) |
| `staff@spot.demo` | `spotdemo123` | Staff role at *Magazzino 21* |

All businesses, people and statistics are **fictional sample data** (`is_demo = true`). The dashboard shows a "Statistiche dimostrative" banner. Seed dates are relative to the current day, so the demo always has upcoming and past events.

---

## Architecture

```
Browser (PWA, mobile-first)          Business dashboard (responsive, same app)
        │  fetch /api/* (cookie)  ·  Bearer token for native clients
        ▼
Next.js 15 route handler  /api/[...path]  ──►  src/server/router.ts
        │  1. session lookup (sha256 token)      2. BEGIN; set_config('app.user_id', uid)
        │  3. zod validation → module handler     4. COMMIT  (one transaction per request)
        ▼
PostgreSQL 16 as role `spot_app` (NOT owner) → every RLS policy applies
        │  SECURITY DEFINER functions for multi-party writes & aggregates
        └─ NOTIFY spot_realtime ──► /api/realtime (SSE) ──► clients refetch through RLS
```

| Layer | Choice | Why |
|---|---|---|
| Web app + API | Next.js 15 (App Router), React 19, TypeScript | One deployable for the PWA, dashboard and REST API |
| Styling | Tailwind CSS v4 with design tokens in `globals.css` (light + dark) | Shared design system |
| DB | PostgreSQL 16 via `pg`, plain SQL migrations | RLS, triggers and functions are first-class |
| Realtime | `LISTEN/NOTIFY` → Server-Sent Events | No extra infrastructure; payloads hold **ids only** |
| Auth | Email/password (scrypt), httpOnly session cookie, bearer token for native | Sessions can be revoked server-side |
| Maps | Leaflet with a configurable XYZ tile server (`NEXT_PUBLIC_MAP_TILE_URL`) | No API key needed |
| Tests | Vitest (unit + API/RLS integration on a separate DB), Playwright (E2E) | |

**Why not Supabase directly?** The environment had no network access to hosted services. The schema is built to port: `app.uid()` stands in for `auth.uid()`, and `spot_app` stands in for `authenticated` (see [Supabase migration](#supabase-migration)).

### Source layout

```
db/migrations/001_schema.sql     tables, constraints, indexes
db/migrations/002_security.sql   RLS policies, guard triggers, safe views, realtime triggers
db/migrations/003_functions.sql  groups, DMs, campaigns, cron, recap, business analytics
db/migrations/004_grants.sql     column-level privileges for spot_app
db/seed.ts                       demo data (relative dates)
src/server/                      router, db (RLS context), auth, recommend.ts, modules/*
src/app/(auth)/                  welcome, login, registration, legal drafts
src/app/(app)/                   consumer app (bottom nav)
src/app/business/                business dashboard
src/components/                  design system (ui.tsx) + domain components
src/i18n/it.ts                   every UI string
tests/                           unit, API/RLS integration, e2e/
scripts/gen-art.ts               generates the illustrated demo covers/avatars/logos
```

---

## Security & privacy model

These rules are enforced in the database, not just hidden in the UI:

- **The app role is not the table owner**, so RLS applies to every query. Each request runs in a transaction bound to the caller's id.
- **Attendance rows are visible only to their owner.** Public attendee lists come from `app.event_public_attendees()`, which returns only people who chose *visibile* for that event. It also requires that both the attendee and the viewer are adults, that neither has blocked the other, and that the attendee has not declared *non ho partecipato*. Private profiles in the list show only name, username and avatar.
- **Attendee counts do not single anyone out.** The total, which includes private intentions, is shown only when it is 5 or more. Below that, only the visible count is shown (`publicAttendeeCount`).
- **Attendance visibility defaults to private.** Users under 18 cannot make it public, cannot see attendee lists, and can send direct messages only to people they share a group with.
- **Profiles:** `profile_cards` and `visible_social_links` are the only cross-user views. Blocked users disappear in both directions. Attendance history is never part of a profile.
- **Messages:** only members can read or post, plus staff for business conversations. Blocks stop direct messages. There is a rate limit of 20 messages per minute and soft-delete. Users can report messages or users and block them.
- **Requests:** a requester can only *cancel*; only event staff can confirm or decline (enforced by trigger). Each guest-list name needs that person's own consent, and **staff only ever see entries with consent `accepted`**.
- **Age gates** for events are checked in the API *and* by triggers. New intentions and requests are refused for events that are closed or past.
- **Business analytics** are served only through aggregate `SECURITY DEFINER` functions that check staff membership. Raw `event_analytics` has no SELECT grant at all. Followers by city are shown only where a city has at least 3 followers.
- **Promotions** go only to followers who switched on "Promo" for that business, have marketing consent (timestamped) and have the promotional preference on. Limits: 3 campaigns per business per rolling week, and a per-user weekly cap. Promotional and transactional notifications are separate categories.
- **GDPR:** terms and privacy acceptance are timestamped at signup. Users can export their data (`GET /api/me/export`) and delete their account, which cascades; sent messages remain as "Utente spot.".
- **Other protections:** CSRF (cookie mutations need the `X-Spot-Client` header and SameSite=Lax), login and registration rate limits, upload sniffing by magic bytes (JPG/PNG/WebP only, max 5 MB, no SVG), security headers, and reserved usernames.

---

## Data model (main tables)

`users` · `sessions` · `personal_profiles` · `user_social_links` · `user_preferences` (+ `user_preferred_genres`, `user_preferred_categories`) · `business_profiles` · `business_staff` (owner/manager/staff) · `user_follows` · `events` (draft/published/cancelled/completed, `series_id` for recurring events) · `event_music_genres` · `event_categories` · `music_genres` · `cities` · `event_saves` · `event_attendance` (going/cancelled + per-event `visibility`) · `attendance_confirmations` (self-declared) · `event_feedback` · `event_analytics` · `conversations` (direct/group/business) · `conversation_members` · `messages` · `business_conversation_reads` · `groups` (permanent/spot) · `group_members` · `group_events` · `group_rsvps` · `guest_list_requests` · `guest_list_entries` (per-person consent) · `table_requests` · `notifications` · `notification_preferences` · `push_subscriptions` · `business_campaigns` · `user_blocks` · `user_reports` · `recap_statistics` · `recommendation_weights`.

Each table has explicit FKs and `ON DELETE` behaviour, uniqueness constraints (one attendance per user and event, one active guest-list request per user and event, deduplicated direct chats) and indexes for feed, chat and analytics queries.

**Naming notes:** `attendance_visibility` is a column on `event_attendance` (1:1, so a separate table added nothing). Recurring events are separate rows that share a `series_id`, so each date keeps its own participation history.

---

## Recommendation engine (`src/server/recommend.ts`)

The engine is a transparent weighted score with no ML. The weights live in the `recommendation_weights` table and can be tuned without a deploy.

| Signal | Effect |
|---|---|
| Genre and activity match | Main boosts |
| Distance | From the user's city or device position; penalty beyond the max distance |
| Date relevance | Decays over 30 days |
| Preferred weekdays | Boost |
| Followed businesses | Boost |
| Categories of saved events | Affinity boost |
| Categories of **confirmed** attended events | Affinity boost |
| Group-size fit (tables for large groups) | Boost |
| Indoor/outdoor and venue size | Boost or penalty |
| Over-budget price | Penalty |
| Explicit feedback | *Mi interessa* boosts. *Non mi interessa* and *Mostrami meno eventi così* remove the event and penalise its category |

- **Explore mix:** about 15% of feed slots go to events outside the user's stated tastes, to avoid a filter bubble. The mix is deterministic per user per day.
- **Explainability:** every card shows why it was suggested ("Ami la Techno", "Segui il locale", "Qualcosa di nuovo ✨"). Tapping the reason opens the feedback sheet.

---

## Screens

**Personal app:** splash `/` · welcome `/benvenuto` · login `/accedi` · registration `/registrati` · onboarding (music → activities → group and preferences → privacy) · Home *Per te / Seguiti* + category chips · Explore with combinable filters, list/map and venue results · event detail · attendees `/eventi/:id/partecipanti` · guest list `/eventi/:id/lista` · table `/eventi/:id/tavolo` · public profile `/u/:username` · own profile · privacy `/profilo/privacy` · saved (`/calendario?view=saved`) · calendar (month + list: Salvati / In programma / Passati / Annullati) · chat inbox · direct/group/business chat with embedded event cards and group RSVP · create group · group details and RSVP · business profile `/locali/:slug` · notifications · history `/profilo/storico` · recap preview `/profilo/recap` · lists and tables `/profilo/richieste` · followed venues · notification preferences · account (theme, export, deletion).

**Business:** registration `/registrati?type=business` → `/business/registrati` · overview · events (table + filters) · create/edit (publish, back to draft, cancel with notifications, duplicate as a recurring series, delete draft) · guest lists · tables · messages (reply as the venue) · push campaigns (eligible audience, scheduling, weekly limit, opens) · analytics (funnel, follower growth, conversions, per-event table, campaigns) · venue profile editor · settings (staff roles).

---

## API

REST, JSON, all under `/api`. It is used by the web client and is ready for a native client (`Authorization: Bearer <token>`; send `X-Spot-Native: 1` on login or registration to receive the token).

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `GET /auth/username-available` |
| Me | `GET /me` · `PATCH /me/profile` · `GET/PUT /me/preferences` · `PUT /me/privacy` · `GET/PUT /me/notification-preferences` · `GET /me/follows` · `GET /me/blocks` · `GET /me/export` · `POST /me/delete` · `GET /me/recap?year=` · `GET /me/requests` |
| Discovery | `GET /feed?tab=for-you\|following&category=` · `GET /events?q=&city=&from=&to=&genres=&categories=&price_max=&free=&setting=&group=&tables=&guest_list=&age=&km=&sort=` · `GET /meta` |
| Events | `GET /events/:id` · `POST/DELETE /events/:id/save` · `POST/PATCH/DELETE /events/:id/attend` · `POST /events/:id/confirm` · `POST/DELETE /events/:id/feedback` · `GET /events/:id/attendees` · `POST /events/:id/guest-list` · `POST /events/:id/table` · `POST /events/:id/track` · `GET /calendar` |
| Social | `GET /businesses/:slug` · `POST/PATCH/DELETE /businesses/:slug/follow` · `POST /businesses/:slug/contact` · `GET /users/search` · `GET /users/:username` · `POST /users/:username/block` · `POST /reports` |
| Chat | `GET /conversations` · `POST /conversations/direct` · `GET /conversations/:id?before=` · `POST /conversations/:id/messages` · `POST /conversations/:id/read` · `DELETE /messages/:id` · `GET /realtime` (SSE) |
| Groups | `GET/POST /groups` · `GET/PATCH /groups/:id` · `POST /groups/:id/invite\|respond\|leave\|archive\|events` · `PATCH/DELETE /groups/:id/members/:userId` · `PUT /groups/:id/events/:geId/rsvp` |
| Business | `GET/POST /biz` · `GET/PATCH /biz/:bid` · `GET /biz/:bid/overview\|analytics` · `GET/POST /biz/:bid/events` · `GET/PATCH/DELETE /biz/:bid/events/:id` · `POST …/publish\|unpublish\|cancel\|duplicate` · `GET/PATCH /biz/:bid/guest-lists[/:id]` · `GET/PATCH /biz/:bid/tables[/:id]` · `GET /biz/:bid/conversations` · `GET/POST /biz/:bid/campaigns` · `GET /biz/:bid/campaigns/audience` · `POST …/campaigns/:id/send\|cancel` · `GET/POST/DELETE /biz/:bid/staff` |
| System | `POST /uploads` · `GET /files/:name` · `POST /cron/tick` (header `x-cron-secret`) · `GET /health` |

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_ADMIN_URL` | ✔ | Owner connection. Used **only** by migrations and seed |
| `DATABASE_URL` | ✔ | App connection as a non-owner role. The migration creates the role with this password |
| `APP_URL` | | Public base URL |
| `STORAGE_DIR` | | Uploaded images (default `./storage`) |
| `CRON_SECRET` | ✔ for cron | Protects `/api/cron/tick` |
| `NEXT_PUBLIC_MAP_TILE_URL` | | XYZ tile server (default OpenStreetMap; respect its usage policy) |
| `TEST_DATABASE_URL`, `TEST_DATABASE_ADMIN_URL` | | Defaults to `<db>_test` |
| `GOOGLE_*`, `APPLE_*`, `VAPID_*`, `EXPO_ACCESS_TOKEN` | — | Placeholders for the integrations below (not implemented) |

**Scheduled work:** run `curl -X POST -H "x-cron-secret: $CRON_SECRET" $APP_URL/api/cron/tick` every 5–15 minutes, using cron, a scheduler or `pg_cron`. Each run does the following, and is idempotent:

- marks ended events as *completed*;
- creates event reminders (according to each user's lead time);
- creates "Hai partecipato?" prompts after events;
- delivers scheduled campaigns;
- purges expired sessions.

---

## Tests

```bash
createdb spot_test                     # once (or let docker's postgres user create it)
npm test                               # Vitest: unit + API/RLS integration (resets spot_test)
npm run test:e2e                       # Playwright (starts `npm run dev` if needed)
# in a sandbox with a preinstalled Chromium:
CHROMIUM_PATH=/path/to/chrome npm run test:e2e
npm run typecheck && npm run build
```

Current status: **24 Vitest tests pass**, **2 Playwright flows pass**, and the typecheck and production build are clean.

**Integration tests (API/RLS):**
- **Flow A:** register → preferences → feed → detail → save → private attend → calendar → cancel.
- **Attendance privacy:**
  - private attendance is hidden;
  - private profiles show only basic info;
  - minors are restricted;
  - raw RLS checks as the app role.
- **Groups and messages:**
  - **Flow B:** invite → join → event card → RSVP. A group RSVP is not official attendance.
  - Outsiders cannot read or post.
  - Blocks hide profiles and stop direct messages.
- **Business:**
  - **Flow D:** draft is invisible → publish → appears in search and Seguiti.
  - Business boundaries are enforced.
  - **Flow E:** user ↔ business messaging; analytics contain no personal data.
  - Guest-list consent is respected.
  - Users cannot self-confirm their own requests.
- **Flow F:** post-event confirmation feeds the recap; future events cannot be confirmed.
- **Campaigns:** the audience includes only consenting followers.

**E2E (Playwright):**
- Flow A, fully through the UI.
- Flow C: the attendee list of a past event shows only consenting people, and the Instagram link appears on the public profile.

**Unit tests:** recommendation scoring, explore mix, feedback, attendee-count threshold, calendar sections.

---

## Implemented vs pending

### ✅ Implemented (working, with persisted data)
- Email/password auth, sessions, onboarding (5 steps), editable preferences
- Personal and business profiles, business staff roles, verification status (set by admins; there is no admin UI yet)
- Event lifecycle with recurring series; changing the time notifies attendees; cancelling notifies attendees and savers and closes open requests
- Feed *Per te* (weighted, explained, explore mix, feedback) and *Seguiti*
- Search and combinable filters, plus a map view (needs tile access)
- Save, attend (private by default), change visibility, cancel, confirm afterwards
- Consent-based attendee discovery with reconnection via public profiles and optional social links
- Calendar (month and list, four sections), private history
- Groups (permanent and spot): invites, roles, removal, leaving, archiving, embedded events, group RSVP, converting an RSVP into attendance
- Realtime chat (direct, group, business) with unread counts, event sharing, deletion, reporting and blocking
- Guest lists with per-person consent; table requests with explicit statuses
- In-app notifications (realtime) with preferences; promotional campaigns with consent, scheduling, limits and open tracking
- Business dashboard: KPIs, event management, lists, tables, messages, campaigns, analytics, profile editor, staff
- Recap data plus a preview with shareable PNG cards (generated on the device, never published automatically)
- Light and dark theme, PWA manifest, loading, empty and error states, Italian i18n dictionary

### 🟡 Placeholders or partial (clearly labelled in the UI or code)
- **Apple / Google login:** buttons call `/api/auth/oauth/:provider`, which returns `oauth_not_configured`. Integrate with Auth.js or Supabase Auth using the `GOOGLE_*` and `APPLE_*` variables.
- **Native push (APNs/FCM/Web Push):** the `push_subscriptions` table exists, but delivery is in-app only. To add it, send a push for each `notifications` insert (Expo Push API or `web-push` with VAPID keys) and respect the existing preference checks.
- **Maps:** Leaflet with OpenStreetMap tiles. There is no geocoding, so coordinates are entered manually in the business form.
- **Demo artwork:** generated illustrations stand in for real photos, and businesses can upload real photos.
- **Legal pages** are drafts and must be reviewed by a lawyer.
- **Moderation:** reports are stored, but there is no admin/moderation console yet. Business verification is a database flag.
- **Realtime across instances:** each server instance uses its own `LISTEN` connection, which is fine behind a load balancer. On Supabase, use Realtime instead.

### ⏭ Next phases (the architecture leaves room for them)
- **Phase 2:** better ranking (collaborative signals), detailed analytics exports, QR check-in for *verified* attendance
- **Phase 3:**
  - animated Wrapped;
  - group polls and group suggestions;
  - ticketing and payments (Stripe), linked to `ticket_url` and event capacity;
  - loyalty, sponsored events and a CRM.

---

## Path to iOS/Android

The API is already client-agnostic:

1. Use bearer tokens and the `X-Spot-Native: 1` header to authenticate.
2. Keep all business rules in SQL and in `src/server`.
3. Create an Expo app (`npx create-expo-app`) that reuses:
   - `src/i18n`
   - `src/lib/format.ts`
   - `src/lib/calendar.ts`
   - the API types
4. Port the screens one to one. The routes above map to Expo Router routes.
5. Replace SSE with `react-native-sse` or a WebSocket, and register Expo push tokens in `push_subscriptions`.

## Supabase migration

1. Run the SQL migrations in Supabase, replacing the body of `app.uid()` with `select auth.uid()`.
2. Grant `004_grants.sql` to `authenticated` instead of `spot_app`.
3. Replace `src/server/auth.ts` with Supabase Auth, and the `NOTIFY` broker with Supabase Realtime on `messages` and `notifications`.
4. Move uploads to Supabase Storage.

The RLS policies and `SECURITY DEFINER` functions carry over unchanged.
