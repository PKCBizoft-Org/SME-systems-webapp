import { createDb, asUser } from './lib.mjs'
import { applyMigrations } from './migrate.mjs'
import { ID, seed } from './seed.mjs'
import { t, rejects, eq, ok, section, summary } from './kit.mjs'

const { db } = await createDb()
await applyMigrations(db, ['20261011110000_install_checklist_modem_serial.sql'])
await seed(db)

const TECH = 'e0000000-0000-0000-0000-000000000011'
const OUTSIDER = 'e0000000-0000-0000-0000-000000000012'
await db.exec(`
  insert into auth.users (id, email) values ('${TECH}', 'tech@pkc.test'), ('${OUTSIDER}', 'out@pkc.test');
  insert into public.tenant_users (user_id, tenant_id, role) values ('${TECH}', '${ID.tenant}', 'technician');
`)

const one = async (sql, params) => (await db.query(sql, params)).rows[0]
const set = (user, client, serial) =>
  asUser(db, user, () => db.query(`select public.set_modem_serial($1, $2) s`, [client, serial])).then((r) => r.rows[0].s)

section('1. A technician saves a serial')
await t('the serial is cleaned up (trimmed, upper-case) and stored with who/when', async () => {
  eq(await set(TECH, ID.c1, '  zte-1234abcd  '), 'ZTE-1234ABCD')
  const c = await one(`select modem_serial, modem_serial_by, modem_serial_at from public.clients where id = $1`, [ID.c1])
  eq(c.modem_serial, 'ZTE-1234ABCD')
  eq(c.modem_serial_by, TECH)
  ok(c.modem_serial_at, 'timestamp set')
})
await t('the change is written to the audit log', async () => {
  const a = await one(`select * from public.audit_log where field_name = 'modem_serial' order by id desc limit 1`)
  eq(a.new_value, 'ZTE-1234ABCD')
  eq(a.changed_by_email, 'tech@pkc.test')
})
await t('replacing a serial keeps the old value in the audit log', async () => {
  await set(TECH, ID.c1, 'ZTE-9999ZZZZ')
  const a = await one(`select * from public.audit_log where field_name = 'modem_serial' order by id desc limit 1`)
  eq(a.old_value, 'ZTE-1234ABCD')
  eq(a.new_value, 'ZTE-9999ZZZZ')
})

section('2. Bad input and clashes are refused')
await t('too short, too long and odd characters', async () => {
  await rejects(() => set(TECH, ID.c1, 'ab'), /4 to 64 characters/)
  await rejects(() => set(TECH, ID.c1, 'A'.repeat(65)), /4 to 64 characters/)
  await rejects(() => set(TECH, ID.c1, "ZTE'; drop table clients;--"), /Use only letters/)
})
await t('a serial already on another account is refused without naming it', async () => {
  const e = await rejects(() => set(TECH, ID.c3, 'ZTE-9999ZZZZ'), /already registered to another account/)
})
await t('the same account can save its own serial again', async () => {
  eq(await set(TECH, ID.c1, 'zte-9999zzzz'), 'ZTE-9999ZZZZ')
})

section('3. Who is allowed')
await t('a customer cannot set one', () => rejects(() => set(ID.u1, ID.c1, 'ZTE-AAAA1111'), /Only PKC BIZOFT staff/))
await t('someone with no role cannot set one', () => rejects(() => set(OUTSIDER, ID.c1, 'ZTE-AAAA1111'), /Only PKC BIZOFT staff/))
await t('staff of another tenant cannot set one', () => rejects(() => set(ID.acc2, ID.c1, 'ZTE-AAAA1111'), /Only PKC BIZOFT staff/))
await t('accounting of the same tenant can', async () => eq(await set(ID.acc, ID.c3, 'ZTE-BBBB2222'), 'ZTE-BBBB2222'))
await t('an unknown customer is reported plainly', () => rejects(() => set(TECH, 'd0000000-0000-0000-0000-0000000000ff', 'ZTE-CCCC3333'), /could not be found/))
await t('anonymous callers cannot run it', async () => {
  await db.exec(`set role anon`)
  try {
    await rejects(() => db.query(`select public.set_modem_serial($1, 'ZTE-DDDD4444')`, [ID.c1]), /permission denied/)
  } finally {
    await db.exec(`reset role`)
  }
})

summary()
