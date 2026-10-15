import { createDb, asUser } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { ID, seed } from './seed.mjs'
import { t, rejects, eq, section, summary } from './kit.mjs'

const { db } = await createDb()
await applyMigrations(db, (process.env.MIGRATIONS || '').split(',').filter(Boolean))
await seed(db)

const q = async (sql, params) => (await db.query(sql, params)).rows
const one = async (sql, params) => (await q(sql, params))[0]
const as = (user, sql, params) => asUser(db, user, () => db.query(sql, params))
const rewards = async () => (await one(`select count(*)::int n from public.referral_rewards`)).n
const code = async (id) => (await one(`select referral_code from public.clients where id = $1`, [id])).referral_code

// c1, c3: installed customers with a plan. c2: new customer with no plan and no installation yet.
async function verifiedPlanPayment(clientId, userId) {
  const req = await one(`insert into public.service_requests (user_id, client_id, request_type, requested_plan, status) values ($1, $2, 'plan_change', 'G1_P750', 'Completed') returning id`, [userId, clientId])
  await db.query(`insert into public.payment_submissions (client_id, user_id, service_request_id, amount_claimed, payment_method, status) values ($1, $2, $3, 750, 'GCash', 'Verified')`, [clientId, userId, req.id])
}

section('1. Entering a code after sign-up')
await t('a new customer can say who referred them', async () => {
  await as(ID.u2, `select public.set_my_referrer($1)`, [await code(ID.c1)])
  eq((await one(`select referred_by_client_id r from public.clients where id = $1`, [ID.c2])).r, ID.c1)
})
await t('only one referrer, and not your own code', async () => {
  await rejects(async () => as(ID.u2, `select public.set_my_referrer($1)`, [await code(ID.c3)]), /already have a referrer/)
  await db.exec(`update public.clients set referred_by_client_id = null where id = '${ID.c2}'`)
  await rejects(async () => as(ID.u2, `select public.set_my_referrer($1)`, [await code(ID.c2)]), /own referral code/)
})

section('2. No loops')
await t('cannot use the code of the friend you referred', async () => {
  await db.exec(`update public.clients set referred_by_client_id = '${ID.c1}' where id = '${ID.c2}'`)
  // c1 is installed, so c1 can no longer enter a code; use a fresh not-yet-installed c1.
  await db.exec(`update public.clients set installation_status = 'For installation' where id = '${ID.c1}'`)
  await rejects(async () => as(ID.u1, `select public.set_my_referrer($1)`, [await code(ID.c2)]), /someone you referred/)
})
await t('cannot close a longer circle (c1 -> c2 -> c3, then c1 uses c3)', async () => {
  await db.exec(`update public.clients set referred_by_client_id = '${ID.c2}', installation_status = 'For installation' where id = '${ID.c3}'`)
  await rejects(async () => as(ID.u1, `select public.set_my_referrer($1)`, [await code(ID.c3)]), /someone you referred/)
})

section('3. A reward needs a wifi plan subscription')
await db.exec(`
  update public.clients set referred_by_client_id = null, installation_status = 'Installed', plan_name = 'G1_P750' where id in ('${ID.c1}', '${ID.c3}');
  update public.clients set referred_by_client_id = '${ID.c1}', plan_name = null, installation_status = null where id = '${ID.c2}';
  delete from public.referral_rewards; delete from public.referrals;
`)
await t('no reward when the friend has no plan, even with a confirmed payment', async () => {
  await verifiedPlanPayment(ID.c2, ID.u2)
  await db.query(`select public.award_referral($1)`, [ID.c2])
  eq(await rewards(), 0)
})
await t('no reward when the plan is set but the installation is not done', async () => {
  await db.exec(`update public.clients set plan_name = 'G1_P750' where id = '${ID.c2}'`)
  await db.query(`select public.award_referral($1)`, [ID.c2])
  eq(await rewards(), 0)
})
await t('no reward when the plan is no longer on sale', async () => {
  await db.exec(`update public.clients set plan_name = 'G1_P500', installation_status = 'Installed' where id = '${ID.c2}'`)
  await db.query(`select public.award_referral($1)`, [ID.c2])
  eq(await rewards(), 0)
})
await t('no reward when the payment was not confirmed', async () => {
  await db.exec(`update public.clients set plan_name = 'G1_P750' where id = '${ID.c2}'; update public.payment_submissions set status = 'Pending' where client_id = '${ID.c2}'`)
  await db.query(`select public.award_referral($1)`, [ID.c2])
  eq(await rewards(), 0)
})
await t('reward once plan + confirmed payment + installation are all there', async () => {
  await db.exec(`delete from public.payment_submissions where client_id = '${ID.c2}'`)
  await verifiedPlanPayment(ID.c2, ID.u2)
  await db.query(`select public.award_referral($1)`, [ID.c2])
  eq(await rewards(), 1)
  await db.query(`select public.award_referral($1)`, [ID.c2])
  eq(await rewards(), 1, 'no duplicate')
})
await t('a loop is never rewarded, even if the data was forced', async () => {
  await db.exec(`delete from public.referral_rewards; delete from public.referrals; update public.clients set referred_by_client_id = '${ID.c2}' where id = '${ID.c1}'`)
  await db.query(`select public.award_referral($1)`, [ID.c2])
  eq(await rewards(), 0)
})

process.exit(summary() ? 1 : 0)
