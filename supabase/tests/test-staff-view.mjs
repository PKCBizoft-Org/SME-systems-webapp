import { createDb, asUser } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { ID, seed, addBill } from './seed.mjs'
import { t, rejects, eq, ok, section, summary } from './kit.mjs'

const { db } = await createDb()
await applyMigrations(db, ['20261009220000_bill_payments.sql', '20261009230000_referral_payouts.sql', '20261009240000_db_hygiene.sql'])
await seed(db)

const as = (user, sql, params) => asUser(db, user, () => db.query(sql, params))
const B1 = await addBill(db, { billId: 'SAM-00001', amount: 750, dueOffset: 3 })
await addBill(db, { client: ID.c3, billId: 'SAM-00002', amount: 750, dueOffset: -4 })

section('Staff reading the balances view with their own login (no service role)')
await t('accounting sees every bill in their tenant with balances', async () => {
  const rows = (await as(ID.acc, `select bill_id, balance, status from public.billing_balances order by bill_id`)).rows
  eq(rows.map((r) => r.bill_id).join(','), 'SAM-00001,SAM-00002')
  eq(rows.find((r) => r.bill_id === 'SAM-00002').status, 'Overdue')
})
await t("another tenant's accounting sees nothing", async () => {
  eq((await as(ID.acc2, `select * from public.billing_balances`)).rows.length, 0)
})
await t('anonymous visitors are blocked', async () => {
  await db.exec(`reset role; select set_config('request.jwt.claims', '', false); set role anon;`)
  try {
    await rejects(() => db.query(`select * from public.billing_balances`), /permission denied/)
  } finally {
    await db.exec(`reset role;`)
  }
})
await t('staff see a pending customer payment on the view', async () => {
  await as(ID.u1, `select public.submit_bill_payment($1, 750, 'GCash', 'GC-V1', null, '09170000001', null, $2)`, [B1, `${ID.u1}/${ID.c1}/p.jpg`])
  const row = (await as(ID.acc, `select pending_review from public.billing_balances where id = $1`, [B1])).rows[0]
  eq(Number(row.pending_review), 750)
  const sub = (await as(ID.acc, `select billing_id, status from public.payment_submissions where billing_id = $1`, [B1])).rows[0]
  eq(sub.status, 'Pending')
})

process.exit(summary() ? 1 : 0)
