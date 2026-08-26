-- Entitlements + redeem-code system for JAW Digital journals.
-- Run this in the Supabase SQL editor for project jaw-digital-skyrim
-- (klqjspicelhvtyjhfhjf). Safe to re-run — everything is idempotent.
--
-- Gates: signed-in cloud sync (progress table) is the paid feature. The
-- journal itself stays free to browse/use locally either way.

-- ── entitlements ────────────────────────────────────────────────────────
-- One row = one user has access to one game's cloud sync. Written only by
-- the redeem_code() function below (free codes) or by a payment webhook
-- using the service_role key (real purchases) — never directly by clients.
create table if not exists public.entitlements (
  user_id    uuid not null references auth.users(id) on delete cascade,
  game       text not null,
  source     text not null default 'code',   -- 'code' | 'lemonsqueezy' | 'manual'
  order_id   text,                            -- Lemon Squeezy order id, when applicable
  created_at timestamptz not null default now(),
  primary key (user_id, game)
);

alter table public.entitlements enable row level security;

drop policy if exists "entitlements: read own" on public.entitlements;
create policy "entitlements: read own"
  on public.entitlements for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies for anon/authenticated on purpose —
-- all writes go through the SECURITY DEFINER function or the webhook's
-- service_role key, both of which bypass RLS.

-- ── redeem_codes ────────────────────────────────────────────────────────
-- Single-use (or capped multi-use) free-access codes you hand out.
create table if not exists public.redeem_codes (
  code       text primary key,
  game       text not null,
  max_uses   int not null default 1,
  used_count int not null default 0,
  active     bool not null default true,
  note       text,                            -- e.g. "for Steve" — your own reminder
  created_at timestamptz not null default now()
);

alter table public.redeem_codes enable row level security;
-- No policies at all: fully inaccessible to anon/authenticated directly.
-- Only reachable through redeem_code() below (SECURITY DEFINER).

-- ── redeem_code(): the only way a client can grant itself an entitlement ─
create or replace function public.redeem_code(p_code text, p_game text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.redeem_codes%rowtype;
begin
  if auth.uid() is null then
    return 'not_signed_in';
  end if;

  select * into v_row
  from public.redeem_codes
  where code = upper(trim(p_code))
  for update;

  if not found then
    return 'invalid_code';
  end if;
  if not v_row.active then
    return 'inactive_code';
  end if;
  if v_row.game <> p_game then
    return 'wrong_game';
  end if;
  if v_row.used_count >= v_row.max_uses then
    return 'exhausted_code';
  end if;

  insert into public.entitlements (user_id, game, source)
  values (auth.uid(), p_game, 'code')
  on conflict (user_id, game) do nothing;

  update public.redeem_codes
  set used_count = used_count + 1
  where code = v_row.code;

  return 'ok';
end;
$$;

-- Let signed-in users call the function (RLS inside it still guards the tables).
grant execute on function public.redeem_code(text, text) to authenticated;

-- ── example: generate a batch of single-use codes for Oblivion ──────────
-- Uncomment and edit to mint codes. Each is short, unambiguous (no 0/O/1/I),
-- and prefixed so you can tell at a glance which game/batch it's from.
--
-- insert into public.redeem_codes (code, game, note)
-- select 'OBLIV-' || upper(substr(md5(random()::text), 1, 6)), 'oblivion', 'friends batch'
-- from generate_series(1, 20);
--
-- select code from public.redeem_codes where note = 'friends batch';
