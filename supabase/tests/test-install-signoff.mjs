import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDb, asUser } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { seed, ID } from './seed.mjs'
import { t, rejects, eq, section, summary } from './kit.mjs'

const { db } = await createDb()
await db.exec(`
  drop table if exists public.repair_job_crew cascade;
  create table public.repair_job_crew (id uuid primary key default gen_random_uuid(), repair_id uuid, user_id uuid, status text, added_by uuid);
  drop table if exists public.ratings cascade;
  create table if not exists public.user_profiles (user_id uuid primary key, full_name text, mobile_number text);
  create table if not exists public.user_audit (id uuid primary key default gen_random_uuid(), tenant_id uuid, actor_id uuid, actor_email text, target_user_id uuid, target_email text, action text, detail text, created_at timestamptz default now());
  create table if not exists public.technician_locations (user_id uuid primary key, latitude double precision, longitude double precision, updated_at timestamptz default now());
`)
await applyMigrations(db, [
  '20261009220000_bill_payments.sql',
  '20261011100000_technician_stats.sql',
  '20261011110000_install_checklist_modem_serial.sql',
  '20261011115000_role_permissions.sql',
  '20261011150000_outages_arrival_history_dispatch.sql',
])
await seed(db)

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
// The realtime publication does not exist in the sandbox: apply the rest.
await db.exec(fs.readFileSync(path.join(dir, '20261012120000_pending_payment_notice_realtime.sql'), 'utf8').replace(/do \$\$[\s\S]*?end \$\$;/i, ''))
await db.exec(fs.readFileSync(path.join(dir, '20261012140000_install_payment_remote_signoff.sql'), 'utf8'))

const TECH = 'e0000000-0000-0000-0000-000000000071'
await db.exec(`
  insert into auth.users (id, email) values ('${TECH}', 'tech@pkc.test');
  insert into public.tenant_users (user_id, tenant_id, role) values ('${TECH}', '${ID.tenant}', 'technician');
  insert into public.user_profiles (user_id, full_name) values ('${TECH}', 'Tina Tech');
  -- The sandbox snapshot predates the photo columns the app uses.
  create table if not exists public.repair_photos (id uuid primary key default gen_random_uuid(), repair_id uuid, created_at timestamptz default now());
  alter table public.repair_photos add column if not exists photo_type text, add column if not exists storage_path text;
`)

const q = async (s, p) => (await db.query(s, p)).rows
const one = async (s, p) => (await q(s, p))[0]
const call = (user, s, p) => asUser(db, user, () => db.query(s, p)).then((r) => r.rows)
const sentText = async () => (await q(`select body from net.sent`)).map((r) => JSON.stringify(r.body)).join(' ')

section('1. A new customer pays the plan and the installation fee')
const proof = (user, client) => `${user}/${client}/p.jpg`
const apply = (user, client, plan, amount, ref) =>
  call(user, `select public.submit_plan_purchase($1, $2, $3, 'Manual', 'GCash', $4, null, null, null, '09170000002', null, $5, null) id`, [client, plan, amount, ref, proof(user, client)])
await t('the plan price alone is refused for a new customer', async () => {
  await rejects(() => apply(ID.u2, ID.c2, 'G1_P750', 750, 'GC-NEW-1'), /does not match the selected plan/)
})
await t('plan + 750 is accepted and recorded as the amount to verify', async () => {
  const id = (await apply(ID.u2, ID.c2, 'G1_P750', 1500, 'GC-NEW-2'))[0].id
  eq(Number((await one(`select requested_amount from public.service_requests where id = $1`, [id])).requested_amount), 1500)
  eq(Number((await one(`select amount_claimed from public.payment_submissions where service_request_id = $1`, [id])).amount_claimed), 1500)
})
await t('an active customer still pays only the plan price', async () => {
  const id = (await apply(ID.u3, ID.c3, 'G1_P1000', 1000, 'GC-ACT-1'))[0].id
  eq(Number((await one(`select requested_amount from public.service_requests where id = $1`, [id])).requested_amount), 1000)
})

section('2. The customer is told the request reached the technicians')
const SR = (await one(`select id from public.service_requests where client_id = $1 order by created_at desc limit 1`, [ID.c2])).id
const job = (await one(`insert into public.repair_records (client_id, status, problem_description, job_type, service_request_id) values ($1, 'Pending', 'New installation', 'installation', $2) returning id`, [ID.c2, SR])).id
await t('a new installation job sends a notice', async () => {
  if (!/Request sent to the technicians/.test(await sentText())) throw new Error('no notice for the customer')
})

section('3. Customer not at home: sign in the app')
await db.query(`update public.repair_records set technician_user_id = $1, status = 'In Progress' where id = $2`, [TECH, job])
await t('the after photo is required first', async () => {
  await rejects(() => call(TECH, `select public.request_customer_signature($1, 'Done', null)`, [job]), /after photo/)
})
await db.query(`insert into public.repair_photos (repair_id, photo_type, storage_path) values ($1, 'after', 'jobs/x/after.jpg')`, [job])
await t('only the technician who took the job can ask', async () => {
  await rejects(() => call(ID.acc, `select public.request_customer_signature($1, 'Done', null)`, [job]), /Only the technician/)
})
await t('asking puts the job on hold, keeps the account inactive and notifies the customer', async () => {
  await call(TECH, `select public.request_customer_signature($1, 'Router installed', null)`, [job])
  const j = await one(`select status, resolution, signature_requested_at from public.repair_records where id = $1`, [job])
  eq(j.status, 'Awaiting signature')
  eq(j.resolution, 'Router installed')
  if (!j.signature_requested_at) throw new Error('request time not saved')
  eq((await one(`select account_status from public.clients where id = $1`, [ID.c2])).account_status, 'Inactive')
  if (!/Please sign off your installation/.test(await sentText())) throw new Error('no sign-off notice')
})
const file = `jobs/${ID.c2}/${job}/signature-1.json`
await t('another customer cannot upload a signature file for this job', async () => {
  await rejects(
    () => asUser(db, ID.u1, () => db.query(`insert into storage.objects (bucket_id, name) values ('client-media', $1)`, [file])),
    /row-level security|policy/,
  )
})
await t('the customer can upload their signature while the job waits for it', async () => {
  await asUser(db, ID.u2, () => db.query(`insert into storage.objects (bucket_id, name) values ('client-media', $1)`, [file]))
})
await t('somebody else cannot sign, nor use another job\'s file', async () => {
  await rejects(() => call(ID.u1, `select public.sign_off_job($1, $2)`, [job, file]), /not on your account/)
  await rejects(() => call(ID.u2, `select public.sign_off_job($1, $2)`, [job, `jobs/${ID.c2}/other/signature-1.json`]), /does not belong/)
})
await t('signing finishes the job and switches the account on', async () => {
  await call(ID.u2, `select public.sign_off_job($1, $2)`, [job, file])
  const j = await one(`select status, customer_signed_at from public.repair_records where id = $1`, [job])
  eq(j.status, 'Completed')
  if (!j.customer_signed_at) throw new Error('signed time missing')
  const c = await one(`select account_status, installation_status from public.clients where id = $1`, [ID.c2])
  eq(c.account_status, 'Active')
  eq(c.installation_status, 'Installed')
  eq((await q(`select 1 from public.repair_photos where repair_id = $1 and photo_type = 'signature'`, [job])).length, 1)
})
await t('it cannot be signed twice', async () => {
  await rejects(() => call(ID.u2, `select public.sign_off_job($1, $2)`, [job, file]), /not waiting/)
})
await t('the technician can take the request back', async () => {
  const j2 = (await one(`insert into public.repair_records (client_id, status, problem_description, job_type, technician_user_id) values ($1, 'In Progress', 'x', 'repair', $2) returning id`, [ID.c1, TECH])).id
  await db.query(`insert into public.repair_photos (repair_id, photo_type, storage_path) values ($1, 'after', 'jobs/x/a.jpg')`, [j2])
  await call(TECH, `select public.request_customer_signature($1, null, null)`, [j2])
  await call(TECH, `select public.cancel_signature_request($1)`, [j2])
  eq((await one(`select status from public.repair_records where id = $1`, [j2])).status, 'In Progress')
  await rejects(() => call(TECH, `select public.cancel_signature_request($1)`, [j2]), /not waiting/)
})

summary()
