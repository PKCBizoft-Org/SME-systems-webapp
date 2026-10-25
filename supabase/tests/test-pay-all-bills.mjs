import { createDb, asUser } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { ID, seed, addBill } from './seed.mjs'
import { t, rejects, eq, ok, section, summary } from './kit.mjs'

const MIGRATIONS = (process.env.MIGRATIONS || '20261009220000_bill_payments.sql,20261010110000_cancel_bill_payment.sql,20261025090000_pay_all_bills_one_receipt.sql,20261025140000_payment_group_server_only.sql').split(',')

const { db, failures } = await createDb()
if (failures.length > 1) console.log('replica load warnings:', failures.length)
await applyMigrations(db, MIGRATIONS)
await seed(db)
// The replica predates the staff push; stand in for it so the trigger can be checked.
await db.exec(`
  create or replace function public.push_billing_staff(p_tenant uuid, p_title text, p_body text) returns void
    language sql as $$ insert into net.sent (body) values (jsonb_build_object('title', p_title, 'body', p_body)) $$;
  create trigger payment_submitted_staff_push after insert on public.payment_submissions
    for each row execute function public.notify_payment_submitted();
`)

const q = async (sql, params) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]
const as = (user, sql, params) => asUser(db, user, () => db.query(sql, params))

const payAll = async (user, client, amount, o = {}) =>
  (
    await as(user, `select public.submit_bills_payment($1, $2, $3, $4, null, $5, null, $6) id`, [
      client,
      amount,
      'GCash',
      o.ref ?? `REF-${Math.random().toString(36).slice(2, 9)}`,
      '09170000001',
      `${user}/${client}/p.jpg`,
    ])
  ).rows[0].id
const partsOf = (group) =>
  q(
    `select s.*, b.bill_id from public.payment_submissions s join public.billing b on b.id = s.billing_id
     where s.id = $1 or s.group_id = $1 order by b.due_date`,
    [group],
  )
const pushes = async () => (await q(`select body from net.sent order by id`)).map((r) => r.body)

// Monthly 750 + a 50 extra charge, as in the bug report; 800 total.
await addBill(db, { billId: 'SAM-00001', amount: 750, dueOffset: 3 })
await addBill(db, { billId: 'SAM-00002', amount: 50, dueOffset: 4, periodStartOffset: -26 })

section('1. Pay all bills with one receipt')
let G
await t('the total is split oldest first, one part per bill, lead last', async () => {
  await db.exec(`delete from net.sent`)
  G = await payAll(ID.u1, ID.c1, 800, { ref: 'GC-ALL1' })
  const parts = await partsOf(G)
  eq(parts.length, 2)
  eq(parts.map((p) => `${p.bill_id}:${Number(p.amount_claimed)}`).join(','), 'SAM-00001:750,SAM-00002:50')
  ok(parts.every((p) => p.group_id === G && p.status === 'Pending'), 'all in the group')
  ok(parts.some((p) => p.id === G), 'the lead has id = group id')
})
await t('staff get one push with the full amount', async () => {
  const p = await pushes()
  eq(p.length, 1, 'one push')
  ok(JSON.stringify(p[0]).includes('800.00'), 'total in the push')
})
await t('the same reference cannot be used again', () =>
  rejects(() => payAll(ID.u1, ID.c1, 1, { ref: 'gc-all1' }), /already submitted|nothing left/))
await t('more than the total is refused', async () => {
  const B3 = await addBill(db, { billId: 'SAM-00009', amount: 100, dueOffset: 6, periodStartOffset: -25 })
  await rejects(() => payAll(ID.u1, ID.c1, 101), /more than what is left/)
  await db.query(`delete from public.billing where id = $1`, [B3])
})
await t('another customer cannot pay my account', () => rejects(() => payAll(ID.u3, ID.c1, 10), /could not be found/))

section('2. Accounting')
await t('verifying one part verifies the whole receipt', async () => {
  await db.exec(`delete from net.sent`)
  const nonLead = (await partsOf(G)).find((p) => p.id !== G)
  const r = (await one(`select public.verify_payment_submission_as($1, $2) r`, [nonLead.id, ID.acc])).r
  eq(Number(r.amount), 800)
  eq(r.bill_id, 'SAM-00001, SAM-00002')
  ok((await partsOf(G)).every((p) => p.status === 'Verified'), 'all verified')
  const pays = await q(`select billing_id, amount_paid from public.payments where reference_number = 'GC-ALL1'`)
  eq(pays.length, 2, 'one payment per bill')
  eq((await pushes()).length, 1, 'customer gets one push')
})

section('3. Reject and cancel move the group together')
await t('rejecting one part rejects all', async () => {
  const B5 = await addBill(db, { billId: 'SAM-00005', amount: 300, dueOffset: 8, periodStartOffset: -24 })
  const B6 = await addBill(db, { billId: 'SAM-00006', amount: 200, dueOffset: 9, periodStartOffset: -23 })
  const g = await payAll(ID.u1, ID.c1, 400, { ref: 'GC-REJ' })
  const parts = await partsOf(g)
  eq(parts.map((p) => Number(p.amount_claimed)).join(','), '300,100', 'partial split')
  const r = (await one(`select public.reject_payment_submission_as($1, $2, 'Blurry receipt', null) r`, [g, ID.acc])).r
  eq(Number(r.amount), 400)
  ok((await partsOf(g)).every((p) => p.status === 'Rejected'), 'all rejected')
  // The reference is free again after a rejection.
  const g2 = await payAll(ID.u1, ID.c1, 500, { ref: 'GC-REJ' })
  await as(ID.u1, `select public.cancel_bill_payment($1)`, [(await partsOf(g2)).find((p) => p.id !== g2).id])
  ok((await partsOf(g2)).every((p) => p.status === 'Cancelled'), 'all cancelled')
  await db.query(`delete from public.payment_submissions where billing_id in ($1, $2)`, [B5, B6])
})

section('4. Only the server can group payments')
await t('a direct insert with a made-up group_id is refused', async () => {
  const B8 = await addBill(db, { billId: 'SAM-00008', amount: 90, dueOffset: 11, periodStartOffset: -21 })
  await rejects(
    () =>
      as(
        ID.u1,
        `insert into public.payment_submissions (group_id, client_id, user_id, billing_id, amount_claimed, payment_method, reference_number, status)
         values (gen_random_uuid(), $1, $2, $3, 90, 'GCash', 'GC-FORGED', 'Pending')`,
        [ID.c1, ID.u1, B8],
      ),
    /only be grouped|row-level security|permission denied/,
  )
  await rejects(
    () => db.query(`update public.payment_submissions set group_id = gen_random_uuid() where id = (select id from public.payment_submissions limit 1)`),
    /only be grouped|cannot be taken out/,
  )
})

section('5. Single bill payments still work')
await t('submit_bill_payment + verify are unchanged for one bill', async () => {
  const B7 = await addBill(db, { billId: 'SAM-00007', amount: 120, dueOffset: 10, periodStartOffset: -22 })
  const id = (await as(ID.u1, `select public.submit_bill_payment($1, 120, 'GCash', 'GC-ONE', null, '09170000001', null, $2) id`, [
    B7,
    `${ID.u1}/${ID.c1}/p.jpg`,
  ])).rows[0].id
  const r = (await one(`select public.verify_payment_submission_as($1, $2) r`, [id, ID.acc])).r
  eq(r.bill_id, 'SAM-00007')
  eq(Number(r.remaining), 0)
})

summary()
