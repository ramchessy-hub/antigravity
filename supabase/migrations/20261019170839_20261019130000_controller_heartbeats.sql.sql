-- Tracks last-poll timestamps for the .bat controller and other scripts
-- so the dashboard can show "last sync" times in the Withdraw card.
create table if not exists public.controller_heartbeats (
  source text primary key,
  last_seen_at timestamptz not null default now()
);

alter table public.controller_heartbeats enable row level security;

-- Public read (dashboard uses anon key); writes happen via service role in edge functions.
create policy "read_heartbeats"
  on public.controller_heartbeats for select
  to anon, authenticated using (true);

insert into public.controller_heartbeats (source, last_seen_at) values
  ('bat_controller', now()),
  ('tampermonkey', now())
on conflict (source) do nothing;
