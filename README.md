# StockSense

Multi-warehouse inventory management for the Odoo hackathon. Every stock change is a validated
document (receipt, delivery, transfer, adjustment) that posts to an append-only stock ledger.

**New to the team? Read [docs/TEAM_GUIDE.md](docs/TEAM_GUIDE.md) first:** setup, who owns what, contracts and git rules.

## Setup

Needs Node 22+ and pnpm 10 (`npm i -g pnpm@10`). No Docker required.

```bash
pnpm install
cp .env.example apps/api/.env
pnpm db:start          # PostgreSQL 16 on :5433 from node_modules (leave it running)
pnpm db:reset          # in a second terminal: migrate + seed the demo data
pnpm verify            # typecheck + all tests
```

With Docker you can use `docker compose up -d` instead of `pnpm db:start` (same port, also runs Mailpit).
Tests start the embedded Postgres by themselves if nothing is listening on :5433.

| Command | What it does |
| --- | --- |
| `pnpm db:start` | Embedded Postgres (data in `apps/api/.pgdata`), creates `stocksense` and `stocksense_test` |
| `pnpm db:migrate` | Apply migrations, then restore the virtual locations |
| `pnpm db:seed` | Truncate and reseed (`pnpm --filter @stocksense/api seed:master` for master data only) |
| `pnpm db:reset` | Migrate + seed; same result every time |
| `pnpm db:check` | Ledger reconciliation: every balance equals its moves in minus moves out |

Demo logins (password = `SEED_PASSWORD` in `.env`): `manager@stocksense.test` (Manager),
`staff@stocksense.test` (Staff).

## Layout

```
apps/api/        prisma/ (schema, migrations)   src/inventory/posting.ts (the only stock writer)
                 src/operations/ (state machine) src/seed/   test/
packages/shared/ enums, error codes, transition table, permission map, zod schemas
```

## Stock core (Track A): how it works

- **Ledger + balances.** `stock_move` is append-only (a trigger rejects UPDATE/DELETE);
  `stock_quant` has `CHECK (quantity >= 0)`. Both are written only by `post()` in
  `apps/api/src/inventory/posting.ts`, in the same transaction; a test enforces this.
- **Lock protocol.** Operation row `FOR UPDATE` → products `FOR SHARE` (sorted) → locations
  `FOR SHARE` → create missing balance rows at 0 → every balance key `FOR UPDATE` in one sorted
  order → compute in memory → write. The whole transaction retries on deadlock (up to 3 times,
  then 503 `BUSY_RETRY`); with the sorted order the concurrency tests see zero retries.
- **State machine** (`apps/api/src/operations/service.ts`). Draft → Ready/Waiting → Done, or
  Canceled. Permission is checked on the stored type after the row is locked, then status, then
  version (`STALE_VERSION`). Receipts and adjustments may be validated straight from Draft.
  Deliveries need pick then pack. A repeat Validate by the same user is a 200 replay.
- **Adjustments** record the balance when counted; if stock moved since, Validate returns
  409 `BALANCE_CHANGED` unless `acknowledgeBalanceChange` is sent.

### Service API for the other tracks

```ts
import { createOperation, updateOperation, runAction } from './operations/service';
import { getOperation } from './operations/dto';        // lines include onHand and shortBy (red lines)
import { checkLedger } from './inventory/integrity';    // dashboard "Ledger integrity" card
import { createInTx, runActionInTx } from './operations/service'; // product initial stock, inside your tx

await runAction(actor, id, 'validate', { version, acknowledgeBalanceChange });
// actions: confirm, check-availability, reset-to-draft, pick, unpick, pack, unpack, validate, cancel
```

Errors are `AppError { code, status, message, details }`, with codes and HTTP statuses from
`packages/shared/src/errors.ts`. Events for SSE are published after commit on `bus` in
`apps/api/src/lib/events.ts`.
