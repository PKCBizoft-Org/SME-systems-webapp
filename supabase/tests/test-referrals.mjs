import { createDb, asUser, msg } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { ID, seed } from './seed.mjs'
import { t, rejects, eq, ok, section, summary } from './kit.mjs'

const { db } = await createDb()
await applyMigrations(db, (process.env.MIGRATIONS || '20261009220000_bill_payments.sql,20261009230000_referral_payouts.sql').split(','))
await seed(db)

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
const pushes = async () => (await q(`select body from net.sent order by id`)).map((r) => r.body)
const withdraw = (user, amount, name = 'Active Customer', number = '09170000001', method = 'GCash') =>
  as(user, `select public.request_referral_withdrawal($1, $2, $3, $4, null) id`, [amount, method, name, number]).then((r) => r.rows[0].id)
const act = async (id, action, ref = null, note = null, actor = ID.acc) =>
  (await one(`select public.process_referral_withdrawal_as($1, $2, $3, $4, $5) r`, [id, actor, action, ref, note])).r

// c1 referred two friends and has two eligible rewards of PHP 250 each.
await db.exec(`
  update public.clients set referred_by_client_id = '${ID.c1}' where id in ('${ID.c2}', '${ID.c3}');
  insert into public.referrals (referrer_client_id, referred_client_id, referral_code, status, bonus_amount, bonus_status, bonus_eligible_at) values
    ('${ID.c1}', '${ID.c2}', 'C1CODE', 'Successful', 250, 'Eligible', now()),
    ('${ID.c1}', '${ID.c3}', 'C1CODE', 'Successful', 250, 'Eligible', now());
  insert into public.referral_rewards (referral_id, referrer_client_id, amount, status, eligible_at)
    select id, referrer_client_id, 250, 'Eligible', now() from public.referrals;
`)
const rewardStates = async () => (await q(`select status, count(*)::int n from public.referral_rewards group by 1 order by 1`)).map((r) => `${r.status}:${r.n}`).join(',')

section('1. Customer requests a withdrawal')
let W1
await t('a whole reward can be withdrawn (this used to fail outright)', async () => {
  W1 = await withdraw(ID.u1, 250)
  const w = await one(`select * from public.referral_withdrawals where id = $1`, [W1])
  eq(w.status, 'Pending')
  eq(Number(w.gross_amount), 250)
  eq(Number(w.transfer_fee), 5)
  eq(Number(w.net_amount), 245)
  eq(await rewardStates(), 'Eligible:1,Reserved:1')
})
await t('only one withdrawal can be in progress', () => rejects(() => withdraw(ID.u1, 250), /already have a withdrawal in progress/))
await t('amounts must be whole rewards and within the balance', async () => {
  await rejects(() => withdraw(ID.u1, 5), /more than the PHP 5 transfer fee/)
  await rejects(() => withdraw(ID.u3, 250, 'x', '1'), /balance is PHP 0.00/)
})
await t('a customer with no rewards or someone else\'s account cannot withdraw', () =>
  rejects(() => withdraw(ID.u2, 250, 'x', '1'), /balance is PHP 0.00/))

section('2. Customer cancels')
await t('a pending request can be cancelled and the reward comes back', async () => {
  await as(ID.u1, `select public.cancel_my_referral_withdrawal($1)`, [W1])
  eq((await one(`select status from public.referral_withdrawals where id = $1`, [W1])).status, 'Cancelled')
  eq(await rewardStates(), 'Eligible:2')
})
await t('cannot cancel someone else\'s withdrawal', async () => {
  const w = await withdraw(ID.u1, 500)
  eq(await rewardStates(), 'Reserved:2')
  await rejects(() => as(ID.u3, `select public.cancel_my_referral_withdrawal($1)`, [w]), /Withdrawal not found/)
  W1 = w
})
await t('a two-reward withdrawal totals gross 500, net 495', async () => {
  const w = await one(`select gross_amount, net_amount from public.referral_withdrawals where id = $1`, [W1])
  eq(Number(w.gross_amount), 500)
  eq(Number(w.net_amount), 495)
})

section('3. Accounting reads and processes')
await t('payment staff see the request; other tenants and customers do not', async () => {
  eq((await as(ID.acc, `select id from public.referral_withdrawals`)).rows.length, 2, 'acc sees')
  eq((await as(ID.acc2, `select id from public.referral_withdrawals`)).rows.length, 0, 'other tenant')
  eq((await as(ID.u3, `select id from public.referral_withdrawals`)).rows.length, 0, 'other customer')
  eq((await as(ID.u1, `select id from public.referral_withdrawals`)).rows.length, 2, 'owner sees own')
  eq((await as(ID.acc, `select id from public.referral_rewards`)).rows.length, 2, 'acc sees rewards')
})
await t('start processing', async () => {
  const r = await act(W1, 'processing')
  eq((await one(`select status, processed_by from public.referral_withdrawals where id = $1`, [W1])).status, 'Processing')
  ok((await pushes()).some((b) => b.title === 'Your payout is being processed'), 'push')
})
await t('a customer cannot cancel once Accounting started', () =>
  rejects(() => as(ID.u1, `select public.cancel_my_referral_withdrawal($1)`, [W1]), /has not started/))
await t('marking paid needs the transfer reference', () => rejects(() => act(W1, 'paid'), /reference number of the transfer/))
await t('paid: rewards are withdrawn, referrals marked, customer told', async () => {
  const r = await act(W1, 'paid', 'GC-PAYOUT-1', 'sent via GCash')
  eq(Number(r.net), 495)
  const w = await one(`select status, payout_reference, processed_by from public.referral_withdrawals where id = $1`, [W1])
  eq(w.status, 'Paid')
  eq(w.payout_reference, 'GC-PAYOUT-1')
  eq(w.processed_by, ID.acc)
  eq(await rewardStates(), 'Withdrawn:2')
  eq((await one(`select count(*)::int n from public.referrals where bonus_status = 'Paid'`)).n, 2)
  ok((await pushes()).some((b) => b.title === 'Referral payout sent' && /GC-PAYOUT-1/.test(b.body)), 'push')
  ok((await one(`select count(*)::int n from public.audit_log where field_name = 'referral_withdrawal_paid'`)).n === 1, 'audit')
})
await t('a finished withdrawal cannot be processed again', async () => {
  await rejects(() => act(W1, 'paid', 'X'), /already paid/)
  await rejects(() => act(W1, 'reject', null, 'no'), /already paid/)
})

section('4. Rejection returns the money to the balance')
await t('reject needs a reason, then the rewards are eligible again', async () => {
  await db.exec(`
    insert into public.referral_rewards (referral_id, referrer_client_id, amount, status, eligible_at)
      select id, referrer_client_id, 250, 'Eligible', now() from public.referrals limit 1;
  `)
  const w = await withdraw(ID.u1, 250)
  await rejects(() => act(w, 'reject'), /why the withdrawal was rejected/)
  await act(w, 'reject', null, 'GCash number does not match your account name')
  const row = await one(`select status, reject_reason from public.referral_withdrawals where id = $1`, [w])
  eq(row.status, 'Rejected')
  ok(/does not match/.test(row.reject_reason), 'reason saved')
  eq(await rewardStates(), 'Eligible:1,Withdrawn:2')
  ok((await pushes()).some((b) => b.title === 'Referral withdrawal was not approved' && /does not match/.test(b.body)), 'push')
  // The customer can ask again.
  const again = await withdraw(ID.u1, 250)
  ok(again, 'new request works')
  await act(again, 'paid', 'GC-PAYOUT-2')
})

section('5. Safeguards')
await t('only the right staff can process', async () => {
  const w = await (async () => {
    await db.exec(`
      insert into public.referral_rewards (referral_id, referrer_client_id, amount, status, eligible_at)
        select id, referrer_client_id, 250, 'Eligible', now() from public.referrals limit 1;
    `)
    return withdraw(ID.u1, 250)
  })()
  await rejects(() => act(w, 'paid', 'X', null, ID.acc2), /Only accounting or admin/)
  await rejects(() => act(w, 'bogus'), /Unknown action/)
  await rejects(() => asRole('authenticated', ID.u1, () => db.query(`select public.process_referral_withdrawal_as($1, $2, 'paid', 'X')`, [w, ID.u1])), /permission denied/)
  // A customer who is also staff cannot pay out their own withdrawal.
  await db.exec(`insert into public.tenant_users (user_id, tenant_id, role) values ('${ID.u1}', '${ID.tenant}', 'accounting')`)
  await rejects(() => act(w, 'paid', 'X', null, ID.u1), /your own withdrawal/)
  await db.exec(`delete from public.tenant_users where user_id = '${ID.u1}'`)
})

section('6. Reward notification')
await t('the referrer is told when a friend\'s install earns a reward', async () => {
  await db.exec(`delete from public.referral_rewards; delete from public.referral_withdrawals; delete from public.referrals;`)
  // Build the verified submission through a real request so the foreign keys hold.
  const req = await one(`insert into public.service_requests (user_id, client_id, request_type, requested_plan, status) values ($1, $2, 'plan_change', 'G1_P750', 'Completed') returning id`, [ID.u2, ID.c2])
  await db.query(`delete from public.payment_submissions where client_id = $1`, [ID.c2])
  await db.query(`insert into public.payment_submissions (client_id, user_id, service_request_id, amount_claimed, payment_method, status) values ($1, $2, $3, 750, 'GCash', 'Verified')`, [ID.c2, ID.u2, req.id])
  const before = (await pushes()).length
  await db.query(`select public.award_referral($1)`, [ID.c2])
  eq((await one(`select count(*)::int n from public.referral_rewards where status = 'Eligible'`)).n, 1)
  const after = await pushes()
  ok(after.length === before + 1 && after.at(-1).title === 'You earned a referral reward' && /New Customer/.test(after.at(-1).body), 'push text')
  await db.query(`select public.award_referral($1)`, [ID.c2])
  eq((await one(`select count(*)::int n from public.referral_rewards`)).n, 1, 'no duplicate reward')
})

process.exit(summary() ? 1 : 0)
