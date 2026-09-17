PKC BIZOFT — Adding Admin Users Safely in Supabase

Purpose

This guide explains how to add a new Gmail account as a PKC BIZOFT administrator without disabling or damaging Row Level Security (RLS), and how to make sure the new administrator can see the PKC NetLink client directory.

Important: Do not disable RLS and do not replace or delete the existing clients RLS policies just to add a user.

Current PKC NetLink Tenant

The PKC NetLink tenant ID is:

4eefc34f-5475-4c54-886b-9d833ef3997a

This tenant ID must be used when giving an administrator access to the PKC NetLink client directory.

How the Access System Works

PKC BIZOFT uses two related pieces of information:

Supabase Auth User
       |
       +--> public.profiles
       |       |
       |       +--> role = admin / technician / customer
       |
       +--> public.tenant_users
               |
               +--> tenant_id = PKC NetLink
               +--> role = admin / technician

The important distinction is:

profiles.role determines the user's application role.

tenant_users determines which tenant/ISP data the user can access.

The clients table remains protected by RLS.

Therefore, setting a user to admin alone is not enough for the website client directory. The user also needs membership in the PKC NetLink tenant.

Step 1 — Create the Friend's Account

Have the friend create/sign into their account normally.

After the account exists, open:

Supabase → Authentication → Users

Find the new Gmail account and copy its User UUID.

Example:

friend@gmail.com
UUID: 12345678-....

Do not use the Gmail address as the UUID.

Step 2 — Create/Update the Profile

Open:

Supabase → SQL Editor

Replace:

FRIENDS-AUTH-USER-UUID

friend@gmail.com

with the actual account information.

Run:

INSERT INTO public.profiles (
    id,
    email,
    role
)
VALUES (
    'FRIENDS-AUTH-USER-UUID',
    'friend@gmail.com',
    'admin'
)
ON CONFLICT (id) DO UPDATE
SET
    email = EXCLUDED.email,
    role = 'admin';

This makes the application role:

profiles.role = admin

The profiles_role_check constraint must allow:

customer
technician
admin

Do not remove RLS to accomplish this.

Step 3 — Add the User to PKC NetLink

Use the same Auth User UUID.

Run:

INSERT INTO public.tenant_users (
    user_id,
    tenant_id,
    role
)
SELECT
    'FRIENDS-AUTH-USER-UUID'::uuid,
    '4eefc34f-5475-4c54-886b-9d833ef3997a'::uuid,
    'admin'
WHERE NOT EXISTS (
    SELECT 1
    FROM public.tenant_users
    WHERE user_id = 'FRIENDS-AUTH-USER-UUID'::uuid
      AND tenant_id = '4eefc34f-5475-4c54-886b-9d833ef3997a'::uuid
);

This gives the account:

tenant_users.role = admin
tenant_users.tenant_id = PKC NetLink

The WHERE NOT EXISTS prevents creating another membership for the same user and tenant.

Step 4 — Verify the Account

Before asking the friend to use the website, run:

SELECT
    p.id,
    p.email,
    p.role AS profile_role,
    tu.tenant_id,
    tu.role AS tenant_role
FROM public.profiles p
LEFT JOIN public.tenant_users tu
    ON tu.user_id = p.id
WHERE p.email = 'friend@gmail.com';

The expected result is:

profile_role = admin
tenant_id    = 4eefc34f-5475-4c54-886b-9d833ef3997a
tenant_role  = admin

If all three values are correct, the account has both:

Application admin access.

PKC NetLink tenant access.

Step 5 — Log Out and Sign In Again

Have the new administrator:

Log out of PKC BIZOFT.

Close/reload the app or website if necessary.

Sign back in.

Open the client directory.

The user should be able to see the PKC NetLink clients allowed by the existing RLS policies.

Why This Does Not Damage RLS

Do not run commands such as:

ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY;

and do not delete the clients RLS policies.

The intended security model is:

                         ┌─────────────────────┐
                         │   Supabase Auth     │
                         └──────────┬──────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
           ┌────────────────┐              ┌─────────────────┐
           │    profiles    │              │  tenant_users   │
           │                │              │                 │
           │ role = admin   │              │ PKC NetLink     │
           └────────────────┘              └────────┬────────┘
                                                    │
                                                    ▼
                                           ┌─────────────────┐
                                           │     clients     │
                                           │                 │
                                           │       RLS       │
                                           └─────────────────┘

The user is granted access through the existing security model rather than making the client table publicly accessible.

Role Structure

The intended application roles are:

Account type

profiles.role

Typical access

Admin

admin

PKC NetLink administration and client directory

Technician

technician

Technician dashboard and assigned work

Customer

customer

Customer dashboard and own account/client data

For a technician, do not automatically use admin in tenant_users.

For example:

UPDATE public.tenant_users
SET role = 'technician'
WHERE user_id = 'TECHNICIAN-UUID'
  AND tenant_id = '4eefc34f-5475-4c54-886b-9d833ef3997a'::uuid;

The user's profiles.role and tenant_users.role should normally agree for staff accounts.

Existing PKC NetLink Admin Setup

The current administrator accounts are:

cysprinx@gmail.com
louismartinering@gmail.com
pkc.netlink.biz@gmail.com

The current non-admin accounts include:

princeajycuyos@gmail.com    → customer
princeajycuyos28@gmail.com  → technician

Keep customer and technician roles unchanged unless there is a deliberate role change.

Troubleshooting

Error: "This account is authenticated but has no tenant membership"

This usually means the account exists in Supabase Auth and may have:

profiles.role = admin

but does not have a corresponding row in:

public.tenant_users

for the PKC NetLink tenant.

Check:

SELECT
    tu.user_id,
    p.email,
    tu.tenant_id,
    tu.role
FROM public.tenant_users tu
JOIN public.profiles p
    ON p.id = tu.user_id
WHERE p.email = 'friend@gmail.com';

The tenant ID should be:

4eefc34f-5475-4c54-886b-9d833ef3997a

Error: "infinite recursion detected in policy for relation clients"

Do not attempt to fix this by disabling RLS.

This indicates a circular relationship between RLS policies, such as a clients policy querying repair_records while a repair_records policy queries clients.

The existing working RLS configuration should be preserved.

If this error returns, stop making policy changes and inspect the current policies before changing anything.

Admin can log in but cannot see clients

Check these in order:

1. Confirm Auth account

Check:

Supabase → Authentication → Users

Make sure the friend is using the expected Gmail account.

2. Confirm profile role

SELECT id, email, role
FROM public.profiles
WHERE email = 'friend@gmail.com';

Expected:

admin

3. Confirm tenant membership

SELECT *
FROM public.tenant_users
WHERE user_id = 'FRIENDS-AUTH-USER-UUID'
  AND tenant_id = '4eefc34f-5475-4c54-886b-9d833ef3997a'::uuid;

Expected:

one PKC NetLink membership
role = admin

4. Log out and sign in again

The application needs a fresh authenticated session.

5. Do not change client RLS immediately

If membership is correct but clients still do not appear, inspect the current authenticated user's UUID and the current RLS policies before changing them.

Security Rules

Never disable RLS on clients.

Never expose the Supabase service-role key in the mobile app or browser.

Use the user's Auth UUID, not their Gmail address, as tenant_users.user_id.

Use the PKC NetLink tenant ID exactly as configured.

Keep customers restricted to their own client/account.

Keep technicians restricted to their assigned work/clients.

Give admin access only to users who should administer the tenant.

After role or tenant changes, log out and sign in again.

Do not delete existing RLS policies just to make a new account work.

If a new account cannot see clients, verify profiles and tenant_users first.

Quick Copy/Paste Checklist

For a new PKC NetLink administrator:

[ ] Friend created Supabase Auth account
[ ] Auth User UUID copied
[ ] public.profiles row exists
[ ] profiles.role = admin
[ ] public.tenant_users row exists
[ ] tenant_users.tenant_id = 4eefc34f-5475-4c54-886b-9d833ef3997a
[ ] tenant_users.role = admin
[ ] Existing clients RLS was NOT disabled
[ ] User logged out and signed in again
[ ] Client directory displays PKC NetLink clients

Recommended Future Improvement

Manual SQL works, but the safer long-term workflow is to build an admin-only user-management screen:

Admin Dashboard
    ↓
Users
    ↓
Add User
    ↓
Gmail
Role: Admin / Technician / Customer
Tenant: PKC NetLink
    ↓
Save

That workflow can manage profiles and tenant_users while leaving the existing RLS protections in place.