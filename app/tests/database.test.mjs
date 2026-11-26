import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('migrations retain existing profiles, create signup profiles, and isolate browser roles', async () => {
  const db = new PGlite()
  const alice = '00000000-0000-0000-0000-000000000001'
  const bob = '00000000-0000-0000-0000-000000000002'
  const apply = async path => db.exec(await readFile(new URL('../../database/' + path, import.meta.url), 'utf8'))
  try {
    await db.exec(`create schema auth;
      create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
      create function auth.uid() returns uuid language sql as 'select current_setting(''test.uid'')::uuid';
      create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema auth to authenticated;
      alter default privileges in schema public grant all on tables to anon, authenticated;
    `)
    await apply('schema/users.sql')
    await apply('schema/plaid_tokens.sql')
    await db.query('insert into auth.users values ($1, $2)', [alice, { name: 'old metadata' }])
    await db.query('insert into public.users(id, name) values ($1, $2)', [alice, 'existing profile'])
    await apply('migrations/202611220001_secure_plaid_tokens.sql')
    await apply('migrations/202611250001_transaction_sync.sql')
    await apply('migrations/202611260001_secure_signup_profiles.sql')
    await apply('migrations/202611260002_finance_planning.sql')
    await db.query('insert into auth.users values ($1, $2)', [bob, { name: 'Bob' }])
    await db.query('insert into public.plaid_tokens(id,token) values ($1,$3),($2,$3)', [alice,bob,'fixture'])
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await db.query("select set_config('test.uid',$1,false)", [bob])
      for (const owner of [alice,bob]) {
        await assert.rejects(db.query('select token from plaid_tokens where id=$1',[owner]), { code: '42501' })
        await assert.rejects(db.query("update plaid_tokens set token='example' where id=$1",[owner]), { code: '42501' })
      }
      for (const table of ['finance_plans','finance_snapshots','finance_events']) {
        await assert.rejects(db.query('select * from '+table), { code: '42501' })
      }
      if (role === 'anon') {
        await assert.rejects(db.exec('select * from public.users'), { code: '42501' })
      } else {
        assert.deepEqual((await db.query('select name from public.users')).rows, [{ name: 'Bob' }])
        assert.equal((await db.query("update public.users set name='Changed' where id=$1 returning id",[alice])).rows.length, 0)
      }
      await db.exec('reset role')
    }
    assert.equal((await db.query('select name from public.users where id=$1',[alice])).rows[0].name, 'existing profile')
  } finally {
    await db.close()
  }
})
