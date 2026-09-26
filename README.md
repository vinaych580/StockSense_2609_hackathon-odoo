# StockSense

Multi-warehouse inventory management (Odoo hackathon). Every stock change is a validated document
(receipt, delivery, internal transfer, adjustment) that posts to an append-only stock ledger, so every
number can be traced back to the documents behind it.

## Run it (no Docker needed)

Needs **Node.js 22+** and **pnpm 10** (`npm i -g pnpm@10`, or `corepack enable`).

```bash
pnpm install
pnpm start
```

`pnpm start` does everything: starts PostgreSQL 16 (bundled, data in `apps/api/.pgdata`), applies
migrations, loads the demo data on first run, starts the local mailbox, the API and the web app, then
opens the browser. Ctrl+C stops everything.

| What | Where |
| --- | --- |
| App | http://localhost:5173 |
| Local inbox (password-reset emails) | http://localhost:8025 |
| API | http://localhost:3000/api/v1 |

Demo logins (password `change-me-demo-pass`, set by `SEED_PASSWORD` in `apps/api/.env`):

- `manager@stocksense.test`: Manager (Priya)
- `staff@stocksense.test`: Staff (Neha)

The log-in page also has one-click demo account buttons.

## Demo walkthrough

1. Log in as the Manager and look at the **Floor** dashboard: KPIs, low and out-of-stock alerts, and ledger integrity.
2. **Stock**: on hand, free to use, and forecast per product and location; open a product to see its moves.
3. **Receipts / Deliveries / Transfers / Adjustments**: create a document, confirm it, pick and pack a delivery, then validate it. Stock never goes negative.
4. **Ledger**: every move, newest first, with its source document.
5. Open a second browser window: changes appear live (SSE), with no refresh.
6. **Forgot password?** on the log-in page: the 6-digit code arrives in the local inbox at http://localhost:8025.
7. **Team** (Managers only): change roles and deactivate users.

## Useful commands

| Command | What it does |
| --- | --- |
| `pnpm start` | Run everything (add `--no-open` to skip opening the browser) |
| `pnpm db:reset` | Restore the demo data (run while `pnpm start` is running) |
| `pnpm db:check` | Ledger reconciliation check |
| `pnpm verify` | Typecheck and run all tests |

## Troubleshooting

- **"Port 3000/5173 is already in use"**: StockSense is already running in another terminal, or another program is using that port. Close it.
- **Windows: the database won't start**: install the Microsoft Visual C++ Redistributable (x64) and try again.
- **Start over completely**: stop the app, delete `apps/api/.pgdata`, then run `pnpm start`.

## Stack

TypeScript monorepo (pnpm): Express 5 + Prisma + PostgreSQL (`apps/api`), React 19 + Vite + Tailwind
(`apps/web`), shared zod schemas (`packages/shared`).
