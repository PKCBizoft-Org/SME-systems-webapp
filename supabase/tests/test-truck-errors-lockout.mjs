import { createDb, asUser } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { ID, seed } from './seed.mjs'
import { t, rejects, eq, ok, section, summary } from './kit.mjs'

const { db } = await createDb()
// The snapshot only has stubs of these; recreate the real inventory tables and triggers.
await db.exec(`
  drop view if exists public.inventory_catalog;
  drop table if exists public.inventory_kit_items cascade;
  drop table if exists public.inventory_movements cascade;
  drop table if exists public.inventory_items cascade;
  drop table if exists public.repair_job_crew cascade;
  drop table if exists public.ratings cascade;
  create table public.inventory_items (
    id uuid primary key default gen_random_uuid(), tenant_id uuid not null, sku text, name text not null, category text, unit text,
    quantity_on_hand numeric not null default 0, reorder_level numeric default 0, unit_cost numeric, location text, notes text,
    is_active boolean not null default true, created_by uuid, created_at timestamptz default now(), updated_at timestamptz default now());
  create table public.inventory_movements (
    id uuid primary key default gen_random_uuid(), tenant_id uuid, item_id uuid not null references public.inventory_items(id),
    movement_type text not null check (movement_type in ('stock_in','installation_use','return','stock_out','adjustment')),
    quantity_change numeric not null check (quantity_change <> 0), client_id uuid, reference text, notes text, created_by uuid,
    created_by_email text, created_at timestamptz default now(), checkout_id uuid, job_type text, install_location text,
    replaced_item_id uuid, created_by_name text);
  create trigger inventory_movements_before_insert_trg before insert on public.inventory_movements
    for each row execute function public.inventory_movements_before_insert();
  create trigger inventory_movements_after_insert_trg after insert on public.inventory_movements
    for each row execute function public.inventory_movements_after_insert();
  alter table public.inventory_items enable row level security;
  alter table public.inventory_movements enable row level security;
  grant all on public.inventory_items, public.inventory_movements to authenticated, service_role;
  create table if not exists public.user_profiles (user_id uuid primary key, full_name text, mobile_number text);
  create table if not exists public.user_audit (id uuid primary key default gen_random_uuid(), tenant_id uuid, actor_id uuid, actor_email text, target_user_id uuid, target_email text, action text, detail text, created_at timestamptz default now());
`)
await applyMigrations(db, ['20261011115000_role_permissions.sql', '20261011160000_truck_stock_errors_lockout.sql'])
await seed(db)

const ADMIN = 'e0000000-0000-0000-0000-000000000061'
const INV = 'e0000000-0000-0000-0000-000000000062'
const T1 = 'e0000000-0000-0000-0000-000000000063'
const T2 = 'e0000000-0000-0000-0000-000000000064'
await db.exec(`
  insert into auth.users (id, email) values ('${ADMIN}', 'admin@pkc.test'), ('${INV}', 'inv@pkc.test'), ('${T1}', 't1@pkc.test'), ('${T2}', 't2@pkc.test');
  insert into public.tenant_users (user_id, tenant_id, role) values
    ('${ADMIN}', '${ID.tenant}', 'admin'), ('${INV}', '${ID.tenant}', 'inventory'), ('${T1}', '${ID.tenant}', 'technician'), ('${T2}', '${ID.tenant}', 'technician');
  insert into public.user_profiles (user_id, full_name) values ('${T1}', 'Tony One'), ('${T2}', 'Tina Two');
`)
const CORD = (await db.query(`insert into public.inventory_items (tenant_id, name, unit, quantity_on_hand) values ('${ID.tenant}', 'Patch cord 3m', 'pcs', 50) returning id`)).rows[0].id
const ONU = (await db.query(`insert into public.inventory_items (tenant_id, name, unit, quantity_on_hand) values ('${ID.tenant}', 'ONU modem', 'pcs', 2) returning id`)).rows[0].id

const q = async (sql, params) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]
const call = (user, sql, params) => asUser(db, user, () => db.query(sql, params)).then((r) => r.rows[0])
const onHand = async (id) => Number((await one(`select quantity_on_hand from public.inventory_items where id = $1`, [id])).quantity_on_hand)
const load = (user, tech, item, qty, min = null) => call(user, `select public.load_truck_stock($1, $2, $3, $4) n`, [tech, item, qty, min]).then((r) => Number(r.n))

section('1. Loading and unloading a truck')
await t('inventory staff load stock: it leaves the central stock and is recorded', async () => {
  eq(await load(INV, T1, CORD, 10, 8), 10)
  eq(await onHand(CORD), 40)
  const m = await one(`select movement_type, quantity_change, notes, created_by_email from public.inventory_movements where reference = 'truck-load'`)
  eq(m.movement_type, 'stock_out')
  eq(Number(m.quantity_change), -10)
  eq(m.notes, 'Loaded to truck: Tony One')
  eq(m.created_by_email, 'inv@pkc.test')
  eq((await one(`select count(*)::int n from public.truck_stock_log where kind = 'load'`)).n, 1)
})
await t('loading again adds to what is on the truck', async () => {
  eq(await load(ADMIN, T1, CORD, 5), 15)
  eq(await onHand(CORD), 35)
})
await t('technicians cannot load a truck, targets must be technicians, amounts must be sensible', async () => {
  await rejects(() => load(T1, T1, CORD, 1), /Only inventory staff/)
  await rejects(() => load(ID.u1, T1, CORD, 1), /Only inventory staff/)
  await rejects(() => load(INV, ID.acc, CORD, 1), /not a technician/)
  await rejects(() => load(INV, T1, CORD, 0), /quantity above 0/)
  await rejects(() => load(INV, T1, CORD, -3), /quantity above 0/)
  await rejects(() => load(INV, T1, CORD, 1, -1), /not valid/)
})
await t('there must be enough in the central stock', async () => {
  await rejects(() => load(INV, T1, ONU, 5), /Insufficient stock/)
  eq(await onHand(ONU), 2)
  eq((await q(`select * from public.truck_stock where item_id = $1`, [ONU])).length, 0)
})
await t('unloading returns stock to the centre, but never more than is on the truck', async () => {
  eq(Number((await call(INV, `select public.unload_truck_stock($1, $2, 3) n`, [T1, CORD])).n), 12)
  eq(await onHand(CORD), 38)
  await rejects(() => call(INV, `select public.unload_truck_stock($1, $2, 99)`, [T1, CORD]), /Only 12 are on the truck/)
  await rejects(() => call(T1, `select public.unload_truck_stock($1, $2, 1)`, [T1, CORD]), /Only inventory staff/)
  await rejects(() => call(INV, `select public.unload_truck_stock($1, $2, 1)`, [T2, CORD]), /none of this item/)
})

section('2. Using truck stock on a job')
await t('a technician uses stock on a customer job; the truck drops, the centre does not', async () => {
  const r = (await call(T1, `select public.use_truck_stock($1, 2, $2) r`, [CORD, ID.c1])).r
  eq(Number(r.quantity), 10)
  eq(r.low, false)
  eq(await onHand(CORD), 38)
  const log = await one(`select change, kind, client_id from public.truck_stock_log where kind = 'use'`)
  eq(Number(log.change), -2)
  eq(log.client_id, ID.c1)
})
await t('the low-stock warning appears at or below the level set when loading', async () => {
  const r = (await call(T1, `select public.use_truck_stock($1, 2, $2) r`, [CORD, ID.c1])).r
  eq(Number(r.quantity), 8)
  eq(r.low, true)
  eq(Number(r.min_quantity), 8)
})
await t('cannot use more than carried, items not on the truck, or for an unknown customer', async () => {
  await rejects(() => call(T1, `select public.use_truck_stock($1, 50, $2)`, [CORD, ID.c1]), /only have 8/)
  await rejects(() => call(T2, `select public.use_truck_stock($1, 1, $2)`, [CORD, ID.c1]), /not on your truck/)
  await rejects(() => call(T1, `select public.use_truck_stock($1, 1, $2)`, [ONU, ID.c1]), /not on your truck/)
  await rejects(() => call(T1, `select public.use_truck_stock($1, 1, 'd0000000-0000-0000-0000-0000000000ff')`, [CORD]), /Choose the customer/)
  await rejects(() => call(T1, `select public.use_truck_stock($1, 0, $2)`, [CORD, ID.c1]), /quantity above 0/)
})
await t('my_truck_stock shows only my own stock, low items first', async () => {
  await load(INV, T1, ONU, 2, 1)
  const mine = (await call(T1, `select public.my_truck_stock() s`)).s
  eq(mine.length, 2)
  eq(mine[0].name, 'Patch cord 3m')
  eq(mine[0].low, true)
  eq((await call(T2, `select public.my_truck_stock() s`)).s.length, 0)
})

section('3. Who can see what')
await t('inventory staff and admins see every truck; others do not', async () => {
  const o = (await call(INV, `select public.truck_overview() o`)).o
  eq(o.technicians.length, 2)
  eq(o.trucks.length, 2)
  ok(o.items.length >= 2, 'items listed')
  ok((await call(ADMIN, `select public.truck_overview() o`)).o.trucks.length === 2, 'admin')
  await rejects(() => call(T1, `select public.truck_overview()`), /Only inventory staff/)
  await rejects(() => call(ID.acc, `select public.truck_overview()`), /Only inventory staff/)
  await rejects(() => call(ID.acc2, `select public.truck_overview()`), /Only inventory staff/)
})
await t('table rules: own rows only for technicians, nobody can write directly', async () => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claims', '{"sub":"${T2}","role":"authenticated"}', false);`)
  try {
    eq((await db.query(`select * from public.truck_stock`)).rows.length, 0)
  } finally {
    await db.exec(`reset role`)
  }
  await rejects(() => asUser(db, T1, () => db.query(`update public.truck_stock set quantity = 999`)), /permission denied/)
  await rejects(() => asUser(db, INV, () => db.query(`insert into public.truck_stock (tenant_id, user_id, item_id, quantity) values ('${ID.tenant}', '${T2}', '${CORD}', 5)`)), /permission denied/)
})

section('4. Error monitoring')
const logErr = (user, msg, screen = 'Home', fatal = false, stack = 'at foo (bar.js:1)') =>
  call(user, `select public.log_app_error($1, $2, $3, '0.5.4', 'android', $4)`, [msg, stack, screen, fatal])
await t('errors are stored with the person\'s company and grouped for staff', async () => {
  await logErr(ID.u1, 'TypeError: x is undefined')
  await logErr(ID.u1, 'TypeError: x is undefined')
  await logErr(ID.u3, 'TypeError: x is undefined', 'Home', true)
  await logErr(T1, 'Network request failed', 'Jobs')
  const r = (await call(ADMIN, `select public.list_app_errors(7) r`)).r
  eq(Number(r.total), 4)
  eq(Number(r.people), 3)
  const g = r.groups.find((x) => x.message === 'TypeError: x is undefined')
  eq(Number(g.occurrences), 3)
  eq(Number(g.people), 2)
  eq(Number(g.fatal), 1)
  eq(g.versions.join(','), '0.5.4')
  ok(g.sample_stack.includes('bar.js'), 'sample stack kept')
})
await t('empty reports are ignored, long ones are cut, and a person cannot flood the table', async () => {
  await logErr(ID.u1, '   ')
  await logErr(ID.u1, 'x'.repeat(900), 'S'.repeat(200))
  const row = await one(`select length(message) m, length(screen) s from public.app_errors where message like 'xxx%'`)
  eq(Number(row.m), 500)
  eq(Number(row.s), 80)
  for (let i = 0; i < 40; i++) await logErr(ID.u2, `spam ${i}`)
  eq((await one(`select count(*)::int n from public.app_errors where user_id = '${ID.u2}'`)).n, 30)
})
await t('only people with the audit permission can read them; anonymous callers cannot report', async () => {
  await rejects(() => call(T1, `select public.list_app_errors()`), /do not have access/)
  await rejects(() => call(ID.u1, `select public.list_app_errors()`), /do not have access/)
  eq(Number((await call(ID.acc2, `select public.list_app_errors() r`)).r.total), 0)
  await db.exec(`set role anon`)
  try {
    await rejects(() => db.query(`select public.log_app_error('x')`), /permission denied/)
    await rejects(() => db.query(`select count(*) from public.app_errors`), /permission denied/)
  } finally {
    await db.exec(`reset role`)
  }
  await rejects(() => asUser(db, ID.u1, () => db.query(`select * from public.app_errors`)), /permission denied/)
})

section('5. Login lockout')
const status = async (email, role = 'anon') => {
  await db.exec(`set role ${role}`)
  try {
    return (await db.query(`select public.login_status($1) s`, [email])).rows[0].s
  } finally {
    await db.exec(`reset role`)
  }
}
const attempt = async (email, success = false) => {
  await db.exec(`set role anon`)
  try {
    return (await db.query(`select public.record_login_attempt($1, $2) s`, [email, success])).rows[0].s
  } finally {
    await db.exec(`reset role`)
  }
}
await t('a fresh address has five tries and is not locked', async () => {
  const s = await status('new@pkc.test')
  eq(s.locked, false)
  eq(s.attempts_left, 5)
})
await t('wrong passwords count down, then the address is locked for 15 minutes', async () => {
  for (let i = 0; i < 4; i++) await attempt('Victim@PKC.test ')
  eq((await status('victim@pkc.test')).attempts_left, 1)
  const s = await attempt('victim@pkc.test')
  eq(s.locked, true)
  ok(s.seconds_left > 800 && s.seconds_left <= 900, 'about 15 minutes')
})
await t('while locked nothing extends the lock and even a correct password is reported as locked', async () => {
  const before = (await status('victim@pkc.test')).seconds_left
  const s = await attempt('victim@pkc.test', true)
  eq(s.locked, true)
  ok(s.seconds_left <= before, 'not extended')
  eq((await one(`select count(*)::int n from public.login_attempts where email_key = 'victim@pkc.test'`)).n, 5)
})
await t('the lock ends by itself after 15 minutes', async () => {
  await db.exec(`update public.login_attempts set at = at - interval '16 minutes' where email_key = 'victim@pkc.test'`)
  const s = await status('victim@pkc.test')
  eq(s.locked, false)
  eq(s.attempts_left, 5)
})
await t('a correct password clears the count; other addresses are not affected', async () => {
  for (let i = 0; i < 3; i++) await attempt('mina@pkc.test')
  eq((await status('mina@pkc.test')).attempts_left, 2)
  await attempt('mina@pkc.test', true)
  eq((await status('mina@pkc.test')).attempts_left, 5)
  eq((await status('other@pkc.test')).attempts_left, 5)
})
await t('blank addresses are harmless and nobody can read or edit the attempts table', async () => {
  eq((await status('   ')).locked, false)
  eq((await attempt('')).locked, false)
  await db.exec(`set role anon`)
  try {
    await rejects(() => db.query(`select * from public.login_attempts`), /permission denied/)
    await rejects(() => db.query(`delete from public.login_attempts`), /permission denied/)
  } finally {
    await db.exec(`reset role`)
  }
})
await t('signed-in callers can check too (the web login runs as anon, the app as either)', async () => {
  eq((await status('anyone@pkc.test', 'authenticated')).attempts_left, 5)
})

summary()
