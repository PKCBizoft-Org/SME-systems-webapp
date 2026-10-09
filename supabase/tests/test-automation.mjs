import { createDb, asUser } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { ID, seed, addBill } from './seed.mjs'
import { t, rejects, eq, ok, section, summary } from './kit.mjs'

const { db } = await createDb()
await applyMigrations(db, (process.env.MIGRATIONS || '20261009220000_bill_payments.sql,20261009230000_referral_payouts.sql').split(','))
await seed(db)

const q = async (sql, params) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]
const as = (user, sql, params) => asUser(db, user, () => db.query(sql, params))
const pushes = async () => (await q(`select body from net.sent order by id`)).map((r) => r.body)
const run = async () => (await one(`select public.run_billing_automation() r`)).r
const verify = async (sub) => (await one(`select public.verify_payment_submission_as($1, $2) r`, [sub, ID.acc])).r

// c3 also has a service record on the 750 plan so a plan change can be applied to it.
await db.exec(`
  insert into public.client_services (tenant_id, client_id, plan_id, status, installation_status, install_date, started_at)
    select '${ID.tenant}', '${ID.c3}', id, 'active', 'Installed', current_date - 90, now() - interval '90 days'
    from public.internet_plans where plan_name = 'G1_P750' and tenant_id = '${ID.tenant}';
`)

section('1. A paid plan change switches on its date')
let REQ
const B3 = await addBill(db, { client: ID.c3, billId: 'SAM-OLD-3', amount: 750, dueOffset: -20, periodStartOffset: -25, status: 'Paid' })
await t('the application is scheduled for the day after the paid period ends', async () => {
  REQ = (
    await as(
      ID.u3,
      `select public.submit_plan_purchase($1, 'G1_P1000', 1000, 'Manual', 'GCash', 'GC-S1', null, null, null, '09170000003', null, $2, null) id`,
      [ID.c3, `${ID.u3}/${ID.c3}/p.jpg`],
    )
  ).rows[0].id
  const r = await one(`select effective_at::date eff, (select (max(billing_period_end) + 1) from public.billing where client_id = $2) expected from public.service_requests where id = $1`, [REQ, ID.c3])
  eq(String(r.eff).slice(0, 10), String(r.expected).slice(0, 10), 'effective date')
})
await t('after Accounting verifies, the customer keeps the old plan until then', async () => {
  const sub = await one(`select id from public.payment_submissions where service_request_id = $1`, [REQ])
  await verify(sub.id)
  eq((await one(`select status from public.service_requests where id = $1`, [REQ])).status, 'Scheduled')
  eq((await one(`select plan_name from public.clients where id = $1`, [ID.c3])).plan_name, 'G1_P750')
  eq((await one(`select public.activate_due_scheduled_plan_changes() n`)).n, 0, 'nothing due yet')
})
await t('on its date the daily run switches the plan and tells the customer', async () => {
  await db.query(`update public.service_requests set effective_at = now() - interval '1 hour' where id = $1`, [REQ])
  const r = await run()
  eq(r.plans_activated, 1, 'activated')
  eq((await one(`select plan_name from public.clients where id = $1`, [ID.c3])).plan_name, 'G1_P1000')
  eq((await one(`select ip.plan_name from public.client_services cs join public.internet_plans ip on ip.id = cs.plan_id where cs.client_id = $1`, [ID.c3])).plan_name, 'G1_P1000')
  eq((await one(`select status from public.service_requests where id = $1`, [REQ])).status, 'Completed')
  ok((await pushes()).some((b) => b.title === 'Your new plan is active' && /G1_P1000/.test(b.body)), 'push')
  eq((await run()).plans_activated, 0, 'not activated twice')
})

section('2. New bills are generated, priced on the current plan, and announced once')
await t('the new cycle bill uses the new plan\'s price', async () => {
  const bills = await q(`select client_id, bill_id, amount_due from public.billing where bill_id ~ '^SAM-[0-9]+$' order by bill_id`)
  ok(bills.length >= 2, `bills generated (${bills.length})`)
  eq(bills.map((b) => b.bill_id).join(','), 'SAM-00001,SAM-00002', 'sequential, unique numbers (clients share a UUID prefix here)')
  const forC3 = bills.find((b) => b.client_id === ID.c3)
  ok(forC3 && Number(forC3.amount_due) === 1000, `c3 billed ${forC3?.amount_due}`)
  const forC1 = bills.find((b) => b.client_id === ID.c1)
  ok(forC1 && Number(forC1.amount_due) === 750, `c1 billed ${forC1?.amount_due}`)
})
await t('each new bill produced exactly one push, and a second run adds none', async () => {
  const announced = (await pushes()).filter((b) => b.title === 'Your new bill is ready')
  eq(announced.length, 2, 'pushes after first run')
  ok(announced.every((b) => /Plan & Bills/.test(b.body)), 'tells them where to pay')
  const r = await run()
  eq(r.generated, 0, 'nothing new')
  eq((await pushes()).filter((b) => b.title === 'Your new bill is ready').length, 2, 'no repeat pushes')
})
await t('the customer sees the new bill with the right balance', async () => {
  const b = (await as(ID.u3, `select bill_id, amount, balance, status from public.billing_balances where bill_id ~ '^SAM-[0-9]+$'`)).rows[0]
  eq(Number(b.balance), 1000)
  eq(b.status, 'Unpaid')
})

section('3. Overdue bills and disconnection flags')
await t('an unpaid bill past due becomes Overdue and the account is flagged after the grace period', async () => {
  const old = await addBill(db, { client: ID.c1, billId: 'SAM-LATE', amount: 750, dueOffset: -10, periodStartOffset: -40, status: 'Unpaid' })
  const r = await run()
  ok(r.overdue >= 1, 'marked overdue')
  eq((await one(`select status from public.billing where id = $1`, [old])).status, 'Overdue')
  eq((await one(`select disconnection_flag f from public.clients where id = $1`, [ID.c1])).f, true)
})
await t('paying it lifts the flag immediately, and the next run keeps it lifted', async () => {
  const bill = (await one(`select id from public.billing where bill_id = 'SAM-LATE'`)).id
  // Pay the late bill and the new cycle bill so nothing is overdue by more than the grace period.
  await db.query(`select public.record_payment_as($1, $2, 750, 'Cash')`, [ID.acc, bill])
  eq((await one(`select disconnection_flag f from public.clients where id = $1`, [ID.c1])).f, false, 'lifted by payment')
  await run()
  eq((await one(`select disconnection_flag f from public.clients where id = $1`, [ID.c1])).f, false, 'still lifted')
})

section('4. Reminder emails quote what is still owed')
await t('a partly paid bill is reminded for the remainder; a paid one is not', async () => {
  const b = await addBill(db, { client: ID.c1, billId: 'SAM-SOON', amount: 750, dueOffset: 5, periodStartOffset: -25 })
  await db.query(`select public.record_payment_as($1, $2, 300, 'Cash')`, [ID.acc, b])
  const rows = await q(`select kind, amount, bill_ref from public.pending_billing_reminders() where bill_ref = 'SAM-SOON'`)
  eq(rows.length, 1)
  eq(rows[0].kind, 'due5')
  eq(Number(rows[0].amount), 450)
  await db.query(`select public.record_payment_as($1, $2, 450, 'Cash')`, [ID.acc, b])
  eq((await q(`select 1 from public.pending_billing_reminders() where bill_ref = 'SAM-SOON'`)).length, 0, 'paid bill is not reminded')
})

section('5. Access')
await t('only the server can run the automation or activate plans', async () => {
  await db.exec(`select set_config('request.jwt.claims', '{"sub":"${ID.u1}","role":"authenticated"}', false); set role authenticated;`)
  try {
    await rejects(() => db.query(`select public.run_billing_automation()`), /permission denied/)
    await rejects(() => db.query(`select public.activate_due_scheduled_plan_changes()`), /permission denied/)
  } finally {
    await db.exec(`reset role;`)
  }
})

process.exit(summary() ? 1 : 0)
