begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.allowed_owners (email text primary key check (email = lower(email)));
-- Add your own email through the SQL editor, never in a public migration.

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u join private.allowed_owners a on lower(u.email) = a.email
    where u.id = auth.uid() and u.email_confirmed_at is not null);
$$;
revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;

create table public.preferences (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);
create table public.transactions (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  source_key text,
  linked_id uuid generated always as (nullif(data->>'linkedTransactionId', '')::uuid) stored references public.transactions(id) deferrable initially deferred,
  created_at timestamptz not null default now()
);
create index transactions_owner_date on public.transactions(owner_id, (data->>'date'));
create unique index transactions_source on public.transactions(owner_id, source_key) where source_key is not null;
alter table public.transactions enable row level security;
alter table public.preferences enable row level security;
create policy owner_transactions on public.transactions for all to authenticated
  using (owner_id = auth.uid() and public.is_owner()) with check (owner_id = auth.uid() and public.is_owner());
create policy owner_preferences on public.preferences for all to authenticated
  using (owner_id = auth.uid() and public.is_owner()) with check (owner_id = auth.uid() and public.is_owner());
grant select, insert, update, delete on public.transactions, public.preferences to authenticated;
grant all on public.transactions, public.preferences to service_role;
revoke all on public.transactions, public.preferences from anon;

create or replace function private.validate_transaction() returns trigger
language plpgsql set search_path = '' as $$
declare amount numeric; share numeric; settled numeric; original_owner uuid; original_kind text;
begin
  if tg_op = 'UPDATE' and new.data->>'kind' <> 'expense' and exists(select 1 from public.transactions where linked_id = new.id) then raise exception 'Unlink credits before changing expense type'; end if;
  if not (new.data ?& array['id','date','merchant','amountPaise','kind','categoryId','accountId','personalSharePaise','settledPaise','excluded','source','createdAt']) then raise exception 'Missing transaction fields'; end if;
  amount := (new.data->>'amountPaise')::numeric;
  share := (new.data->>'personalSharePaise')::numeric;
  settled := (new.data->>'settledPaise')::numeric;
  if amount is null or share is null or settled is null or amount <= 0 or amount > 100000000000 or amount <> trunc(amount) or share < 0 or share > amount or share <> trunc(share) or settled < 0 or settled > amount-share or settled <> trunc(settled) then raise exception 'Invalid amount or split'; end if;
  if (new.data->>'id')::uuid <> new.id or length(trim(new.data->>'merchant')) not between 1 and 120 or length(new.data->>'notes') > 1000 then raise exception 'Invalid transaction'; end if;
  if new.data->>'kind' not in ('expense','income','refund','transfer','reimbursement') or new.data->>'source' not in ('manual','voice','statement','receipt','gmail') then raise exception 'Invalid transaction type'; end if;
  if new.data->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid date'; end if;
  perform (new.data->>'date')::date;
  if jsonb_typeof(new.data->'excluded') <> 'boolean' then raise exception 'Invalid exclusion'; end if;
  if coalesce(new.source_key, '') <> coalesce(new.data->>'sourceKey', '') then raise exception 'Source key mismatch'; end if;
  if new.data->>'linkedTransactionId' is not null then
    select owner_id, data->>'kind' into original_owner, original_kind from public.transactions where id = (new.data->>'linkedTransactionId')::uuid;
    if original_owner is distinct from new.owner_id or original_kind is distinct from 'expense' or new.data->>'kind' not in ('refund','reimbursement') or (new.data->>'linkedTransactionId')::uuid = new.id then raise exception 'Invalid expense link'; end if;
  end if;
  return new;
end;
$$;
create trigger validate_transaction before insert or update on public.transactions for each row execute function private.validate_transaction();

create or replace function public.import_transactions(records jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare entry jsonb;
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  if jsonb_typeof(records) <> 'array' or jsonb_array_length(records) > 10000 then raise exception 'Invalid import'; end if;
  -- Expenses first, then linked credits, so references can be validated.
  for entry in select value from jsonb_array_elements(records) order by case when value->'data'->>'kind' = 'expense' then 0 else 1 end loop
    if (entry->>'owner_id')::uuid <> auth.uid() then raise exception 'Owner mismatch'; end if;
    insert into public.transactions(id, owner_id, data, source_key)
      values ((entry->>'id')::uuid, auth.uid(), entry->'data', entry->>'source_key') on conflict do nothing;
  end loop;
end;
$$;
revoke all on function public.import_transactions(jsonb) from public;
grant execute on function public.import_transactions(jsonb) to authenticated;

create or replace function public.undo_import(import_id text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_owner() then raise exception 'Owner access required'; end if;
  delete from public.transactions where owner_id = auth.uid() and data->>'importId' = import_id;
end;
$$;
revoke all on function public.undo_import(text) from public;
grant execute on function public.undo_import(text) to authenticated;

create table public.integration_secrets (owner_id uuid primary key references auth.users(id) on delete cascade, encrypted_token text not null, updated_at timestamptz not null default now());
create table public.oauth_states (state_hash text primary key, owner_id uuid not null references auth.users(id) on delete cascade, expires_at timestamptz not null, verifier text not null);
create table public.ai_usage (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade, month text not null, reserved_paise bigint not null check(reserved_paise > 0), tokens jsonb, created_at timestamptz not null default now());
alter table public.integration_secrets enable row level security;
alter table public.oauth_states enable row level security;
alter table public.ai_usage enable row level security;
revoke all on public.integration_secrets, public.oauth_states, public.ai_usage from anon, authenticated;
grant all on public.integration_secrets, public.oauth_states, public.ai_usage to service_role;

create or replace function public.reserve_ai_budget(user_id uuid, reservation bigint) returns uuid
language plpgsql security definer set search_path = '' as $$
declare budget bigint; used bigint; enabled boolean; usage_id uuid; current_month text;
begin
  if reservation <= 0 then raise exception 'Invalid reservation'; end if;
  perform pg_advisory_xact_lock(hashtextextended(user_id::text, 0));
  select (data->>'aiEnabled')::boolean, (data->>'aiBudgetPaise')::bigint into enabled, budget from public.preferences where owner_id = user_id;
  if enabled is distinct from true then raise exception 'AI is disabled'; end if;
  current_month := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM');
  select coalesce(sum(reserved_paise),0) into used from public.ai_usage where owner_id = user_id and month = current_month;
  if budget is null or used + reservation > budget then raise exception 'Monthly AI budget reached'; end if;
  insert into public.ai_usage(owner_id, month, reserved_paise) values(user_id, current_month, reservation) returning id into usage_id;
  return usage_id;
end;
$$;
revoke all on function public.reserve_ai_budget(uuid,bigint) from public, anon, authenticated;
grant execute on function public.reserve_ai_budget(uuid,bigint) to service_role;

create or replace function public.before_user_created(event jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from private.allowed_owners where email = lower(event->'user'->>'email')) then
    return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','SpendPulse is a private app.'));
  end if;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;
grant usage on schema public to supabase_auth_admin;
commit;
