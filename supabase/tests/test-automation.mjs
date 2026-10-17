import { createDb, asUser } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { ID, seed, addBill } from './seed.mjs'
import { t, rejects, eq, ok, section, summary } from './kit.mjs'

const { db } = await createDb()
await applyMigrations(
  db,
  (
    process.env.MIGRATIONS ||
    '20261009220000_bill_payments.sql,20261009230000_referral_payouts.sql,20261013170000_billing_grace_termination.sql,20261013190000_billing_schedule_final.sql,20261014085900_billing_day_new_installs_on_the_1st.sql,20261014090000_billing_video_schedule.sql,20261017090000_bill_the_install_month.sql'
  ).split(','),
)
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
const B3 = await addBill(db, { client: ID.c3, billId: 'SAM-OLD-3', amount: 750, dueOffset: -20, periodStartOffset: -45, periodEndOffset: 4, status: 'Paid' })
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

section('2b. The monthly schedule: month-long period, due at month end, grace to the 4th, disconnection on the 5th')
await t('a monthly bill covers the calendar month and is due on its last day', async () => {
  const b = await one(`select bill_date, billing_period_start s, billing_period_end e, due_date, grace_until, disconnect_date, terminate_date,
                              date_trunc('month', current_date)::date m, (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date last
                       from public.billing where client_id = $1 and bill_id ~ '^SAM-[0-9]+$'`, [ID.c1])
  eq(String(b.s).slice(0, 10), String(b.m).slice(0, 10), 'period starts on the 1st')
  eq(String(b.e).slice(0, 10), String(b.last).slice(0, 10), 'period ends on the last day')
  eq(String(b.due_date).slice(0, 10), String(b.last).slice(0, 10), 'due on the last day')
  eq(String(b.bill_date).slice(0, 10), String(b.m).slice(0, 10), 'billing day 1 = billed on the 1st')
})
await t('grace ends on the 4th of the next month, disconnection is the 5th, termination 30 days later', async () => {
  const d = await one(`select (grace_until - due_date) g, (disconnect_date - due_date) dc, (terminate_date - disconnect_date) tm,
                              extract(day from grace_until)::int gd, extract(day from disconnect_date)::int dd
                       from public.billing where client_id = $1 and bill_id ~ '^SAM-[0-9]+$'`, [ID.c1])
  eq(d.g, 4); eq(d.dc, 5); eq(d.tm, 30)
  eq(d.gd, 4, 'grace ends on the 4th'); eq(d.dd, 5, 'disconnection on the 5th')
})
await t('a customer with a later billing day is billed only once that day has come, and never for a month already over', async () => {
  await db.query(`update public.clients set billing_day = 28 where id = $1`, [ID.c1])
  await db.query(`delete from public.billing where client_id = $1 and bill_id ~ '^SAM-[0-9]+$'`, [ID.c1])
  const todayDay = (await one(`select extract(day from current_date)::int d`)).d
  const r = await run()
  const made = (await q(`select 1 from public.billing where client_id = $1 and bill_id ~ '^SAM-[0-9]+$'`, [ID.c1])).length
  eq(made, todayDay >= 28 ? 1 : 0, 'billed on the 28th, not before')
  // Nothing is ever created for the month before, even though that bill date has passed.
  eq((await q(`select 1 from public.billing where client_id = $1 and billing_period_start < date_trunc('month', current_date)`, [ID.c1])).length, 0, 'no backdated bill')
  eq(r.generated, made, 'only that one')
  await db.query(`update public.clients set billing_day = 1 where id = $1`, [ID.c1])
  await db.query(`delete from public.billing where client_id = $1 and bill_id ~ '^SAM-[0-9]+$'`, [ID.c1])
  await run()
})
await t('an account whose bill already covers this month is not billed a second time', async () => {
  const before = (await one(`select count(*)::int n from public.billing where client_id = $1`, [ID.c1])).n
  await db.query(`update public.clients set billing_day = 1 where id = $1`, [ID.c1])
  eq((await run()).generated, 0)
  eq((await one(`select count(*)::int n from public.billing where client_id = $1`, [ID.c1])).n, before)
})

await t('the install month is billed too: installed today, the bill goes out today for this month, due on its last day', async () => {
  await db.query(`delete from public.billing where client_id = $1 and bill_id ~ '^SAM-[0-9]+$'`, [ID.c1])
  await db.query(`update public.clients set install_date = current_date + 1 where id = $1`, [ID.c1])
  eq((await run()).generated, 0, 'not before the installation')
  await db.query(`update public.clients set install_date = current_date where id = $1`, [ID.c1])
  eq((await run()).generated, 1)
  const b = await one(`select bill_date = current_date today, billing_period_start = date_trunc('month', current_date)::date s,
                              due_date = (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date due, final_amount
                       from public.billing where client_id = $1 and bill_id ~ '^SAM-[0-9]+$'`, [ID.c1])
  eq(b.today, true, 'billed on the install day'); eq(b.s, true, 'covers this month'); eq(b.due, true, 'due on the last day')
  eq(Number(b.final_amount), 750, 'full monthly price')
  eq((await run()).generated, 0, 'only once')
  await db.query(`update public.clients set install_date = current_date - 60 where id = $1`, [ID.c1])
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

section('4b. Disconnection date and automatic termination')
await t('a bill still unpaid before its disconnection date does not flag the account', async () => {
  // SAM-OLD-3 was only a fixture for the plan-change test (marked Paid, no payment rows): close it.
  await db.query(`update public.billing set status = 'Cancelled' where bill_id = 'SAM-OLD-3'`)
  // Due 3 days ago: inside the grace period (due + 4), so overdue but not yet disconnected.
  await db.query(`delete from public.billing where client_id = $1 and bill_id ~ '^SAM-[0-9]+$'`, [ID.c3])
  await db.query(`update public.clients set disconnection_flag = false where id = $1`, [ID.c3])
  await db.query(
    `insert into public.billing (tenant_id, client_id, bill_id, status, bill_type, bill_date, due_date, grace_until, disconnect_date, terminate_date, amount_due, original_amount, final_amount, billing_period_start, billing_period_end)
     values ($1, $2, 'SAM-GRACE', 'Unpaid', 'Monthly', current_date - 20, current_date - 3, current_date + 1, current_date + 2, current_date + 32, 750, 750, 750, current_date - 20, current_date - 3)`,
    [ID.tenant, ID.c3],
  )
  await run()
  eq((await one(`select status from public.billing where bill_id = 'SAM-GRACE'`)).status, 'Overdue')
  eq((await one(`select disconnection_flag f from public.clients where id = $1`, [ID.c3])).f, false, 'still in the grace period')
})
await t('on the disconnection date the account is flagged, and paying lifts it', async () => {
  await db.query(`update public.billing set due_date = current_date - 5, grace_until = current_date - 1, disconnect_date = current_date, terminate_date = current_date + 30 where bill_id = 'SAM-GRACE'`)
  await run()
  eq((await one(`select disconnection_flag f from public.clients where id = $1`, [ID.c3])).f, true, 'flagged on the disconnection date')
  const id = (await one(`select id from public.billing where bill_id = 'SAM-GRACE'`)).id
  await db.query(`select public.record_payment_as($1, $2, 750, 'Cash')`, [ID.acc, id])
  eq((await one(`select disconnection_flag f from public.clients where id = $1`, [ID.c3])).f, false, 'payment lifts the flag')
})
await t('an account is terminated automatically once the termination date passes, announced once', async () => {
  await db.query(
    `insert into public.billing (tenant_id, client_id, bill_id, status, bill_type, bill_date, due_date, grace_until, disconnect_date, terminate_date, amount_due, original_amount, final_amount, billing_period_start, billing_period_end)
     values ($1, $2, 'SAM-GONE', 'Overdue', 'Monthly', current_date - 80, current_date - 50, current_date - 46, current_date - 45, current_date, 750, 750, 750, date_trunc('month', current_date - 80)::date, (date_trunc('month', current_date - 80) + interval '1 month' - interval '1 day')::date)`,
    [ID.tenant, ID.c3],
  )
  const r = await run()
  eq(r.terminated, 1)
  eq((await one(`select installation_status s from public.clients where id = $1`, [ID.c3])).s, 'Terminated')
  eq((await run()).terminated, 0, 'not terminated twice')
  eq((await pushes()).filter((b) => b.title === 'Your service was terminated').length, 1, 'one notice')
})

section('4c. Accounting adds Installation Fee and Adjustment bills')
const addBillAs = (actor, client, type, amount, due = null, note = null) =>
  db.query(`select public.add_manual_bill_as($1, $2, $3, $4, $5, $6) r`, [actor, client, type, amount, due, note])
await t('an Installation Fee bill gets the next automatic bill ID and the same dates as a monthly bill', async () => {
  const before = (await one(`select coalesce(max(substring(bill_id from 5)::bigint), 0) n from public.billing where bill_id ~ '^SAM-[0-9]+$'`)).n
  const r = (await addBillAs(ID.acc, ID.c1, 'Installation Fee', 750)).rows[0].r
  eq(r.bill_id, 'SAM-' + String(Number(before) + 1).padStart(5, '0'), 'next number')
  const b = await one(`select bill_type, status, due_date - bill_date gap, grace_until - due_date g, disconnect_date - due_date d, terminate_date - disconnect_date t, final_amount from public.billing where bill_id = $1`, [r.bill_id])
  eq(b.bill_type, 'Installation Fee'); eq(b.status, 'Unpaid'); eq(Number(b.final_amount), 750)
  ok(Number(b.gap) >= 7, `at least 7 days to pay (${b.gap})`)
  eq(b.g, 4); eq(b.d, 5); eq(b.t, 30)
  ok((await pushes()).some((x) => x.title === 'New bill on your account' && /Installation Fee/.test(x.body)), 'customer told')
})
await t('a customer cannot be given two installation fee bills', async () => {
  await rejects(() => addBillAs(ID.acc, ID.c1, 'Installation Fee', 750), /already has an installation fee/)
})
await t('an Adjustment needs a reason, and only Installation Fee or Adjustment can be added by hand', async () => {
  await rejects(() => addBillAs(ID.acc, ID.c1, 'Adjustment', 200), /what the adjustment is for/)
  const r = (await addBillAs(ID.acc, ID.c1, 'Adjustment', 200, null, 'Extra cable')).rows[0].r
  eq((await one(`select bill_type from public.billing where bill_id = $1`, [r.bill_id])).bill_type, 'Adjustment')
  await rejects(() => addBillAs(ID.acc, ID.c1, 'Monthly', 750), /Monthly bills are created automatically/)
})
await t('amounts and due dates are checked', async () => {
  await rejects(() => addBillAs(ID.acc, ID.c1, 'Adjustment', 0, null, 'x'), /valid amount/)
  await rejects(() => addBillAs(ID.acc, ID.c1, 'Adjustment', 10.123, null, 'x'), /valid amount/)
  await rejects(() => addBillAs(ID.acc, ID.c1, 'Adjustment', 10, '2020-01-01', 'x'), /cannot be in the past/)
})
await t('only accounting or admin of the same company can add a bill, never to their own account', async () => {
  await rejects(() => addBillAs(ID.u1, ID.c1, 'Adjustment', 10, null, 'x'), /Only accounting or admin/)
  await rejects(() => addBillAs(ID.acc2, ID.c1, 'Adjustment', 10, null, 'x'), /Only accounting or admin/)
  await db.query(`update public.clients set user_id = $1 where id = $2`, [ID.acc, ID.c2])
  await rejects(() => addBillAs(ID.acc, ID.c2, 'Adjustment', 10, null, 'x'), /your own account/)
  await db.query(`update public.clients set user_id = $1 where id = $2`, [ID.u2, ID.c2])
})
await t('the audit log records who added the bill', async () => {
  const a = await one(`select changed_by_email e, new_value v from public.audit_log where field_name = 'bill_added' and client_id = $1 order by changed_at desc limit 1`, [ID.c1])
  eq(a.e, 'acc@pkc.test'); ok(/Extra cable/.test(a.v), 'note kept')
})

section('5. Access')
await t('only the server can run the automation or activate plans', async () => {
  await db.exec(`select set_config('request.jwt.claims', '{"sub":"${ID.u1}","role":"authenticated"}', false); set role authenticated;`)
  try {
    await rejects(() => db.query(`select public.run_billing_automation()`), /permission denied/)
    await rejects(() => db.query(`select public.activate_due_scheduled_plan_changes()`), /permission denied/)
    await rejects(() => db.query(`select public.add_manual_bill_as($1, $2, 'Adjustment', 10, null, 'x')`, [ID.acc, ID.c1]), /permission denied/)
  } finally {
    await db.exec(`reset role;`)
  }
})

process.exit(summary() ? 1 : 0)
