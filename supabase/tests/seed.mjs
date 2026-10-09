// Seed data for the sandbox: one tenant, an accountant, and three customers.
export const ID = {
  tenant: 'a0000000-0000-0000-0000-000000000001',
  tenant2: 'a0000000-0000-0000-0000-000000000002',
  acc: 'b0000000-0000-0000-0000-000000000001', // accountant
  acc2: 'b0000000-0000-0000-0000-000000000002', // accountant of the OTHER tenant
  u1: 'c0000000-0000-0000-0000-000000000001', // active customer with a plan
  u2: 'c0000000-0000-0000-0000-000000000002', // new customer, no plan
  u3: 'c0000000-0000-0000-0000-000000000003', // another active customer
  c1: 'd0000000-0000-0000-0000-000000000001',
  c2: 'd0000000-0000-0000-0000-000000000002',
  c3: 'd0000000-0000-0000-0000-000000000003',
}

export async function seed(db) {
  await db.exec(`
    insert into auth.users (id, email) values
      ('${ID.acc}', 'acc@pkc.test'), ('${ID.acc2}', 'acc2@pkc.test'),
      ('${ID.u1}', 'u1@pkc.test'), ('${ID.u2}', 'u2@pkc.test'), ('${ID.u3}', 'u3@pkc.test');

    insert into public.tenants (id, name) values ('${ID.tenant}', 'PKC'), ('${ID.tenant2}', 'Other ISP');
    insert into public.tenant_users (user_id, tenant_id, role) values
      ('${ID.acc}', '${ID.tenant}', 'accounting'),
      ('${ID.acc2}', '${ID.tenant2}', 'accounting');

    insert into public.internet_plans (tenant_id, plan_name, price, speed, active) values
      ('${ID.tenant}', 'G1_P750', 750, '750 Mbps', true),
      ('${ID.tenant}', 'G1_P1000', 1000, '1000 Mbps', true),
      ('${ID.tenant}', 'G1_P1500', 1500, '1500 Mbps', true),
      ('${ID.tenant}', 'G1_P2000', 2000, '2000 Mbps', true),
      ('${ID.tenant}', 'G1_P500', 500, '500 Mbps', false);

    insert into public.clients (id, tenant_id, customer_name, plan_name, account_status, installation_status, install_date, user_id, email, mobile_number, billing_day) values
      ('${ID.c1}', '${ID.tenant}', 'Active Customer', 'G1_P750', 'Active', 'Installed', current_date - 60, '${ID.u1}', 'u1@pkc.test', '09170000001', 5),
      ('${ID.c2}', '${ID.tenant}', 'New Customer', null, 'Inactive', null, null, '${ID.u2}', 'u2@pkc.test', '09170000002', null),
      ('${ID.c3}', '${ID.tenant}', 'Other Customer', 'G1_P750', 'Active', 'Installed', current_date - 90, '${ID.u3}', 'u3@pkc.test', '09170000003', 5);

    insert into public.client_services (tenant_id, client_id, plan_id, status, installation_status, install_date, started_at)
      select '${ID.tenant}', '${ID.c1}', id, 'active', 'Installed', current_date - 60, now() - interval '60 days'
      from public.internet_plans where plan_name = 'G1_P750' and tenant_id = '${ID.tenant}';
  `)
}

/** Adds a bill and returns its id. */
export async function addBill(db, { client = ID.c1, billId, amount = 750, dueOffset = 3, status = 'Unpaid', periodStartOffset = -27 }) {
  const { rows } = await db.query(
    `insert into public.billing (tenant_id, client_id, bill_id, status, bill_type, bill_date, due_date, amount_due, original_amount, final_amount, billing_period_start, billing_period_end)
     values ($1, $2, $3, $4, 'Monthly', current_date + $5::int, current_date + $6::int, $7, $7, $7, current_date + $5::int, current_date + $5::int + 29)
     returning id`,
    [ID.tenant, client, billId, status, periodStartOffset, dueOffset, amount],
  )
  return rows[0].id
}
