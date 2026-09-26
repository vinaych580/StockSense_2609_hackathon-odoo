# StockSense team guide

Read this before you write code. It covers setup, who owns what, what already exists, and the
rules that keep four people from breaking each other's work. The full architecture is in the
plan doc (ask Vinay for the link); this guide is the part you need at the keyboard.

---

## 1. Where we are

| Area | Status |
| --- | --- |
| Monorepo, database, migrations | **Done** (Track A) |
| Stock engine: posting, operations state machine, seed | **Done** (Track A); 42 tests passing |
| Shared contracts: enums, error codes, permissions, transitions, operation schemas and response types | **Done** for operations; master-data and auth schemas still to add |
| Express app, auth, master-data APIs, dashboard, SSE | **Not started** (Track B) |
| Web app (`apps/web`) | **Not started** (Tracks C and D) |
| Operations HTTP routes (`/api/v1/operations`) | **Next for Track A**, as soon as Track B's app skeleton lands |

The Track A code is on branch `feat/a-stock-core`. Until it's merged, branch from it, not `main`.

---

## 2. One-time setup (15 minutes)

You need **Node 22 or newer** and **pnpm 10**. You do **not** need Docker or a Postgres install.

```bash
npm i -g pnpm@10
git clone https://github.com/vinaych580/StockSense_2609_hackathon-odoo.git
cd StockSense_2609_hackathon-odoo
git checkout feat/a-stock-core      # until it's merged into main
pnpm install
cp .env.example apps/api/.env
```

Start the database in its own terminal and **leave it running**:

```bash
pnpm db:start
```

It prints `Postgres 16 running on localhost:5433`. The first run takes about a minute; the data
lives in `apps/api/.pgdata` (ignored by git).

In a second terminal, load the demo data and check everything works:

```bash
pnpm db:reset
pnpm verify
```

You should see `Ledger integrity OK: 29 balances match 39 moves.` and every test passing.

**Using Docker instead?** Run `docker compose up -d` in place of `pnpm db:start`. It uses the same
port (5433) and also starts Mailpit (the local email inbox for OTP codes, at http://localhost:8025).
If you use the embedded database, Mailpit isn't running, so OTP codes print to the API console.

### If setup fails

| Problem | Fix |
| --- | --- |
| `pnpm: command not found` | `npm i -g pnpm@10`, then open a new terminal |
| `db:start` says something is already on port 5433 | A database is already running (Docker, or an earlier `db:start`). That's fine; carry on |
| Windows: Postgres won't start | Don't run the terminal as Administrator; Postgres refuses to run as admin |
| Mac/Linux: Postgres won't start after install | Run `pnpm install` again after pulling (the workspace allows the embedded-postgres setup script) |
| Tests hang or time out | Check `pnpm db:start` is still running; tests also start it themselves if nothing is on 5433 |
| `SEED_PASSWORD` error | You skipped `cp .env.example apps/api/.env` |
| Prisma types missing after someone changes the schema | `pnpm --filter @stocksense/api prisma:generate` |

---

## 3. Everyday commands

| Command | When to use it |
| --- | --- |
| `pnpm db:start` | Every session, in its own terminal |
| `pnpm db:reset` | After pulling a migration or seed change, or when your data is a mess. Always gives the same demo data |
| `pnpm db:check` | Proves every balance matches the ledger. Run it if stock numbers look wrong |
| `pnpm verify` | **Before every PR.** Typecheck and all tests. Must pass |
| `pnpm --filter @stocksense/api test` | API tests only |
| `pnpm --filter @stocksense/shared test` | Shared contract tests only |

### Demo accounts

The password for all of them is `SEED_PASSWORD` in `apps/api/.env`.

| Email | Name | Role |
| --- | --- | --- |
| `manager@stocksense.test` | Priya Sharma | Manager |
| `arjun@stocksense.test` | Arjun Mehta | Manager |
| `staff@stocksense.test` | Neha Kapoor | Staff |
| `rahul@stocksense.test`, `kavya@stocksense.test` | Rahul Verma, Kavya Iyer | Staff |
| `vikram@stocksense.test` | Vikram Rao | Staff, **deactivated** (log-in must be refused) |

### What the seed contains

2 warehouses (WH1 Main: Stock, Rack A, Rack B, Production Floor; WH2 Secondary: Stock, Cold Room),
24 products, 5 categories, 8 contacts (4 suppliers including Azure Interior, 4 customers), and
8 reorder rules. There are 33 documents in every status: 12 receipts, 12 deliveries, 6 transfers
and 3 adjustments, with some Late and some Waiting.

**The dashboard must show:** 22 products in stock, **3 low** (KB-21 Keyboard, BX-30 Cardboard
Box, PT-40 Paint) and **2 out** (CH-24 USB-C Charger, GL-41 Wood Glue). If your dashboard shows
different numbers, your query is wrong, not the seed.

The brief's walkthrough is built in: Steel Rods (SR-01) received 100 kg → moved to WH1/Production
Floor → 20 kg delivered → counted at 77 kg. Open Move History for SR-01 to demo it.

---

## 4. Who owns what

Assign a name to each track at kickoff. Put the strongest backend developer on B, since the
frontend depends on B's endpoints.

### Track A: stock core (Vinay)

**Done:** schema and migrations, `posting.ts`, the operations service, the seed, tests 1–12 and 14.

**Next:**
1. Operations routes: `GET/POST /operations`, `GET/PATCH /operations/:id`,
   `POST /operations/:id/<action>`, plus the list filters. Built on B's skeleton.
2. `GET /stock` and `GET /moves`, if B hasn't started them.
3. Then the M3 list: the ledger integrity card, one-click Replenish, and the Free to use and forecast columns.

### Track B: platform APIs

**Your first PR (aim for the first 60–90 minutes)** is the Express app skeleton, because Track A's
routes and every frontend call wait on it:

- `apps/api/src/app.ts` (the Express 5 app, exported so tests can use it with Supertest) and
  `apps/api/src/server.ts` (starts listening on `:3000`)
- Middleware in `apps/api/src/middleware/`: pino-http with a requestId, JSON body only,
  Origin allowlist, rate limits, **`requireAuth`** (it loads the user from the session on every
  request and sets `req.actor = { id, name, role }`), **`requirePermission(permission)`**, and
  **`validate(zodSchema)`**
- The **error handler**: `AppError` → `{ error: { code, message, details, requestId } }` with
  `err.status`; zod errors → 400 `VALIDATION_FAILED`; Postgres `23505` → 409, `23503` → 422/409,
  `23514` → 409 `INSUFFICIENT_STOCK` (log it at error level; it means the backstop fired); anything
  else → 500 `INTERNAL`
- Auth: sign-up (always STAFF), log-in, `/me`, log-out. Hash passwords with **`@node-rs/argon2`**
  (already installed; the seed uses it, so the demo passwords only verify with it)

**Then:** master-data APIs with archive and restore, product creation with initial stock, the
dashboard KPIs, Move History, OTP reset through Mailpit, and SSE.

- **Initial stock** goes through the stock engine, never a direct insert. Inside one `withTx`:
  `createInTx(tx, actor, { type: 'ADJUSTMENT', sourceLocationId: SYSTEM_LOCATION_IDS.ADJUSTMENT, destLocationId, lines: [{ productId, countedQuantity }] })`,
  then `runActionInTx(tx, ctx, actor, id, 'validate', { version: 0 })`. Note that only Managers
  can validate adjustments.
- **SSE:** subscribe to `bus.on('event', …)` from `apps/api/src/lib/events.ts`. The operations
  service already publishes `data.changed` after every commit.
- **KPIs:** use the exact definitions in the plan doc. The seed numbers above are your test.

### Track C: operations UI

**Your first PR** creates `apps/web`: Vite, React 19, TypeScript, Tailwind, shadcn/ui, React
Router, TanStack Query and React Hook Form. Add a Vite proxy from `/api` to `http://localhost:3000`
and add `"@stocksense/shared": "workspace:*"` as a dependency. Then build the app shell (sidebar,
top bar) and the log-in and sign-up pages with the demo-accounts panel.

**Then:** `OperationForm` and `LinesEditor` (one form for all four types), the operation lists
(list and kanban), the dashboard with filters, and Move History.

- Build against the types in `@stocksense/shared` (`OperationDto`, `OperationActionResponse`,
  `ListResponse`) while the routes are being written. Their shapes won't change.
- **Red lines:** each line of an open delivery or transfer has `onHand` and `shortBy`. When
  `shortBy` isn't null, show the line in red with "needs 10, 4 at WH1/Stock".
- On a 409 `INSUFFICIENT_STOCK`, `error.details` lists exactly which lines are short
  (`ShortLine[]`). Mark those lines red.
- On a 409 `BALANCE_CHANGED`, show both numbers from `error.details` (`ChangedBalance[]`), then
  offer "Post anyway", which resends with `acknowledgeBalanceChange: true`.
- On a 409 `STALE_VERSION`, refetch the document but keep the user's unsaved edits on screen.
- Only show buttons the state machine allows: `canTransition(action, type, status)` from shared.
  Hide buttons the user's role can't use: `canOperate(role, action, type)`.

### Track D: app UI and contracts

**Contracts first:** add the zod schemas the other tracks need to `packages/shared/src/schemas/`:
auth (sign-up, log-in, OTP), products, categories, warehouses, locations, partners, reorder rules,
and the KPI response type. Agree the field names with Track B.

**Then:** the Products pages (list, detail tabs, reorder rules), the Stock page with the quick
count, Settings (warehouses, locations, contacts, users), the OTP reset UI, the profile, the
low-stock badge, and the SSE client with the live indicator and stale banner.

- The quick count on the Stock page is an ADJUSTMENT. A Manager's count validates at once. A Staff
  member's count is created and confirmed, and waits for a Manager to validate it.
- Units come from `UOM_DECIMALS`: UNIT and BOX allow 0 decimals; KG, L and M allow 3. Set the
  quantity input's precision from the product's unit.

---

## 5. Contracts everyone must follow

These are already decided. Don't reinvent them; import them from `@stocksense/shared`.

| Thing | Rule | Where |
| --- | --- | --- |
| Quantities | **Decimal strings** such as `"12.500"`, never JSON numbers. The server uses Prisma `Decimal`, never floats | `quantity.ts` |
| Statuses | `DRAFT → READY` or `WAITING` `→ DONE`, or `CANCELED`. Done and Canceled are final | `transitions.ts` |
| Who can do what | `canOperate(role, action, type)` and `hasPermission(role, permission)`. The UI only hides things; the API enforces them | `permissions.ts` |
| Errors | `{ error: { code, message, details?, requestId } }`. Switch on `code`, never on `message` | `errors.ts` |
| Responses | One item: `{ data }`. Lists: `{ data, page: { page, pageSize, total } }`. Page size is at most 100 | `dto.ts` |
| Versions | Every operation response has `version`. Send it back on every edit or action; a mismatch returns 409 `STALE_VERSION` | `dto.ts` |
| Virtual locations | Fixed ids in `SYSTEM_LOCATION_IDS` (Vendors, Customers, Inventory adjustment) | `enums.ts` |
| References | `WH1/IN/00012` (IN = receipt, OUT = delivery, INT = transfer, ADJ = adjustment). The server assigns them | `enums.ts` |
| Time zone | Dates are stored in UTC. "Late" means scheduled before today in `APP_TIMEZONE` (Asia/Kolkata) and not Done | `apps/api/src/lib/time.ts` |

### Operation endpoints (Track A is building these; frontend can build against them now)

| Method and path | Body | Returns |
| --- | --- | --- |
| `GET /api/v1/operations?type=&status=&warehouseId=&locationId=&categoryId=&search=&dateFrom=&dateTo=&late=&page=&pageSize=&sort=` | | `ListResponse<OperationDto>` |
| `POST /api/v1/operations` | `operationCreateInput` | `ItemResponse<OperationDto>` (a Draft) |
| `GET /api/v1/operations/:id` | | `ItemResponse<OperationDto>` |
| `PATCH /api/v1/operations/:id` | `operationUpdateInput` (full header and lines, plus `version`) | `ItemResponse<OperationDto>` |
| `POST /api/v1/operations/:id/{confirm,check-availability,reset-to-draft,pick,unpick,pack,unpack,validate,cancel}` | `{ version, acknowledgeBalanceChange? }` | `ItemResponse<OperationActionResponse>` |

Validate from Draft works for receipts and adjustments (one click). Deliveries need **pick then pack**
before validate. A repeat validate by the same user returns 200 with `replayed: true`: treat it as success.

---

## 6. Rules that must not be broken

1. **Only `apps/api/src/inventory/posting.ts` writes `stock_move` or `stock_quant`.** A test
   fails the build if anything else does. To change stock, create an operation and validate it.
2. **Never edit a migration that has been applied.** To change the schema: edit `schema.prisma`,
   then inside `apps/api` run `npx prisma migrate dev --create-only --name <what_changed>`. Read the
   generated SQL (add any CHECK constraints or triggers by hand in that file), then run
   `pnpm db:migrate`. Put a schema change in **its own small PR**, merged first, and tell the team to
   run `pnpm install` and `pnpm db:reset` after pulling it.
3. **Stock is never negative.** Don't add "allow negative" flags; the database rejects it anyway.
4. **Nothing is deleted.** Master data is archived and restored. Operations are canceled, not deleted.
5. **Permissions are checked on the server**, and for operations, on the stored type after the row
   is locked. Never trust a type or role sent by the client.
6. **Don't hand-insert demo data.** Change `apps/api/src/seed/` and run `pnpm db:reset`, so everyone
   gets the same data.
7. **Never commit `.env` or `.pgdata`.** Both are already in `.gitignore`.

---

## 7. Git workflow

- **Branch from the latest shared branch:** `feat/a-stock-core` until it's merged, then `main`.
  Name branches `feat/<track>-<thing>`, for example `feat/b-auth`, `feat/c-operation-form`,
  `feat/d-products-page`.
- **Conventional Commits:** `feat(api): …`, `feat(web): …`, `fix(api): …`, `test(api): …`, `chore: …`.
  When pairing, add a `Co-authored-by:` line.
- **Every person opens and merges their own PRs, at least 3 each.** The judges check that every
  member has commits on `main`.
- **Keep PRs under about 400 changed lines.** Merge into main **at least every 90 minutes**.
- **Before opening a PR:** pull the latest main, run `pnpm verify`, and make sure it passes.
- **Review:** PRs that touch `schema.prisma`, `prisma/migrations/`, `posting.ts` or
  `packages/shared` need **a second person's approval before merging**. Other PRs can be merged by
  their author once `pnpm verify` passes, and reviewed afterwards.
- **Squash-merge.** `main` must always run.
- **Changing a shared file** (`packages/shared`, `schema.prisma`)? Say so in the team chat first,
  so two people don't edit the same file at once.
- **Tags:** `v0.1` at G1, `v0.2` at G2, `v0.5` at G3, `v0.9` at feature freeze, `v1.0` for the demo.

```bash
git checkout feat/a-stock-core && git pull
git checkout -b feat/b-auth
git add -A
git commit -m "feat(api): sign-up and log-in with sessions"
git push -u origin feat/b-auth
```

---

## 8. Timeline (8 hours)

| Time | Milestone | Done when |
| --- | --- | --- |
| 0:00–0:20 | Kickoff | Everyone has run setup (section 2) and read this guide |
| → 1:30 | **G1 Foundation** | Express skeleton with auth merged; web shell renders and logs in; `pnpm verify` passes. Tag `v0.1` |
| → 3:30 | **G2 Stock engine in the UI** | Receive → validate → stock shows in the UI; a short delivery shows red lines. Tag `v0.2` |
| → 5:30 | **G3 Complete brief** | Every feature in the brief works end to end on seeded data. Tag `v0.5` |
| 5:30–7:00 | Depth and standout | Work the M3 priority list top down |
| 7:00 | **Feature freeze** | Tag `v0.9`. Bug fixes only from here |
| 7:00–8:00 | Demo prep | README demo script, rehearse twice from a fresh `pnpm db:reset`. Tag `v1.0` |

If G2 slips past 4:00, cut M3 first. Never cut a feature from the brief.

---

## 9. When you're stuck

- **Stock numbers look wrong:** run `pnpm db:check`. If it passes, the ledger is right and your
  query or screen is wrong.
- **"Why did validate fail?"** Read `error.code` and `error.details`; the message says what to do.
- **You need a new error code or permission:** add it to `packages/shared` in its own PR and tell the team.
- **Blocked on another track for more than 15 minutes:** say so in the team chat. Build against
  the shared types, or a stub, and keep moving.
