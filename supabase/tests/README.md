# Database tests

Runs the billing / payment / referral SQL in an in-memory Postgres (pglite), so a
change can be proven safe before it touches the live database.

    npm run test:db

`schema/` is a snapshot of the live schema taken on 2026-10-09 (tables, constraints,
indexes, functions, triggers, policies). The migrations in `../migrations` are
applied on top of it, then the suites run.

When the live schema changes (a new migration was applied), refresh the snapshot:
dump the same JSON with a read-only query, then
`node build-schema.mjs <dump.json> schema`. See `build-schema.mjs` for the shape.
