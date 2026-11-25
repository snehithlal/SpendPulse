import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { emptyData } from '../../src/lib/defaults';

const ownerId = '11111111-1111-4111-8111-111111111111';
const strangerId = '22222222-2222-4222-8222-222222222222';
let db: PGlite;
const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
};
const transaction = (patch: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  date: '2026-11-25',
  merchant: 'Synthetic SQL test',
  amountPaise: 35000,
  personalSharePaise: 35000,
  settledPaise: 0,
  kind: 'expense',
  categoryId: 'food',
  accountId: 'cash',
  source: 'manual',
  sourceKey: null,
  importId: null,
  notes: '',
  excluded: false,
  linkedTransactionId: null,
  createdAt: new Date().toISOString(),
  ...patch,
});
const insert = async (data: ReturnType<typeof transaction>, user = ownerId) =>
  db.query('insert into public.transactions(id, owner_id, data, source_key) values ($1,$2,$3,$4)', [
    data.id,
    user,
    JSON.stringify(data),
    data.sourceKey,
  ]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create role supabase_auth_admin; create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`,
  );
  await db.exec(
    await readFile(
      new URL('../../supabase/migrations/202611250001_spendpulse.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.exec(
    await readFile(
      new URL('../../supabase/migrations/202611250002_remove_ai_budget.sql', import.meta.url),
      'utf8',
    ),
  );
  await db.query(
    "insert into auth.users values ($1, 'owner@example.test', now()), ($2, 'other@example.test', now())",
    [ownerId, strangerId],
  );
  await db.exec("insert into private.allowed_owners values ('owner@example.test');");
}, 30000);
afterAll(async () => {
  await db?.close();
});

describe('Postgres authorization and invariants', () => {
  it('allows only the configured owner to create and read records', async () => {
    await asUser(ownerId);
    const entry = transaction();
    await insert(entry);
    expect((await db.query('select id from transactions')).rows).toHaveLength(1);
    await asUser(strangerId);
    expect((await db.query('select id from transactions')).rows).toHaveLength(0);
    await expect(insert(transaction(), strangerId)).rejects.toThrow(/row-level security/);
    await db.exec('reset role; set role anon;');
    await expect(db.query('select * from transactions')).rejects.toThrow(/permission denied/);
  });
  it('rejects invalid splits even when client validation is bypassed', async () => {
    await asUser(ownerId);
    await expect(insert(transaction({ personalSharePaise: 35001 }))).rejects.toThrow(
      /Invalid amount/,
    );
    await expect(insert(transaction({ date: '2026-02-30' }))).rejects.toThrow();
  });
  it('keeps token and AI tables inaccessible to the authenticated browser', async () => {
    await asUser(ownerId);
    for (const table of ['integration_secrets', 'oauth_states', 'ai_usage'])
      await expect(db.query(`select * from ${table}`)).rejects.toThrow(/permission denied/);
  });
  it('imports atomically and ignores repeated source identities', async () => {
    await asUser(ownerId);
    const good = transaction({ sourceKey: 'fixture:sql:one' });
    const bad = transaction({ amountPaise: -1 });
    const rows = [good, bad].map((data) => ({
      id: data.id,
      owner_id: ownerId,
      source_key: data.sourceKey,
      data,
    }));
    await expect(
      db.query('select import_transactions($1)', [JSON.stringify(rows)]),
    ).rejects.toThrow(/Invalid amount/);
    expect(
      (await db.query('select id from transactions where source_key=$1', [good.sourceKey])).rows,
    ).toHaveLength(0);
    await db.query('select import_transactions($1)', [JSON.stringify(rows.slice(0, 1))]);
    await db.query('select import_transactions($1)', [JSON.stringify(rows.slice(0, 1))]);
    expect(
      (await db.query('select id from transactions where source_key=$1', [good.sourceKey])).rows,
    ).toHaveLength(1);
  });
  it('rejects orphan links and protects linked expenses from deletion', async () => {
    await asUser(ownerId);
    await expect(
      insert(transaction({ kind: 'refund', linkedTransactionId: crypto.randomUUID() })),
    ).rejects.toThrow(/Invalid expense link/);
    const bill = transaction();
    await insert(bill);
    await insert(transaction({ kind: 'refund', linkedTransactionId: bill.id }));
    await expect(db.query('delete from transactions where id=$1', [bill.id])).rejects.toThrow(
      /foreign key/,
    );
  });
  it('retires the AI budget reservation RPC and enables AI for new ledgers', async () => {
    await db.exec('reset role; set role service_role;');
    expect(
      (await db.query("select to_regprocedure('public.reserve_ai_budget(uuid,bigint)') as rpc"))
        .rows,
    ).toEqual([{ rpc: null }]);
    expect(emptyData().preferences.aiEnabled).toBe(true);
  });
  it('rejects non-owner signups through the auth hook', async () => {
    await db.exec('reset role; set role supabase_auth_admin;');
    const denied = await db.query<{ result: { error: { http_code: number } } }>(
      'select before_user_created($1) as result',
      [JSON.stringify({ user: { email: 'other@example.test' } })],
    );
    expect(denied.rows[0].result.error.http_code).toBe(403);
    const accepted = await db.query<{ result: Record<string, unknown> }>(
      'select before_user_created($1) as result',
      [JSON.stringify({ user: { email: 'owner@example.test' } })],
    );
    expect(accepted.rows[0].result).toEqual({});
  });
});
