import { createDb, asUser } from './lib.mjs'
import { seed, ID } from './seed.mjs'
import { applyMigrations } from './migrate.mjs'
import { t, rejects, eq, section, summary } from './kit.mjs'

const { db } = await createDb()
await db.exec(`
  drop table if exists public.repair_job_crew cascade;
  create table public.repair_job_crew (
    repair_id uuid not null, user_id uuid not null, added_by uuid, added_at timestamptz not null default now(),
    status text not null default 'pending', decline_reason text, responded_at timestamptz,
    primary key (repair_id, user_id)
  );
  create table if not exists public.user_profiles (user_id uuid primary key, full_name text, mobile_number text, employee_number text);
`)
await seed(db)
await applyMigrations(db, ['20261012130000_join_requests.sql'])

const LEAD = 'e0000000-0000-0000-0000-000000000071'
const T2 = 'e0000000-0000-0000-0000-000000000072'
const T3 = 'e0000000-0000-0000-0000-000000000073'
const OUTSIDER = 'e0000000-0000-0000-0000-000000000074'
await db.exec(`
  insert into auth.users (id, email) values ('${LEAD}', 'lead@pkc.test'), ('${T2}', 't2@pkc.test'), ('${T3}', 't3@pkc.test'), ('${OUTSIDER}', 'o@pkc.test');
  insert into public.tenant_users (user_id, tenant_id, role) values
    ('${LEAD}', '${ID.tenant}', 'technician'), ('${T2}', '${ID.tenant}', 'technician'),
    ('${T3}', '${ID.tenant}', 'technician'), ('${OUTSIDER}', '${ID.tenant2}', 'technician');
  insert into public.user_profiles (user_id, full_name) values ('${LEAD}', 'Lead Larry'), ('${T2}', 'Tina Two'), ('${T3}', 'Tom Three');
`)

const q = async (s, p) => (await db.query(s, p)).rows
const one = async (s, p) => (await q(s, p))[0]
const call = (user, s, p) => asUser(db, user, () => db.query(s, p)).then((r) => r.rows)
const pushes = async () => (await q(`select body from net.sent order by id`)).map((r) => JSON.stringify(r.body)).join(' ')

const job = (await one(`insert into public.repair_records (client_id, status, problem_description, job_type, technician_user_id) values ($1, 'Assigned', 'No internet', 'repair', $2) returning id`, [ID.c1, LEAD])).id
const open = (await one(`insert into public.repair_records (client_id, status, problem_description, job_type) values ($1, 'Pending', 'Slow', 'repair') returning id`, [ID.c3])).id

section('1. Asking to join')
await t('a free technician asks to join a taken job and the lead is told', async () => {
  await call(T2, `select public.request_to_join_job($1)`, [job])
  eq((await one(`select status from public.repair_join_requests where repair_id = $1 and user_id = $2`, [job, T2])).status, 'pending')
  eq(/wants to join|asks to team up/i.test(await pushes()), true)
  eq((await call(T2, `select public.my_join_request($1) as r`, [job]))[0].r.status, 'pending')
})
await t('asking twice, asking for your own job, or an untaken job is refused', async () => {
  await rejects(() => call(T2, `select public.request_to_join_job($1)`, [job]), /already asked/)
  await rejects(() => call(LEAD, `select public.request_to_join_job($1)`, [job]), /your own job/)
  await rejects(() => call(T3, `select public.request_to_join_job($1)`, [open]), /Nobody has taken/)
})
await t('another company cannot ask, and a busy technician cannot ask', async () => {
  await rejects(() => call(OUTSIDER, `select public.request_to_join_job($1)`, [job]), /not in your company/)
  await db.query(`insert into public.repair_records (client_id, status, problem_description, job_type, technician_user_id) values ($1, 'In Progress', 'Other', 'repair', $2)`, [ID.c3, T3])
  await rejects(() => call(T3, `select public.request_to_join_job($1)`, [job]), /busy/)
})

section('2. The lead answers')
await t('the lead sees the waiting request', async () => {
  const rows = (await call(LEAD, `select public.join_requests_for_me() as r`))[0].r
  eq(rows.length, 1)
  eq(rows[0].name, 'Tina Two')
  eq((await call(T2, `select public.join_requests_for_me() as r`))[0].r.length, 0)
})
await t('only the lead can answer', async () => {
  await rejects(() => call(T2, `select public.respond_join_request($1, $2, true)`, [job, T2]), /Only the technician who took this job/)
  await rejects(() => call(T3, `select public.respond_join_request($1, $2, true)`, [job, T2]), /Only the technician who took this job/)
})
await t('a decline needs a reason, then the requester sees it', async () => {
  await rejects(() => call(LEAD, `select public.respond_join_request($1, $2, false, '')`, [job, T2]), /why/)
  await call(LEAD, `select public.respond_join_request($1, $2, false, 'Job is almost done')`, [job, T2])
  const mine = (await call(T2, `select public.my_join_request($1) as r`, [job]))[0].r
  eq(mine.status, 'declined')
  eq(mine.reason, 'Job is almost done')
  eq(/Job is almost done/.test(await pushes()), true)
  await rejects(() => call(LEAD, `select public.respond_join_request($1, $2, true)`, [job, T2]), /no longer open/)
})
await t('after a decline they can ask again; accepting puts them on the crew', async () => {
  await call(T2, `select public.request_to_join_job($1)`, [job])
  await call(LEAD, `select public.respond_join_request($1, $2, true)`, [job, T2])
  eq((await one(`select status from public.repair_job_crew where repair_id = $1 and user_id = $2`, [job, T2])).status, 'accepted')
  eq((await call(T2, `select public.my_join_request($1) as r`, [job]))[0].r.status, 'accepted')
  const crew = (await call(T2, `select public.job_crew($1) as c`, [job]))[0].c
  eq(crew.length, 2)
})
await t('someone already on the crew cannot ask again', async () => {
  await rejects(() => call(T2, `select public.request_to_join_job($1)`, [job]), /already on this job/)
})

section('3. Taking a request back, and a job that changes hands')
await t('a waiting request can be cancelled', async () => {
  await db.query(`delete from public.repair_records where technician_user_id = $1 and status = 'In Progress'`, [T3])
  await call(T3, `select public.request_to_join_job($1)`, [job])
  await call(T3, `select public.cancel_join_request($1)`, [job])
  eq((await call(T3, `select public.my_join_request($1) as r`, [job]))[0].r, null)
  eq((await call(LEAD, `select public.join_requests_for_me() as r`))[0].r.length, 0)
})
await t('a request does not follow the job to a new lead', async () => {
  await call(T3, `select public.request_to_join_job($1)`, [job])
  await db.query(`update public.repair_records set technician_user_id = null where id = $1`, [job])
  await db.query(`update public.repair_records set technician_user_id = $1 where id = $2`, [T2, job])
  eq((await call(T2, `select public.join_requests_for_me() as r`))[0].r.length, 0)
  eq((await call(T3, `select public.my_join_request($1) as r`, [job]))[0].r, null)
})
await t('finished jobs drop out of the lead\'s list', async () => {
  await db.query(`update public.repair_records set technician_user_id = $1 where id = $2`, [LEAD, job])
  // The earlier request counts again now its lead has the job back.
  eq((await call(LEAD, `select public.join_requests_for_me() as r`))[0].r.length, 1)
  await db.query(`update public.repair_records set status = 'Completed' where id = $1`, [job])
  eq((await call(LEAD, `select public.join_requests_for_me() as r`))[0].r.length, 0)
})

summary()
