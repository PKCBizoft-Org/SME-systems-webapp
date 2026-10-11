import { createDb, asUser } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { ID, seed } from './seed.mjs'
import { t, rejects, eq, ok, section, summary } from './kit.mjs'

const { db } = await createDb()
// The snapshot only has a two-column stub of ratings; use the real table.
await db.exec('drop table if exists public.ratings cascade')
await applyMigrations(db, ['20261008140000_ratings.sql', '20261011100000_technician_stats.sql'])
await seed(db)

const T1 = 'e0000000-0000-0000-0000-000000000001'
const T2 = 'e0000000-0000-0000-0000-000000000002'
await db.exec(`
  insert into auth.users (id, email) values ('${T1}', 't1@pkc.test'), ('${T2}', 't2@pkc.test');
  insert into public.tenant_users (user_id, tenant_id, role) values
    ('${T1}', '${ID.tenant}', 'technician'), ('${T2}', '${ID.tenant}', 'technician');
`)

const q = async (sql, params) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]
const stats = async (user) => (await asUser(db, user, () => db.query(`select public.my_technician_stats() s`))).rows[0].s
const job = async ({ tech = T1, status = 'Assigned', repairDate = 'current_date', accepted = 'null', id } = {}) =>
  (
    await one(
      `insert into public.repair_records (client_id, technician_user_id, status, repair_date, accepted_at, problem_description)
       values ($1, $2, $3, ${repairDate}, ${accepted}, 'test job') returning id`,
      [ID.c1, tech, status],
    )
  ).id

section('1. completed_at is kept by a trigger')
let A
await t('a new open job has no completed_at', async () => {
  A = await job()
  eq((await one(`select completed_at from public.repair_records where id = $1`, [A])).completed_at, null)
})
await t('finishing the job stamps completed_at', async () => {
  await db.query(`update public.repair_records set status = 'Completed' where id = $1`, [A])
  ok((await one(`select completed_at from public.repair_records where id = $1`, [A])).completed_at, 'completed_at set')
})
await t('saving it again does not move the timestamp', async () => {
  const before = (await one(`select completed_at from public.repair_records where id = $1`, [A])).completed_at
  await db.query(`update public.repair_records set status = 'Resolved' where id = $1`, [A])
  const after = (await one(`select completed_at from public.repair_records where id = $1`, [A])).completed_at
  eq(String(after), String(before))
})
await t('reopening the job clears completed_at', async () => {
  await db.query(`update public.repair_records set status = 'Ongoing' where id = $1`, [A])
  eq((await one(`select completed_at from public.repair_records where id = $1`, [A])).completed_at, null)
})
await t('a job created already finished is stamped too', async () => {
  const id = await job({ status: 'Completed', tech: T2 })
  ok((await one(`select completed_at from public.repair_records where id = $1`, [id])).completed_at, 'completed_at set')
  await db.query(`delete from public.repair_records where id = $1`, [id])
})

section('2. my_technician_stats counts only my own jobs')
await db.query(`delete from public.repair_records`)
await t('a technician with no jobs gets zeros and no rating', async () => {
  const s = await stats(T1)
  eq(s.completed_7d, 0)
  eq(s.completed_30d, 0)
  eq(s.completed_total, 0)
  eq(s.active, 0)
  eq(s.avg_hours, null)
  eq(s.avg_stars, null)
  eq(s.rating_count, 0)
})

await t('windows, totals and open jobs add up', async () => {
  await job({ status: 'Completed' }) // today
  await job({ status: 'Completed', repairDate: 'current_date - 10' }) // this month
  await job({ status: 'Completed', repairDate: 'current_date - 45' }) // older
  await job({ status: 'Ongoing' })
  await job({ status: 'Assigned' })
  await job({ status: 'Completed', tech: T2 }) // someone else's
  // Old jobs keep an empty completed_at, so the stats fall back to repair_date.
  await db.query(`update public.repair_records set completed_at = null where repair_date < current_date`)
  const s = await stats(T1)
  eq(s.completed_7d, 1)
  eq(s.completed_30d, 2)
  eq(s.completed_total, 3)
  eq(s.active, 2)
})

await t('the other technician only sees their own job', async () => {
  const s = await stats(T2)
  eq(s.completed_total, 1)
  eq(s.active, 0)
})

section('3. average completion time')
await t('hours between accepting and finishing are averaged', async () => {
  await db.query(`delete from public.repair_records`)
  const a = await job({ status: 'Assigned', accepted: `now() - interval '5 hours'` })
  const b = await job({ status: 'Assigned', accepted: `now() - interval '3 hours'` })
  await job({ status: 'Completed' }) // finished but never accepted: left out of the average
  await db.query(`update public.repair_records set status = 'Completed', completed_at = accepted_at + interval '4 hours' where id = $1`, [a])
  await db.query(`update public.repair_records set status = 'Completed', completed_at = accepted_at + interval '2 hours' where id = $1`, [b])
  const s = await stats(T1)
  eq(Number(s.avg_hours), 3)
})

section('4. ratings')
await t('only my own technician ratings in the last 90 days are averaged', async () => {
  const done = await job({ status: 'Completed' })
  await db.exec(`
    insert into public.ratings (tenant_id, client_id, user_id, kind, repair_record_id, technician_user_id, stars) values
      ('${ID.tenant}', '${ID.c1}', '${ID.u1}', 'technician', '${done}', '${T1}', 5),
      ('${ID.tenant}', '${ID.c3}', '${ID.u3}', 'technician', null, '${T1}', 4),
      ('${ID.tenant}', '${ID.c3}', '${ID.u3}', 'technician', null, '${T2}', 1),
      ('${ID.tenant}', '${ID.c3}', '${ID.u3}', 'service', null, '${T1}', 1);
    insert into public.ratings (tenant_id, client_id, user_id, kind, technician_user_id, stars, created_at)
      values ('${ID.tenant}', '${ID.c2}', '${ID.u2}', 'technician', '${T1}', 1, now() - interval '200 days');
  `)
  const s = await stats(T1)
  eq(Number(s.avg_stars), 4.5)
  eq(s.rating_count, 2)
})

section('5. access')
await t('you must be signed in', () =>
  rejects(async () => {
    await db.query(`select set_config('request.jwt.claims', '', false)`)
    await db.query(`select public.my_technician_stats()`)
  }, /signed in/))
await t('anonymous callers cannot run it', async () => {
  await db.exec(`set role anon`)
  try {
    await rejects(() => db.query(`select public.my_technician_stats()`), /permission denied/)
  } finally {
    await db.exec(`reset role`)
  }
})

summary()
