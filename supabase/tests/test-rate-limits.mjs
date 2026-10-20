import { createDb } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { t, rejects, eq, ok, section, summary } from './kit.mjs'

const { db } = await createDb()
await applyMigrations(db, (process.env.MIGRATIONS ? `${process.env.MIGRATIONS},` : '').concat('20261020100000_api_rate_limits.sql').split(',').filter((v, i, a) => a.indexOf(v) === i))

const hit = async (bucket, max, secs) => (await db.query(`select public.rate_limit_hit($1, $2, $3) r`, [bucket, max, secs])).rows[0].r

section('API rate limits')
await t('allows up to the limit in a window, then refuses with a retry time', async () => {
  for (let i = 0; i < 3; i += 1) eq((await hit('/api/x|1.2.3.4', 3, 600)).allowed, true, `hit ${i + 1}`)
  const r = await hit('/api/x|1.2.3.4', 3, 600)
  eq(r.allowed, false, '4th refused')
  ok(r.retry_after >= 1 && r.retry_after <= 600, `retry_after ${r.retry_after}`)
})
await t('each IP and route has its own counter', async () => {
  eq((await hit('/api/x|5.6.7.8', 3, 600)).allowed, true, 'other IP')
  eq((await hit('/api/y|1.2.3.4', 3, 600)).allowed, true, 'other route')
})
await t('only the server can call it', async () => {
  await db.exec(`set role authenticated;`)
  try {
    await rejects(() => db.query(`select public.rate_limit_hit('a', 1, 60)`), /permission denied/)
    await rejects(() => db.query(`select * from public.rate_limit_hits`), /permission denied/)
  } finally {
    await db.exec(`reset role;`)
  }
})

process.exit(summary() ? 1 : 0)
