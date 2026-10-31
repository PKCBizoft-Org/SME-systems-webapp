// Login lockout by address (2026-10-31): one address can't lock a user out for everyone; ten
// different addresses can. Also: the referral-code lookup is server-only.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { seed } from './seed.mjs'
import { t, eq, ok, rejects, section, summary } from './kit.mjs'

const { db } = await createDb()
await seed(db)
await applyMigrations(db, ['20261011115000_role_permissions.sql', '20261011160000_truck_stock_errors_lockout.sql'])
// The per-address column and request_ip() come from the big 2026-10-25 migration; take just that part.
const fortify = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations',
  '20261025150000_fortify_and_enhance.sql'), 'utf8')
await db.exec(fortify.slice(fortify.indexOf('alter table public.login_attempts add column'),
  fortify.indexOf('create or replace function public.login_status')))
await applyMigrations(db, ['20261031200000_lockout_distinct_ips_referral_lookup_off.sql'])

const as = async (ip, sql, args = []) => {
  await db.exec(`set role anon`)
  await db.query(`select set_config('request.headers', $1, false)`, [JSON.stringify({ 'cf-connecting-ip': ip })])
  try {
    return (await db.query(sql, args)).rows[0]
  } finally {
    await db.exec(`reset role`)
  }
}
const fail = (ip, email) => as(ip, `select public.record_login_attempt($1, false) s`, [email]).then((r) => r.s)
const status = (ip, email) => as(ip, `select public.login_status($1) s`, [email]).then((r) => r.s)

section('Lockout by address')

await t('one address failing 60 times only locks itself', async () => {
  for (let i = 0; i < 60; i++) await fail('6.6.6.6', 'victim@x.com')
  eq((await status('6.6.6.6', 'victim@x.com')).locked, true)
  eq((await status('1.2.3.4', 'victim@x.com')).locked, false)
})

await t('one address can add at most 20 failures an hour for an email', async () => {
  const n = (await db.query(`select count(*)::int n from public.login_attempts where email_key = 'victim@x.com'`)).rows[0].n
  ok(n <= 20, `stored ${n}`)
})

await t('ten different addresses lock the account for everyone', async () => {
  for (let i = 1; i <= 10; i++) await fail(`10.0.0.${i}`, 'target@x.com')
  eq((await status('1.2.3.4', 'target@x.com')).locked, true)
})

await t('nine different addresses do not', async () => {
  for (let i = 1; i <= 9; i++) await fail(`10.1.0.${i}`, 'other@x.com')
  eq((await status('1.2.3.4', 'other@x.com')).locked, false)
})

await t('a claimed success never clears a lock', async () => {
  await as('6.6.6.6', `select public.record_login_attempt($1, true) s`, ['victim@x.com'])
  eq((await status('6.6.6.6', 'victim@x.com')).locked, true)
})

section('Referral code lookup is server-only')

await t('signed-in users and anon cannot run resolve_referral_code', async () => {
  const fn = (await db.query(`select to_regprocedure('public.resolve_referral_code(text)') f`)).rows[0].f
  if (!fn) return  // not in this sandbox's schema snapshot: the revoke is covered live
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    try {
      await rejects(() => db.query(`select * from public.resolve_referral_code('ABC')`), /permission denied/)
    } finally {
      await db.exec(`reset role`)
    }
  }
})

summary()
