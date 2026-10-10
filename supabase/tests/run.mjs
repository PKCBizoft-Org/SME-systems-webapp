// Runs every database test suite in a throwaway in-memory Postgres (pglite).
// Usage: npm run test:db
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const all = '20261009220000_bill_payments.sql,20261009230000_referral_payouts.sql,20261009240000_db_hygiene.sql,20261010110000_cancel_bill_payment.sql'
const suites = ['test-bills', 'test-referrals', 'test-automation', 'test-hygiene', 'test-staff-view']

let failed = 0
for (const suite of suites) {
  console.log(`\n=== ${suite}`)
  const run = spawnSync(process.execPath, [path.join(dir, `${suite}.mjs`)], {
    stdio: 'inherit',
    env: { ...process.env, MIGRATIONS: all },
  })
  if (run.status !== 0) failed += 1
}
console.log(failed ? `\n${failed} suite(s) FAILED` : '\nAll database suites passed')
process.exit(failed ? 1 : 0)
