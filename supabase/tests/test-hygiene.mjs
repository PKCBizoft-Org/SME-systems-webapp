import { createDb, asUser } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { ID, seed } from './seed.mjs'
import { t, rejects, eq, ok, section, summary } from './kit.mjs'

const { db } = await createDb()
const bareBefore = (await db.query(`select count(*)::int n from pg_policies where schemaname='public' and (coalesce(qual,'') ~ '(?<!SELECT )auth\\.uid\\(\\)' or coalesce(with_check,'') ~ '(?<!SELECT )auth\\.uid\\(\\)')`)).rows[0].n
const policiesBefore = (await db.query(`select policyname, tablename, cmd, roles::text roles from pg_policies where schemaname='public' order by tablename, policyname`)).rows
await applyMigrations(db, ['20261009220000_bill_payments.sql', '20261009230000_referral_payouts.sql', '20261009240000_db_hygiene.sql'])
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

section('1. Policies keep their rules but stop calling auth.uid() per row')
await t('no public policy calls auth.uid() bare any more', async () => {
  ok(bareBefore > 0, `there were ${bareBefore} to fix`)
  const after = (await one(`select count(*)::int n from pg_policies where schemaname='public' and (coalesce(qual,'') ~ '(?<!SELECT )auth\\.uid\\(\\)' or coalesce(with_check,'') ~ '(?<!SELECT )auth\\.uid\\(\\)')`)).n
  eq(after, 0, 'remaining bare uses')
})
await t('the same policies exist with the same commands and roles', async () => {
  const after = (await q(`select policyname, tablename, cmd, roles::text roles from pg_policies where schemaname='public' order by tablename, policyname`))
  const key = (r) => `${r.tablename}|${r.policyname}|${r.cmd}|${r.roles}`
  // The two referral policies are intentionally replaced by one combined policy each.
  const expectedGone = new Set(['referral_withdrawals|customers can view own referral withdrawals|SELECT|{authenticated}', 'referral_rewards|customers can view own referral rewards|SELECT|{authenticated}'])
  const before = new Set(policiesBefore.map(key).filter((k) => !expectedGone.has(k)))
  const now = new Set(after.map(key))
  const missing = [...before].filter((k) => !now.has(k))
  eq(missing.join(' ; '), '', 'policies that disappeared')
})

section('2. Indexes')
await t('duplicates are gone and the foreign keys are covered', async () => {
  const names = (await q(`select indexname from pg_indexes where schemaname='public'`)).map((r) => r.indexname)
  for (const gone of ['idx_client_site_photos_client_id', 'idx_payments_service_request_id', 'idx_repair_photos_repair_id', 'idx_repair_records_client_id', 'idx_service_requests_plan_change']) {
    ok(!names.includes(gone), `${gone} should be dropped`)
  }
  for (const kept of ['client_site_photos_client_id_idx', 'payments_service_request_id_idx', 'repair_photos_repair_id_idx', 'repair_records_client_id_idx', 'service_requests_client_type_status_idx', 'audit_log_client_id_idx', 'payment_submissions_user_id_idx']) {
    ok(names.includes(kept), `${kept} should exist`)
  }
})

section('3. Read-only views')
await t('signed-in users can read but not write the stock catalog', async () => {
  await db.query(`insert into public.inventory_items (tenant_id, sku, name, quantity_on_hand) values ($1, 'S1', 'Cable', 5)`, [ID.tenant])
  ok((await asRole('authenticated', ID.u1, () => db.query(`select * from public.inventory_catalog`))).rows.length >= 1, 'select works')
  await rejects(() => asRole('authenticated', ID.u1, () => db.query(`update public.inventory_catalog set quantity_on_hand = 999`)), /permission denied/)
  await rejects(() => asRole('authenticated', ID.u1, () => db.query(`delete from public.inventory_catalog`)), /permission denied/)
  await rejects(() => asRole('authenticated', ID.u1, () => db.query(`insert into public.inventory_catalog (tenant_id, sku, name) values ($1, 'X', 'X')`, [ID.tenant])), /permission denied/)
})
await t('the balances view is read-only too', async () => {
  await rejects(() => asRole('authenticated', ID.u1, () => db.query(`delete from public.billing_balances`)), /permission denied|cannot delete/)
  await rejects(() => asRole('anon', ID.u1, () => db.query(`select * from public.billing_balances`)), /permission denied/)
})

section('4. Receipt photos')
const paths = {
  u1: `${ID.u1}/${ID.c1}/1-payment-proof.jpg`,
  u3: `${ID.u3}/${ID.c3}/1-payment-proof.jpg`,
}
await db.query(`insert into storage.objects (bucket_id, name) values ('payment-proofs', $1), ('payment-proofs', $2)`, [paths.u1, paths.u3])
const visible = async (user) => (await as(user, `select name from storage.objects where bucket_id = 'payment-proofs' order by name`)).rows.map((r) => r.name)
await t('customers see only their own receipt', async () => {
  eq((await visible(ID.u1)).join(','), paths.u1)
  eq((await visible(ID.u3)).join(','), paths.u3)
})
await t('accounting sees their tenant\'s receipts, not another tenant\'s', async () => {
  eq((await visible(ID.acc)).length, 2, 'own tenant')
  eq((await visible(ID.acc2)).length, 0, 'other tenant')
})
await t('a technician-only member cannot read receipts', async () => {
  await db.exec(`insert into auth.users (id, email) values ('b0000000-0000-0000-0000-0000000000aa', 'tech@pkc.test'); insert into public.tenant_users (user_id, tenant_id, role) values ('b0000000-0000-0000-0000-0000000000aa', '${ID.tenant}', 'technician');`)
  eq((await visible('b0000000-0000-0000-0000-0000000000aa')).length, 0)
})
await t('customers can upload to their own folder only, and cannot delete evidence', async () => {
  await as(ID.u1, `insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)`, [`${ID.u1}/${ID.c1}/2-payment-proof.jpg`])
  await rejects(() => as(ID.u1, `insert into storage.objects (bucket_id, name) values ('payment-proofs', $1)`, [`${ID.u3}/${ID.c3}/2-payment-proof.jpg`]), /row-level security/)
  await as(ID.u1, `delete from storage.objects where name = $1`, [paths.u1])
  eq((await one(`select count(*)::int n from storage.objects where name = $1`, [paths.u1])).n, 1, 'file still there')
})
await t('the bucket only accepts photos up to 8 MB', async () => {
  const b = await one(`select file_size_limit::text s, allowed_mime_types from storage.buckets where id = 'payment-proofs'`)
  eq(b.s, '8388608')
  eq([].concat(b.allowed_mime_types).join(','), 'image/jpeg,image/png,image/webp')
})

process.exit(summary() ? 1 : 0)
