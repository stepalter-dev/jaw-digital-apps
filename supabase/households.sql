-- Shared households — lets more than one signed-in account see and edit the
-- same journal progress (starting with Home Maintenance). Run this in the
-- Supabase SQL editor for project jaw-digital-skyrim (klqjspicelhvtyjhfhjf).
-- Safe to re-run — everything is idempotent, and this file never touches the
-- existing `progress` or `entitlements` tables: personal (non-household)
-- progress keeps working exactly as it does today.
--
-- Model, kept deliberately simple for v1:
--   - a user belongs to at most one household at a time
--   - every member has equal (owner-like) read/write access — no "view only"
--     role yet; add one later if it's ever needed
--   - a household's progress for a game lives in household_progress,
--     completely separate from a user's personal progress row. account.js
--     prefers the household row when the signed-in user is in one, and
--     falls back to their personal row otherwise (so joining a household
--     never deletes/hides progress you already had — it's just not the row
--     being synced anymore while you're in the household).
--
-- All four tables are created first, then RLS is turned on and every policy
-- added, then the functions. Order matters here: a policy's USING clause is
-- bound to real tables at CREATE POLICY time, so every table a policy (or a
-- SQL-language function) refers to has to exist already — households' own
-- policy refers to household_members, for instance — so tables-then-policies
-- avoids a "relation does not exist" error partway through the script.

-- ── tables ──────────────────────────────────────────────────────────────
create table if not exists public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default 'My Household',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member',
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Enforces "at most one household per user" at the database level, not just
-- in application code.
create unique index if not exists household_members_one_per_user
  on public.household_members (user_id);

-- Same "fully inaccessible directly" pattern as redeem_codes in
-- oblivion-entitlements.sql — reachable only through the functions below.
create table if not exists public.household_invites (
  code         text primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by   uuid not null references auth.users(id) on delete cascade,
  max_uses     int not null default 1,
  used_count   int not null default 0,
  active       bool not null default true,
  created_at   timestamptz not null default now()
);

-- Mirrors the shape of the existing `progress` table (payload + updated_at),
-- just keyed by household instead of by user.
create table if not exists public.household_progress (
  household_id uuid not null references public.households(id) on delete cascade,
  game         text not null,
  payload      jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  primary key (household_id, game)
);

-- ── row level security ──────────────────────────────────────────────────
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.household_progress enable row level security;

-- households: read own — no insert/update/delete policies for clients,
-- households are only ever created via create_household() (SECURITY DEFINER).
drop policy if exists "households: read own" on public.households;
create policy "households: read own"
  on public.households for select
  using (id in (select household_id from public.household_members where user_id = auth.uid()));

-- household_members: see your fellow members, and leave on your own.
-- No insert policy — joining happens only through join_household() below,
-- so invite codes stay the sole path in.
drop policy if exists "household_members: read fellow members" on public.household_members;
create policy "household_members: read fellow members"
  on public.household_members for select
  using (
    user_id = auth.uid()
    or household_id in (select household_id from public.household_members hm2 where hm2.user_id = auth.uid())
  );

drop policy if exists "household_members: leave own" on public.household_members;
create policy "household_members: leave own"
  on public.household_members for delete
  using (user_id = auth.uid());

-- household_invites: no policies at all — fully inaccessible to
-- anon/authenticated directly, reachable only through the functions below.

-- household_progress: any member of the household can read/write its row.
drop policy if exists "household_progress: household members read" on public.household_progress;
create policy "household_progress: household members read"
  on public.household_progress for select
  using (household_id in (select household_id from public.household_members where user_id = auth.uid()));

drop policy if exists "household_progress: household members write" on public.household_progress;
create policy "household_progress: household members write"
  on public.household_progress for insert
  with check (household_id in (select household_id from public.household_members where user_id = auth.uid()));

drop policy if exists "household_progress: household members update" on public.household_progress;
create policy "household_progress: household members update"
  on public.household_progress for update
  using (household_id in (select household_id from public.household_members where user_id = auth.uid()))
  with check (household_id in (select household_id from public.household_members where user_id = auth.uid()));

-- ── get_my_household(): one round trip for "am I in a household?" ───────
create or replace function public.get_my_household()
returns table (household_id uuid, name text, role text, member_count int)
language sql
security definer
set search_path = public
stable
as $$
  select h.id, h.name, hm.role,
    (select count(*)::int from public.household_members hm2 where hm2.household_id = h.id)
  from public.household_members hm
  join public.households h on h.id = hm.household_id
  where hm.user_id = auth.uid();
$$;

grant execute on function public.get_my_household() to authenticated;

-- ── create_household(): the only way a client can create one ────────────
create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    raise exception 'already_in_household';
  end if;

  insert into public.households (name, created_by)
  values (coalesce(nullif(trim(p_name), ''), 'My Household'), auth.uid())
  returning id into v_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_id, auth.uid(), 'owner');

  return v_id;
end;
$$;

grant execute on function public.create_household(text) to authenticated;

-- ── create_household_invite(): mint a code for the caller's household ───
create or replace function public.create_household_invite()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;

  select household_id into v_household
  from public.household_members
  where user_id = auth.uid();

  if v_household is null then
    raise exception 'not_in_household';
  end if;

  -- Short, unambiguous code (no 0/O/1/I), same style as redeem_codes.
  v_code := 'FAM-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

  insert into public.household_invites (code, household_id, created_by)
  values (v_code, v_household, auth.uid());

  return v_code;
end;
$$;

grant execute on function public.create_household_invite() to authenticated;

-- ── join_household(): redeem an invite code ──────────────────────────────
create or replace function public.join_household(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.household_invites%rowtype;
begin
  if auth.uid() is null then
    return 'not_signed_in';
  end if;
  if exists (select 1 from public.household_members where user_id = auth.uid()) then
    return 'already_in_household';
  end if;

  select * into v_row
  from public.household_invites
  where code = upper(trim(p_code))
  for update;

  if not found then
    return 'invalid_code';
  end if;
  if not v_row.active then
    return 'inactive_code';
  end if;
  if v_row.used_count >= v_row.max_uses then
    return 'exhausted_code';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_row.household_id, auth.uid(), 'member');

  update public.household_invites
  set used_count = used_count + 1
  where code = v_row.code;

  return 'ok';
end;
$$;

grant execute on function public.join_household(text) to authenticated;

-- ── leave_household(): step out, so nobody's stuck in a household ───────
create or replace function public.leave_household()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.household_members where user_id = auth.uid();
$$;

grant execute on function public.leave_household() to authenticated;
