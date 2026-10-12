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
await db.exec(fs.readFileSync(path.join(dir, '20261012140000_install_payment_remote_signoff.sql'), 'utf8'))
await db.exec(fs.readFileSync(path.join(dir, '20261012160000_accounting_service_summary_reminder.sql'), 'utf8'))

const TECH = 'e0000000-0000-0000-0000-000000000081'
await db.exec(`
  insert into auth.users (id, email) values ('${TECH}', 'tech@pkc.test');
  insert into public.tenant_users (user_id, tenant_id, role) values ('${TECH}', '${ID.tenant}', 'technician');
  create table if not exists public.client_site_photos (id uuid primary key default gen_random_uuid(), client_id uuid, created_at timestamptz default now());
  alter table public.client_site_photos add column if not exists photo_type text, add column if not exists storage_path text, add column if not exists caption text, add column if not exists uploaded_by text;
`)

const q = async (s, p) => (await db.query(s, p)).rows
const one = async (s, p) => (await q(s, p))[0]
const call = (user, s, p) => asUser(db, user, () => db.query(s, p)).then((r) => r.rows)

section('1. Service summary for accounting')
await db.query(`insert into public.client_site_photos (client_id, photo_type, storage_path) values ($1, 'house', 'a'), ($1, 'house', 'b'), ($1, 'post', 'c')`, [ID.c1])
await db.query(`insert into public.repair_records (client_id, status, problem_description, job_type, completed_at) values ($1, 'Completed', 'old', 'repair', now()), ($1, 'Pending', 'open one', 'repair', null)`, [ID.c1])
await t('accounting sees the counts, read-only', async () => {
  const s = (await call(ID.acc, `select * from public.account_service_summary($1)`, [ID.c1]))[0]
  eq(s.house_photos, 2)
  eq(s.post_photos, 1)
  eq(s.installation_photos, 0)
  eq(s.open_jobs, 1)
  eq(s.repairs_done, 1)
})
await t('technicians, customers and other companies are refused', async () => {
  await rejects(() => call(TECH, `select * from public.account_service_summary($1)`, [ID.c1]), /Only accounting or admin/)
  await rejects(() => call(ID.u1, `select * from public.account_service_summary($1)`, [ID.c1]), /Only accounting or admin/)
  await rejects(() => call(ID.acc2, `select * from public.account_service_summary($1)`, [ID.c1]), /Only accounting or admin/)
})

section('2. Remind customer')
await t('accounting reminds a customer: a notice is sent and logged', async () => {
  await call(ID.acc, `select public.remind_customer($1, 'Your bill is due soon')`, [ID.c1])
  if (!/Your bill is due soon/.test(JSON.stringify((await q(`select body from net.sent`)).map((r) => r.body)))) throw new Error('no notice sent')
  eq((await q(`select 1 from public.audit_log where client_id = $1 and field_name = 'customer_reminder'`, [ID.c1])).length, 1)
})
await t('a second reminder within the hour is refused', async () => {
  await rejects(() => call(ID.acc, `select public.remind_customer($1, 'again')`, [ID.c1]), /already reminded/)
})
await t('empty, too long, other company and technician are refused', async () => {
  await rejects(() => call(ID.acc, `select public.remind_customer($1, '   ')`, [ID.c3]), /Write a reminder/)
  await rejects(() => call(ID.acc, `select public.remind_customer($1, $2)`, [ID.c3, 'x'.repeat(301)]), /under 300/)
  await rejects(() => call(ID.acc2, `select public.remind_customer($1, 'hi')`, [ID.c3]), /Only accounting or admin/)
  await rejects(() => call(TECH, `select public.remind_customer($1, 'hi')`, [ID.c3]), /Only accounting or admin/)
})
await t('a customer who never opened the app cannot be notified', async () => {
  await db.query(`update public.clients set user_id = null where id = $1`, [ID.c3])
  await rejects(() => call(ID.acc, `select public.remind_customer($1, 'hi')`, [ID.c3]), /not signed in to the app/)
})

summary()
