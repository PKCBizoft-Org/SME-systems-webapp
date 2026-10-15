import { createDb, asUser } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { ID, seed } from './seed.mjs'
import { t, rejects, eq, section, summary } from './kit.mjs'

const { db } = await createDb()
await db.exec(`
  drop table public.ratings cascade;
  create table if not exists public.user_profiles (user_id uuid primary key, full_name text, mobile_number text);
`)
await applyMigrations(db, ['20261008140000_ratings.sql', '20261015120000_service_rating_once.sql'])
await seed(db)

const q = async (sql, params) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]
const as = (user, sql, params) => asUser(db, user, () => db.query(sql, params))

section('Overall service rating: once, changed only through change_my_service_rating')
await t('the first overall rating is saved', async () => {
  await as(ID.u1, `select public.submit_rating('service', null, 4, 'good')`)
  eq((await one(`select stars from public.ratings where user_id = $1`, [ID.u1])).stars, 4)
})
await t('a second overall rating is refused and points to the help bot', () =>
  rejects(() => as(ID.u1, `select public.submit_rating('service', null, 5, null)`), /ask the help bot/))
await t('even a rating from long ago still blocks a new one', async () => {
  await db.exec(`update public.ratings set created_at = now() - interval '90 days'`)
  await rejects(() => as(ID.u1, `select public.submit_rating('service', null, 5, null)`), /already rated our service/)
})
await t('the bot flow can change it, and there is still exactly one row', async () => {
  await as(ID.u1, `select public.change_my_service_rating(2, 'slow lately')`)
  const row = await one(`select stars, comment from public.ratings where user_id = $1`, [ID.u1])
  eq(row.stars, 2)
  eq(row.comment, 'slow lately')
  eq((await one(`select count(*)::int n from public.ratings where user_id = $1`, [ID.u1])).n, 1)
})
await t('cannot change a rating that was never given, or use a bad star value', async () => {
  await rejects(() => as(ID.u3, `select public.change_my_service_rating(3, null)`), /not rated our service yet/)
  await rejects(() => as(ID.u1, `select public.change_my_service_rating(9, null)`), /1 to 5 stars/)
})

process.exit(summary() ? 1 : 0)
