import { createDb, asUser } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { ID, seed } from './seed.mjs'
import { t, rejects, eq, ok, section, summary } from './kit.mjs'

const { db } = await createDb()
// The snapshot only has a stub of the crew table; use the real columns.
await db.exec(`
  drop table public.repair_job_crew cascade;
  create table public.repair_job_crew (id uuid primary key default gen_random_uuid(), repair_id uuid, user_id uuid, status text, added_by uuid);
`)
await db.exec(`create table if not exists public.user_profiles (user_id uuid primary key, full_name text, mobile_number text)`)
await db.exec(`create table if not exists public.user_audit (id uuid primary key default gen_random_uuid(), tenant_id uuid, actor_id uuid, actor_email text, target_user_id uuid, target_email text, action text, detail text, created_at timestamptz default now())`)
await applyMigrations(db, ['20261011115000_role_permissions.sql', '20261011120000_ticket_chat.sql'])
await seed(db)

const TECH = 'e0000000-0000-0000-0000-000000000021'
const CREW = 'e0000000-0000-0000-0000-000000000022'
const OTHER_TECH = 'e0000000-0000-0000-0000-000000000023'
await db.exec(`
  insert into auth.users (id, email) values
    ('${TECH}', 'tech@pkc.test'), ('${CREW}', 'crew@pkc.test'), ('${OTHER_TECH}', 'other@pkc.test');
  insert into public.tenant_users (user_id, tenant_id, role) values
    ('${TECH}', '${ID.tenant}', 'technician'), ('${CREW}', '${ID.tenant}', 'technician'), ('${OTHER_TECH}', '${ID.tenant}', 'technician');
`)

await db.exec(`insert into public.user_profiles (user_id, full_name) values
  ('${TECH}', 'Tony Tech'), ('${CREW}', 'Cora Crew'), ('${ID.acc}', 'Alma Accounting')`)

const one = async (sql, params) => (await db.query(sql, params)).rows[0]
const q = async (sql, params) => (await db.query(sql, params)).rows

// u1's ticket, with a job assigned to TECH and CREW on the crew; u3 has their own ticket.
const REQ = (await one(`insert into public.service_requests (user_id, client_id, request_type, issue_type, description, status)
  values ('${ID.u1}', '${ID.c1}', 'repair', 'No Internet Connection', 'no internet since morning', 'Pending') returning id`)).id
const REQ3 = (await one(`insert into public.service_requests (user_id, client_id, request_type, issue_type, description, status)
  values ('${ID.u3}', '${ID.c3}', 'repair', 'Slow Internet', 'slow at night', 'Pending') returning id`)).id
// Filing a repair request opens its job automatically; hand that job to TECH.
const JOB = (await one(`update public.repair_records set technician_user_id = '${TECH}', status = 'Assigned'
  where service_request_id = '${REQ}' returning id`)).id
await db.exec(`insert into public.repair_job_crew (repair_id, user_id, status) values
  ('${JOB}', '${CREW}', 'accepted'), ('${JOB}', '${OTHER_TECH}', 'pending')`)

const send = (user, req, body) =>
  asUser(db, user, () => db.query(`select public.send_ticket_message($1, $2) id`, [req, body])).then((r) => r.rows[0].id)
const read = (user, req) => asUser(db, user, () => db.query(`select * from public.ticket_messages where request_id = $1 order by created_at, id`, [req])).then((r) => r.rows)
const pushes = async () => (await q(`select body from net.sent order by id`)).map((r) => JSON.stringify(r.body))

section('1. Who is on the ticket')
const role = (user, req) => asUser(db, user, () => db.query(`select public.ticket_role($1) r`, [req])).then((r) => r.rows[0].r)
await t('the customer, the job technician, an accepted crew member and staff are in', async () => {
  eq(await role(ID.u1, REQ), 'customer')
  eq(await role(TECH, REQ), 'technician')
  eq(await role(CREW, REQ), 'technician')
  eq(await role(ID.acc, REQ), 'staff')
})
await t('everyone else is out: other customers, a crew invite not accepted, other tenants', async () => {
  eq(await role(ID.u3, REQ), null)
  eq(await role(OTHER_TECH, REQ), null)
  eq(await role(ID.acc2, REQ), null)
})
await t('a technician with no job on a ticket is out of it', async () => eq(await role(TECH, REQ3), null))

section('2. Sending')
await t('a customer message is stored with their role and name', async () => {
  await send(ID.u1, REQ, '  My internet is still down  ')
  const [m] = await read(ID.u1, REQ)
  eq(m.body, 'My internet is still down')
  eq(m.sender_role, 'customer')
  eq(m.sender_name, 'Active Customer')
})
await t('the technician is notified of a customer message', async () => {
  const p = await pushes()
  ok(p.some((x) => x.includes(TECH) && x.includes('New message from')), 'technician push sent')
})
await t('replies from technician and staff reach the customer and are pushed to them', async () => {
  await send(TECH, REQ, 'On my way, 30 minutes')
  await send(ID.acc, REQ, 'We also see an outage in your area')
  const roles = (await read(ID.u1, REQ)).map((m) => m.sender_role)
  eq(roles.join(','), 'customer,technician,staff')
  const p = await pushes()
  ok(p.filter((x) => x.includes(ID.u1)).length >= 2, 'customer notified twice')
})
await t('a crew member can join in', async () => {
  await send(CREW, REQ, 'I am helping with this one')
  eq((await read(ID.u1, REQ)).length, 4)
})

await t('support access follows the permissions editor', async () => {
  const ADMIN = 'e0000000-0000-0000-0000-000000000031'
  await db.exec(`insert into auth.users (id, email) values ('${ADMIN}', 'admin@pkc.test');
    insert into public.tenant_users (user_id, tenant_id, role) values ('${ADMIN}', '${ID.tenant}', 'admin')`)
  await asUser(db, ADMIN, () => db.query(`select public.set_role_permission('accounting', 'tickets', false)`))
  eq(await role(ID.acc, REQ), null)
  await rejects(() => send(ID.acc, REQ, 'still here?'), /not part of this conversation/)
  eq(await role(ADMIN, REQ), 'staff')
  await asUser(db, ADMIN, () => db.query(`select public.set_role_permission('accounting', 'tickets', true)`))
  eq(await role(ID.acc, REQ), 'staff')
})

section('3. Privacy')
await t('people outside the ticket cannot read it', async () => {
  eq((await read(ID.u3, REQ)).length, 0)
  eq((await read(OTHER_TECH, REQ)).length, 0)
  eq((await read(ID.acc2, REQ)).length, 0)
})
await t('people outside the ticket cannot post to it', async () => {
  await rejects(() => send(ID.u3, REQ, 'hello'), /not part of this conversation/)
  await rejects(() => send(OTHER_TECH, REQ, 'hello'), /not part of this conversation/)
})
await t('nobody can write, edit or delete messages directly', async () => {
  await rejects(
    () => asUser(db, ID.u1, () => db.query(`insert into public.ticket_messages (request_id, sender_user_id, sender_role, body) values ($1, $2, 'staff', 'fake')`, [REQ, ID.u1])),
    /permission denied/,
  )
  await rejects(() => asUser(db, ID.u1, () => db.query(`update public.ticket_messages set body = 'edited'`)), /permission denied/)
  await rejects(() => asUser(db, ID.u1, () => db.query(`delete from public.ticket_messages`)), /permission denied/)
})

section('4. Rules')
await t('empty and over-long messages are refused', async () => {
  await rejects(() => send(ID.u1, REQ, '   '), /Type a message/)
  await rejects(() => send(ID.u1, REQ, 'x'.repeat(1001)), /under 1000 characters/)
})
await t('bursts are limited to 30 messages in 10 minutes', async () => {
  for (let i = 0; i < 29; i++) await send(ID.u1, REQ, `spam ${i}`)
  await rejects(() => send(ID.u1, REQ, 'one too many'), /very fast/)
})
await t('a cancelled request closes the chat', async () => {
  await db.query(`update public.service_requests set status = 'Cancelled' where id = $1`, [REQ3])
  await rejects(() => send(ID.u3, REQ3, 'hello?'), /cancelled/)
})
await t('you must be signed in, and anonymous callers cannot run it', async () => {
  await rejects(async () => {
    await db.query(`select set_config('request.jwt.claims', '', false)`)
    await db.query(`select public.send_ticket_message($1, 'hi')`, [REQ])
  }, /signed in/)
  await db.exec(`set role anon`)
  try {
    await rejects(() => db.query(`select public.send_ticket_message($1, 'hi')`, [REQ]), /permission denied/)
  } finally {
    await db.exec(`reset role`)
  }
})

summary()
