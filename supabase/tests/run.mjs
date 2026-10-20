// Runs every database test suite in a throwaway in-memory Postgres (pglite).
// Usage: npm run test:db
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const all = '20261009220000_bill_payments.sql,20261009230000_referral_payouts.sql,20261009240000_db_hygiene.sql,20261010110000_cancel_bill_payment.sql,20261012140000_install_payment_remote_signoff.sql,20261012200000_install_needs_plan_billing_day.sql,20261013100000_referral_enter_code_later.sql,20261012210000_require_arrival_before_done.sql,20261013170000_billing_grace_termination.sql,20261013190000_billing_schedule_final.sql,20261014085900_billing_day_new_installs_on_the_1st.sql,20261014090000_billing_video_schedule.sql,20261015110000_referral_rules.sql,20261017090000_bill_the_install_month.sql,20261017110000_disconnection_push.sql,20261020090000_billing_day_15_25_and_more_pushes.sql,20261020100000_api_rate_limits.sql,20261020110000_billing_review_fixes.sql,20261020120000_pending_payment_hold_3_days.sql,20261020130000_pending_hold_tied_to_bill.sql'
const suites = ['test-bills', 'test-referrals', 'test-referral-rules', 'test-service-rating', 'test-automation', 'test-hygiene', 'test-staff-view', 'test-technician-stats', 'test-modem-serial', 'test-ticket-chat', 'test-insights-permissions', 'test-dispatch-outages', 'test-truck-errors-lockout', 'test-job-handback', 'test-join-requests', 'test-install-signoff', 'test-accounting-summary', 'test-rate-limits']

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
