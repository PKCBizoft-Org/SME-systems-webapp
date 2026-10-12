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
await db.exec(fs.readFileSync(path.join(dir, '20261012180000_accounting_repair_costs_technician.sql'), 'utf8'))

const TECH = 'e0000000-0000-0000-0000-000000000081'
await db.exec(`
  insert into auth.users (id, email) values ('${TECH}', 'tech@pkc.test');
  insert into public.tenant_users (user_id, tenant_id, role) values ('${TECH}', '${ID.tenant}', 'technician');
  drop table if exists public.inventory_movements cascade;
  drop table if exists public.truck_stock_log cascade;
  drop table if exists public.inventory_items cascade;
  create table public.inventory_items (id uuid primary key default gen_random_uuid(), tenant_id uuid, name text, unit text, unit_cost numeric);
  create table public.truck_stock_log (id uuid primary key default gen_random_uuid(), tenant_id uuid, user_id uuid, item_id uuid, change numeric, kind text, client_id uuid, repair_id uuid, created_by uuid, created_at timestamptz default now());
  create table public.inventory_movements (id uuid primary key default gen_random_uuid(), tenant_id uuid, item_id uuid, movement_type text, quantity_change numeric, client_id uuid, reference text, notes text, job_type text, created_at timestamptz default now());
  insert into public.user_profiles (user_id, full_name) values ('${TECH}', 'Mernas Tech');
`)

const q = async (s, p) => (await db.query(s, p)).rows
const one = async (s, p) => (await q(s, p))[0]
const call = (user, s, p) => asUser(db, user, () => db.query(s, p)).then((r) => r.rows)

section('1. Technician and repair costs for accounting')
const repairId = (await one(`insert into public.repair_records (client_id, status, problem_description, job_type, technician_user_id) values ($1, 'In Progress', 'No internet', 'repair', $2) returning id`, [ID.c1, TECH])).id
const cable = (await one(`insert into public.inventory_items (tenant_id, name, unit, unit_cost) values ($1, 'Drop cable', 'm', 12.5) returning id`, [ID.tenant])).id
const conn = (await one(`insert into public.inventory_items (tenant_id, name, unit, unit_cost) values ($1, 'Connector', 'pc', 20) returning id`, [ID.tenant])).id
await db.query(`insert into public.truck_stock_log (tenant_id, user_id, item_id, change, kind, client_id, repair_id) values ($1, $2, $3, -10, 'use', $4, $5), ($1, $2, $6, -2, 'use', $4, $5)`, [ID.tenant, TECH, cable, ID.c1, repairId, conn])
await db.query(`insert into public.inventory_movements (tenant_id, item_id, movement_type, quantity_change, client_id, job_type) values ($1, $2, 'installation_use', -4, $3, 'installation'), ($1, $2, 'return', 1, $3, 'installation')`, [ID.tenant, conn, ID.c1])
await t('accounting sees who is on the job', async () => {
  eq((await call(ID.acc, `select public.account_technician($1) n`, [ID.c1]))[0].n, 'Mernas Tech')
})
await t('repair costs add up truck use and office issues, returns count back', async () => {
  const rows = await call(ID.acc, `select * from public.account_repair_costs($1)`, [ID.c1])
  const total = rows.reduce((sum, r) => sum + Number(r.line_cost), 0)
  eq(total, 10 * 12.5 + 2 * 20 + 4 * 20 - 1 * 20)
  eq(rows.filter((r) => r.source === 'truck').length, 2)
})
await t('technicians, customers and other companies are refused', async () => {
  for (const who of [TECH, ID.u1, ID.acc2]) {
    await rejects(() => call(who, `select * from public.account_repair_costs($1)`, [ID.c1]), /Only accounting or admin/)
    await rejects(() => call(who, `select public.account_technician($1)`, [ID.c1]), /Only accounting or admin/)
  }
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
