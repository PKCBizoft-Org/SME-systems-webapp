import { createDb, asUser, msg } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { ID, seed, addBill } from './seed.mjs'
import { t, rejects, eq, ok, section, summary } from './kit.mjs'

const MIGRATIONS = (process.env.MIGRATIONS || '20261009220000_bill_payments.sql,20261010110000_cancel_bill_payment.sql').split(',')

const { db, failures } = await createDb()
if (failures.length > 1) console.log('replica load warnings:', failures.length)
await applyMigrations(db, MIGRATIONS)
await seed(db)

const clientOf = { [ID.u1]: ID.c1, [ID.u2]: ID.c2, [ID.u3]: ID.c3 }
const q = async (sql, params) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]
const as = (user, sql, params) => asUser(db, user, () => db.query(sql, params))

async function asRole(role, user, fn) {
  await db.exec(`select set_config('request.jwt.claims', '{"sub":"${user}","role":"${role}"}', false); set role ${role};`)
  try {
    return await fn()
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claims', '', false);`)
  }
}

const submitBill = async (user, bill, amount, o = {}) =>
  (
    await as(
      user,
      `select public.submit_bill_payment($1, $2, $3, $4, $5, $6, $7::date, $8) id`,
      [
        bill,
        amount,
        o.method ?? 'GCash',
        'ref' in o ? o.ref : `REF-${Math.random().toString(36).slice(2, 9)}`,
        o.bank ?? null,
        'mobile' in o ? o.mobile : '09170000001',
        o.date ?? null,
        'proof' in o ? o.proof : `${user}/${clientOf[user]}/p.jpg`,
      ],
    )
  ).rows[0].id

const verify = async (sub, actor = ID.acc) => (await one(`select public.verify_payment_submission_as($1, $2) r`, [sub, actor])).r
const reject = async (sub, reason = 'Blurry receipt', note = null, actor = ID.acc) =>
  (await one(`select public.reject_payment_submission_as($1, $2, $3, $4) r`, [sub, actor, reason, note])).r
const billRow = (id) => one(`select * from public.billing_balances where id = $1`, [id])
const stored = (id) => one(`select status, paid_at from public.billing where id = $1`, [id])
const pushes = async () => (await q(`select body from net.sent order by id`)).map((r) => r.body)

// ---------------------------------------------------------------- data
const B1 = await addBill(db, { billId: 'SAM-00001', amount: 750, dueOffset: 3 })
const B2 = await addBill(db, { billId: 'SAM-00002', amount: 750, dueOffset: -10, status: 'Overdue', periodStartOffset: -40 })
const B3 = await addBill(db, { client: ID.c3, billId: 'SAM-00003', amount: 750, dueOffset: 2 })
const B4 = await addBill(db, { billId: 'SAM-00004', amount: 750, dueOffset: 5, status: 'Cancelled', periodStartOffset: -20 })

section('1. Balances view')
await t('customer sees only their own bills', async () => {
  const mine = (await as(ID.u1, `select bill_id from public.billing_balances order by bill_id`)).rows.map((r) => r.bill_id)
  eq(mine.join(','), 'SAM-00001,SAM-00002,SAM-00004', 'u1 bills')
  const theirs = (await as(ID.u3, `select bill_id from public.billing_balances`)).rows.map((r) => r.bill_id)
  eq(theirs.join(','), 'SAM-00003', 'u3 bills')
})
await t('status, balance and days overdue are computed', async () => {
  const b2 = await billRow(B2)
  eq(b2.status, 'Overdue')
  eq(b2.days_overdue, 10)
  eq(Number(b2.balance), 750)
  eq((await billRow(B1)).status, 'Unpaid')
  eq((await billRow(B4)).status, 'Cancelled')
})

section('2. Customer submits a bill payment')
let S1
await t('a valid payment is stored as Pending with its bill and tenant', async () => {
  S1 = await submitBill(ID.u1, B1, 750, { ref: 'GC-A1' })
  const s = await one(`select * from public.payment_submissions where id = $1`, [S1])
  eq(s.status, 'Pending')
  eq(s.billing_id, B1)
  eq(s.tenant_id, ID.tenant)
  eq(s.service_request_id, null)
  eq(s.gcash_mobile, '09170000001')
  eq(Number((await billRow(B1)).pending_review), 750)
})
await t('the typed payment date is kept', async () => {
  const d = (await one(`select (current_date - 2)::text d`)).d
  const id = await submitBill(ID.u1, B2, 100, { ref: 'GC-DATE', date: d })
  eq((await one(`select payment_date::text d from public.payment_submissions where id = $1`, [id])).d, d)
  await db.query(`delete from public.payment_submissions where id = $1`, [id])
})
await t('a second payment cannot cover what is already waiting', () =>
  rejects(() => submitBill(ID.u1, B1, 750), /already have a payment for this bill waiting/))

section('3. Validation')
await t('another customer cannot pay my bill (and I cannot pay theirs)', async () => {
  await rejects(() => submitBill(ID.u3, B1, 750), /could not be found on your account/)
  await rejects(() => submitBill(ID.u1, B3, 750), /could not be found on your account/)
})
await t('amount must be positive, at most 2 decimals and within the balance', async () => {
  await rejects(() => submitBill(ID.u1, B2, 0), /Enter the amount/)
  await rejects(() => submitBill(ID.u1, B2, 10.123), /2 decimal/)
  await rejects(() => submitBill(ID.u1, B2, 751), /more than what is left/)
})
await t('a cancelled bill cannot be paid', () => rejects(() => submitBill(ID.u1, B4, 750), /cancelled/))
await t('reference, GCash number, bank name and receipt are required', async () => {
  await rejects(() => submitBill(ID.u1, B2, 100, { ref: null }), /reference number/)
  await rejects(() => submitBill(ID.u1, B2, 100, { mobile: '12345' }), /GCash mobile number/)
  await rejects(() => submitBill(ID.u1, B2, 100, { method: 'Bank Transfer', bank: null }), /bank name/)
  await rejects(() => submitBill(ID.u1, B2, 100, { proof: null }), /photo of your receipt/)
})
await t('a receipt photo from someone else is refused', () =>
  rejects(() => submitBill(ID.u1, B2, 100, { proof: `${ID.u3}/${ID.c3}/p.jpg` }), /does not belong to your account/))
await t('future and ancient payment dates are refused', async () => {
  const f = (await one(`select (current_date + 2)::text d`)).d
  const o = (await one(`select (current_date - 400)::text d`)).d
  await rejects(() => submitBill(ID.u1, B2, 100, { date: f }), /future/)
  await rejects(() => submitBill(ID.u1, B2, 100, { date: o }), /too far in the past/)
})
await t('the same reference cannot be used twice (case-insensitive)', async () => {
  await rejects(() => submitBill(ID.u3, B3, 750, { ref: 'gc-a1', mobile: '09170000003' }), /already submitted/)
})
await t('the database also enforces one live submission per reference', () =>
  rejects(
    () =>
      db.query(
        `insert into public.payment_submissions (client_id, user_id, billing_id, amount_claimed, payment_method, reference_number, status)
         values ($1, $2, $3, 10, 'GCash', ' GC-A1 ', 'Pending')`,
        [ID.c3, ID.u3, B3],
      ),
    /duplicate key|unique/i,
  ))
await t('customers cannot approve or edit payments themselves', async () => {
    await as(ID.u1, `update public.payment_submissions set status = 'Verified' where id = $1`, [S1])
    eq((await one(`select status from public.payment_submissions where id = $1`, [S1])).status, 'Pending', 'status')
    await rejects(() => asRole('authenticated', ID.u1, () => db.query(`select public.verify_payment_submission_as($1, $2)`, [S1, ID.u1])), /permission denied/)
})

section('4. Accounting verifies')
await t('another tenant\'s accountant cannot verify', () =>
  rejects(() => verify(S1, ID.acc2), /Only accounting or admin/))
await t('verifying posts a payment against the bill and settles it', async () => {
  const r = await verify(S1)
  eq(r.kind, 'bill')
  eq(r.bill_id, 'SAM-00001')
  eq(Number(r.remaining), 0)
  ok(/^RCPT-/.test(r.receipt_number), 'receipt number')
  const pay = await one(`select * from public.payments where billing_id = $1`, [B1])
  eq(Number(pay.amount_paid), 750)
  eq(pay.reference_number, 'GC-A1')
  eq(pay.payment_method, 'GCash')
  eq(pay.recorded_by, ID.acc)
  eq((await stored(B1)).status, 'Paid')
  ok((await stored(B1)).paid_at, 'paid_at set')
  const v = await billRow(B1)
  eq(v.status, 'Paid')
  eq(Number(v.balance), 0)
  eq(Number(v.pending_review), 0)
})
await t('it is written to the audit log and the customer is notified', async () => {
  const a = await one(`select field_name, new_value from public.audit_log where field_name = 'payment_verified' order by id desc limit 1`)
  ok(/SAM-00001/.test(a.new_value), 'audit mentions the bill')
  ok((await pushes()).some((b) => b.title === 'Payment verified' && /bill payment/.test(b.body)), 'push sent')
})
await t('verifying twice is refused', () => rejects(() => verify(S1), /already verified/))
await t('a paid bill cannot be paid again', () => rejects(() => submitBill(ID.u1, B1, 750), /already fully paid/))

section('5. Partial payments, overdue bill and the disconnection flag')
await t('a partial payment leaves the rest due', async () => {
  await db.query(`update public.clients set disconnection_flag = true, disconnection_flagged_at = now() where id = $1`, [ID.c1])
  const s = await submitBill(ID.u1, B2, 300, { ref: 'GC-P1' })
  const r = await verify(s)
  eq(Number(r.remaining), 450)
  const v = await billRow(B2)
  eq(Number(v.paid), 300)
  eq(Number(v.balance), 450)
  eq(v.status, 'Overdue', 'still overdue')
  eq((await stored(B2)).status, 'Partially Paid')
  eq((await one(`select disconnection_flag f from public.clients where id = $1`, [ID.c1])).f, true, 'flag stays while overdue')
})
await t('the next payment cannot exceed what remains, and pending ones count', async () => {
  await rejects(() => submitBill(ID.u1, B2, 451), /more than what is left/)
  const s = await submitBill(ID.u1, B2, 400, { ref: 'GC-P2' })
  await rejects(() => submitBill(ID.u1, B2, 51, { ref: 'GC-P3' }), /already have a payment/)
  const r = await verify(s)
  eq(Number(r.remaining), 50)
})
await t('paying the remainder settles the bill and lifts the disconnection flag', async () => {
  const s = await submitBill(ID.u1, B2, 50, { ref: 'GC-P4' })
  await verify(s)
  eq((await billRow(B2)).status, 'Paid')
  eq((await one(`select disconnection_flag f from public.clients where id = $1`, [ID.c1])).f, false, 'flag lifted')
})

section('6. Accounting rejects')
let S3
await t('rejecting keeps the bill open and records the reason', async () => {
  S3 = await submitBill(ID.u3, B3, 750, { ref: 'GC-B1', mobile: '09170000003' })
  const r = await reject(S3, 'Blurry receipt', 'please retake the photo')
  eq(r.kind, 'bill')
  eq(r.bill_id, 'SAM-00003')
  const s = await one(`select status, reject_reason, reject_note from public.payment_submissions where id = $1`, [S3])
  eq(s.status, 'Rejected')
  eq(s.reject_reason, 'Blurry receipt')
  eq((await billRow(B3)).status, 'Unpaid')
  eq(Number((await billRow(B3)).pending_review), 0)
})
await t('the customer is told why, and can read the reason', async () => {
  ok((await pushes()).some((b) => b.title === 'Payment was not accepted' && /Blurry receipt/.test(b.body)), 'push includes the reason')
  const mine = (await as(ID.u3, `select reject_reason from public.payment_submissions where id = $1`, [S3])).rows[0]
  eq(mine.reject_reason, 'Blurry receipt')
})
await t('the same reference can be resubmitted after a rejection', async () => {
  const s = await submitBill(ID.u3, B3, 750, { ref: 'GC-B1', mobile: '09170000003' })
  const r = await verify(s)
  eq(Number(r.remaining), 0)
})
await t('a rejected submission cannot be verified afterwards', () => rejects(() => verify(S3), /already rejected/))

section('7. Receipts')
await t('the owner reads a bill receipt; others cannot', async () => {
  const pay = await one(`select id from public.payments where billing_id = $1`, [B1])
  const r = (await as(ID.u1, `select public.get_receipt($1) r`, [pay.id])).rows[0].r
  eq(r.kind, 'bill')
  eq(r.bill_id, 'SAM-00001')
  eq(r.reference, 'GC-A1')
  await rejects(() => as(ID.u3, `select public.get_receipt($1)`, [pay.id]), /do not have access/)
})

section('8. Accounting records a walk-in payment')
const B5 = await addBill(db, { client: ID.c3, billId: 'SAM-00005', amount: 750, dueOffset: 6, periodStartOffset: -10 })
await t('cash payment settles the bill and notifies the customer', async () => {
  const r = (await one(`select public.record_payment_as($1, $2, 750, 'Cash', null, null, 'paid at the office') r`, [ID.acc, B5])).r
  eq(Number(r.remaining), 0)
  eq((await billRow(B5)).status, 'Paid')
  ok((await pushes()).some((b) => b.title === 'Payment received'), 'push')
  const a = await one(`select new_value from public.audit_log where field_name = 'payment_recorded' order by id desc limit 1`)
  ok(/paid at the office/.test(a.new_value), 'note in audit')
})
const B6 = await addBill(db, { client: ID.c3, billId: 'SAM-00006', amount: 750, dueOffset: 9, periodStartOffset: -2 })
await t('record_payment_as guards: tenant, amount, duplicate reference, pending payment', async () => {
  await rejects(() => q(`select public.record_payment_as($1, $2, 100, 'Cash')`, [ID.acc2, B6]), /Only accounting or admin/)
  await rejects(() => q(`select public.record_payment_as($1, $2, 800, 'Cash')`, [ID.acc, B6]), /Only PHP 750.00 is left/)
  await rejects(() => q(`select public.record_payment_as($1, $2, 100, 'GCash', 'GC-A1')`, [ID.acc, B6]), /Reference GC-A1 is already/)
  await rejects(() => q(`select public.record_payment_as($1, $2, 100, 'GCash')`, [ID.acc, B6]), /reference number/)
  const sub = await submitBill(ID.u3, B6, 100, { ref: 'GC-W1', mobile: '09170000003' })
  await rejects(() => q(`select public.record_payment_as($1, $2, 100, 'Cash')`, [ID.acc, B6]), /waiting in Payment verification/)
  await reject(sub, 'Other', 'test')
  const r = (await one(`select public.record_payment_as($1, $2, 100, 'Cash') r`, [ID.acc, B6])).r
  eq(Number(r.remaining), 650)
  eq((await billRow(B6)).status, 'Partially Paid')
})
await t('customers and anon cannot record payments', async () => {
  await rejects(() => asRole('authenticated', ID.u3, () => db.query(`select public.record_payment_as($1, $2, 10, 'Cash')`, [ID.u3, B6])), /permission denied/)
  await rejects(() => asRole('anon', ID.u3, () => db.query(`select public.submit_bill_payment($1, 10, 'Cash')`, [B6])), /permission denied/)
})

section('9. Plan applications')
let REQ
await t('a new customer\'s payment date is kept and verification still creates the install job', async () => {
  const d = (await one(`select (current_date - 3)::text d`)).d
  REQ = (
    await as(
      ID.u2,
      `select public.submit_plan_purchase($1, 'G1_P750', 750, 'Manual', 'GCash', 'GC-PLAN-1', null, null, null, '09170000002', $2::date, $3, null) id`,
      [ID.c2, d, `${ID.u2}/${ID.c2}/p.jpg`],
    )
  ).rows[0].id
  const s = await one(`select id, payment_date::text d, gcash_mobile from public.payment_submissions where service_request_id = $1`, [REQ])
  eq(s.d, d, 'payment_date')
  eq(s.gcash_mobile, '09170000002', 'gcash number carried over')
  const r = await verify(s.id)
  eq(r.kind, 'plan')
  eq(r.new_customer, true)
  eq((await one(`select plan_name from public.clients where id = $1`, [ID.c2])).plan_name, 'G1_P750')
  eq((await one(`select count(*)::int n from public.repair_records where service_request_id = $1 and job_type = 'installation'`, [REQ])).n, 1, 'install job')
})
await t('only one application can wait at a time, and the reference check applies', async () => {
  const apply = (user, client, plan, price, ref, replace = null) =>
    as(user, `select public.submit_plan_purchase($1, $2, $3, 'Manual', 'GCash', $4, null, null, null, '09170000003', null, $5, $6) id`, [client, plan, price, ref, `${user}/${client}/p.jpg`, replace])
  const first = (await apply(ID.u3, ID.c3, 'G1_P1000', 1000, 'GC-PLAN-3')).rows[0].id
  await rejects(() => apply(ID.u3, ID.c3, 'G1_P1500', 1500, 'GC-PLAN-4'), /already have a plan application/)
  await rejects(() => apply(ID.u3, ID.c3, 'G1_P1500', 1500, 'GC-PLAN-1', first), /already submitted/)
  // Replacing the waiting application may reuse its own reference.
  const second = (await apply(ID.u3, ID.c3, 'G1_P1500', 1500, 'GC-PLAN-3', first)).rows[0].id
  eq((await one(`select status from public.service_requests where id = $1`, [first])).status, 'Cancelled')
  eq((await one(`select count(*)::int n from public.payment_submissions where service_request_id = $1 and status = 'Pending'`, [second])).n, 1)
  // Withdraw it to leave the data tidy for the next suite.
  await as(ID.u3, `select public.cancel_scheduled_plan_change($1)`, [second])
})
await t('a plan application checks proof ownership, date and the catalog price', async () => {
  const f = (await one(`select (current_date + 3)::text d`)).d
  const go = (price, proof, date = null) =>
    as(ID.u1, `select public.submit_plan_purchase($1, 'G1_P1000', $2, 'Manual', 'GCash', 'GC-X', null, null, null, '09170000001', $3::date, $4, null)`, [ID.c1, price, date, proof])
  await rejects(() => go(900, `${ID.u1}/${ID.c1}/p.jpg`), /does not match the selected plan/)
  await rejects(() => go(1000, `${ID.u3}/${ID.c3}/p.jpg`), /does not belong to your account/)
  await rejects(() => go(1000, `${ID.u1}/${ID.c1}/p.jpg`, f), /future/)
})

section('10. Plan catalog')
await t('list_plans returns this tenant\'s active plans, cheapest first', async () => {
  const plans = (await as(ID.u1, `select * from public.list_plans()`)).rows
  eq(plans.map((p) => p.plan_name).join(','), 'G1_P750,G1_P1000,G1_P1500,G1_P2000')
  await rejects(() => asRole('anon', ID.u1, () => db.query(`select * from public.list_plans()`)), /permission denied/)
})
await t('a plan that is not in the old hardcoded list is accepted by the table', async () => {
  await db.query(`insert into public.internet_plans (tenant_id, plan_name, price, speed, active) values ($1, 'G1_P3000', 3000, '3000 Mbps', true)`, [ID.tenant])
  const id = (await as(ID.u2, `select public.submit_plan_purchase($1, 'G1_P3000', 3000, 'Manual', 'GCash', 'GC-3000', null, null, null, '09170000002', null, $2, null) id`, [ID.c2, `${ID.u2}/${ID.c2}/p.jpg`])).rows[0].id
  ok(id, 'created')
  await as(ID.u2, `select public.cancel_scheduled_plan_change($1)`, [id])
})

section('11. Customer cancels a pending bill payment')
const C1 = await addBill(db, { client: ID.c3, billId: 'SAM-00011', amount: 750, dueOffset: 4, periodStartOffset: -25 })
const C2 = await addBill(db, { billId: 'SAM-00012', amount: 750, dueOffset: 6, periodStartOffset: -24 })
await t('cancel frees the bill and the reference, keeps a record, and cannot be repeated', async () => {
  const sub = await submitBill(ID.u3, C1, 300, { ref: 'CANCEL-REF-1' })
  await rejects(() => as(ID.u1, `select public.cancel_bill_payment($1)`, [sub]), /could not be found/)
  await as(ID.u3, `select public.cancel_bill_payment($1)`, [sub])
  const row = await one(`select status, reject_note from public.payment_submissions where id = $1`, [sub])
  eq(row.status, 'Cancelled', 'status')
  eq(row.reject_note, 'Cancelled by the customer', 'note')
  await rejects(() => as(ID.u3, `select public.cancel_bill_payment($1)`, [sub]), /already cancelled/)
  await submitBill(ID.u3, C1, 750, { ref: 'CANCEL-REF-1' })
  eq((await one(`select count(*)::int n from public.audit_log where field_name = 'payment_cancelled'`)).n, 1, 'audited')
})
await t('a verified payment cannot be cancelled', async () => {
  const sub = (await q(`select id from public.payment_submissions where reference_number = 'CANCEL-REF-1' and status = 'Pending'`))[0].id
  await verify(sub)
  await rejects(() => as(ID.u3, `select public.cancel_bill_payment($1)`, [sub]), /already verified/)
})
await t('cancelling does not send a rejection push', async () => {
  const before = (await pushes()).length
  const sub = await submitBill(ID.u1, C2, 100)
  await as(ID.u1, `select public.cancel_bill_payment($1)`, [sub])
  eq((await pushes()).length, before, 'no push')
})

process.exit(summary() ? 1 : 0)
