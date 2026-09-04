# poppet.

A cute list tracker — Assignment, Sched, and Recap tabs. Vanilla HTML/CSS/JS,
Supabase backend, deploy on Vercel. No login/name entry — goes straight into
the app.

## 1. Supabase setup

Run this in the **SQL Editor** of your Supabase project (`quvdlrprqcvoaewqqbwl`):

```sql
-- assignments -------------------------------------------------
create table assignments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_url text,
  due_date timestamptz not null,
  status text not null default 'active',       -- 'active' | 'history'
  moved_to_history_at timestamptz,
  created_at timestamptz not null default now()
);

-- recaps ------------------------------------------------------
create table recaps (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text,
  image_url text,
  created_at timestamptz not null default now()
);

-- schedule ------------------------------------------------------
create table schedule (
  id uuid primary key default gen_random_uuid(),
  code text,
  title text not null,
  day_of_week text not null,      -- 'Monday' .. 'Sunday'
  start_time time not null,
  end_time time not null,
  room text,
  professor text,
  created_at timestamptz not null default now()
);

-- RLS: this app has no login, so it's open access via the
-- publishable (anon) key. That's fine for a small personal/class
-- tracker — just never put the secret/service_role key in the
-- frontend.
alter table assignments enable row level security;
alter table recaps enable row level security;
alter table schedule enable row level security;

create policy "public full access" on assignments for all using (true) with check (true);
create policy "public full access" on recaps for all using (true) with check (true);
create policy "public full access" on schedule for all using (true) with check (true);
```

That's the only SQL you need to run by hand. The BTVTED 11A1 class list is
**not** a manual insert step — the app seeds it automatically the first
time it loads and finds the `schedule` table empty (see `ensureScheduleSeed()`
in `js/app.js`). After that it's just a normal editable table — add, delete,
or replace entries from the Sched tab any time.

## 2. Storage bucket (for images)

In the **Storage** tab of Supabase:

1. Create bucket: `poppet-images` → set as **Public bucket**.
2. Add policy (SQL Editor):

```sql
create policy "public read poppet-images"
on storage.objects for select
using (bucket_id = 'poppet-images');

create policy "public upload poppet-images"
on storage.objects for insert
with check (bucket_id = 'poppet-images');
```

## 3. Keys — important

- `js/config.js` uses the **publishable key** (`sb_publishable_...`) only.
  That's safe to ship in frontend code — it's what it's designed for.
- **Never** put the `sb_secret_...` key or the `service_role` JWT anywhere
  in these files. Nothing here needs it — keep those in your Supabase
  dashboard only.

## 4. Deploy on Vercel

1. Push this folder to a new GitHub repo (or drag it straight into the
   Vercel dashboard — "Deploy" → "Upload").
2. In Vercel: **New Project** → import → no build command needed (static
   site, plain HTML/CSS/JS) → Deploy.
3. This is a separate URL from your first Supabase-based site — same
   Supabase project, different deployment.

## 5. Add your own cute sound

Drop your file in as `assets/sounds/cutesounds.mp3`. The app tries to play
that first for every chime (save, enable-sound demo, due-soon nudge); if
it's missing it just falls back to a synthesized chime, so nothing breaks
either way — it only sounds even cuter once the file is in. The service
worker also precaches it, so once it's added it works offline too.

## 6. How it works

- **Sound**: on first open, a cute onboarding asks whether to enable notif
  sounds. It's synthesized (Web Audio API, no actual audio file), so it
  works instantly offline too — there's nothing to actually "download,"
  which is exactly why it's always available with no internet.
- **Assignment**: pick a subject from a dropdown (sourced from your Sched
  list — or choose "+ custom subject" to type your own), set a due date/time
  with the date and time pickers, optionally attach an image. Once the due
  date passes, it auto-moves to the **history** segment. History entries
  auto-delete after 3 days. You can also tap the check button to mark
  something done early.
- **Sched**: grouped by day of the week, with time/room/professor. Seeded
  automatically with BTVTED 11A1's schedule on first load (see above).
- **Recap**: a simple list of notes, optionally with an image.
- All cleanup (auto-move to history, auto-delete, one-time sched seed) runs
  every time the app loads — no cron job needed.

## Files

```
index.html
css/style.css
js/config.js      Supabase client + keys
js/sound.js       onboarding, real/synth sound playback, service worker registration
js/app.js         all app logic (CRUD, rendering, tabs, sched auto-seed)
sw.js             offline app-shell caching
manifest.json     PWA install metadata
icons/icon.svg    app icon / favicon
assets/sounds/    drop cutesounds.mp3 here
```
