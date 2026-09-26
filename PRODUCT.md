# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React 19 + Vite + Tailwind CSS v4 + shadcn/ui (Radix), TanStack Query, React Router 7, react-hook-form + zod using the shared schemas in `packages/shared`. Frontend lives in `apps/web` (rebuilt from scratch on 2026-09-26; the earlier version is in git history). 21st.dev components may be used as design sources. Backend: Express 5 + Prisma + PostgreSQL in `apps/api`, SSE for live events.

## Users

- **Warehouse staff** (Staff role): on desktop at a warehouse, processing documents all day: receiving goods, picking and packing deliveries, moving stock between locations, counting stock.
- **Warehouse managers** (Manager role): oversee stock health across warehouses, manage master data (products, warehouses, locations, contacts, reorder rules), validate and cancel documents, act on low/out-of-stock.
- Secondary: Odoo hackathon judges, who experience the product through a short guided demo (seeded data and the Steel Rods SR-01 walkthrough).

## Product Purpose

StockSense is multi-warehouse inventory management where every stock change is a validated document (receipt, delivery, internal transfer, adjustment) that posts to an append-only stock ledger. Success: operators move goods quickly without errors, stock never goes negative, and anyone can see exactly why a number is what it is.

## Positioning

**Every number is provable.** Balances are derived from an append-only move ledger that the system continuously reconciles, so the UI can show a live "ledger integrity" proof and trace any quantity back to the documents that produced it. Supporting proof points:
- **Live floor:** documents and stock update on every open screen in real time (SSE), no refresh.
- **Proactive stock health:** low/out-of-stock, free-to-use and forecast quantities, and one-click Replenish surface problems before they bite.
- **Fast for operators:** keyboard-first flows (command palette, shortcuts) for people processing many documents.

## Operating Context

- Document lifecycle: Draft → Ready / Waiting → Done, or Canceled. Deliveries require pick then pack (checklist on Ready); receipts and adjustments may be validated straight from Draft. References like `WH1/IN/00001`.
- Adjustments record the balance when counted; if stock moved since, validation warns (`BALANCE_CHANGED`) and needs acknowledgement.
- Concurrency is real: stale edits return `STALE_VERSION`; insufficient stock returns `INSUFFICIENT_STOCK`. The UI must explain these, not hide them.
- Locations: warehouses contain internal locations (e.g. WH1 Stock, Rack A, Rack B, Production Floor; WH2 Stock, Cold Room) plus virtual supplier/customer/adjustment locations.
- Auth: log-in, sign-up (always Staff), OTP password reset (Mailpit locally), cookie sessions. Deactivated users are refused.

## Capabilities and Constraints

- Available API: auth, `/api/v1/operations` (list filters, all actions: confirm, check-availability, reset-to-draft, pick, unpick, pack, unpack, validate, cancel), `GET /stock` (on hand, free to use, forecast), `GET /moves`.
- API done, UI pending: master-data CRUD with archive/restore, product creation with initial stock, CSV product import, OTP reset, `GET /dashboard` (KPIs + low-stock alerts), ledger integrity (`GET /dashboard/integrity`), SSE (`GET /events`), users admin, profile (name, password).
- Not built yet: one-click Replenish.
- Stock is never negative. No reservations. Permissions per role come from `packages/shared`.
- Units of measure include decimals (e.g. kg); a product's unit locks once it appears on any operation line.
- Time box: 8-hour hackathon, team of 3–4. Scope is tiered Core → Depth → Standout, not cut.

## Brand Commitments

- Name: **StockSense**. The team wants its own visual identity, not a copy of the provided Excalidraw mockup (the mockup is a flow reference only).

## Evidence on Hand

- Deterministic seed: 2 warehouses, 24 products, 5 categories, 8 contacts (4 suppliers incl. Azure Interior, 4 customers), 8 reorder rules, 33 documents across every status (some Late, some Waiting).
- Expected dashboard truth: 22 products in stock, 3 low (KB-21 Keyboard, BX-30 Cardboard Box, PT-40 Paint), 2 out (CH-24 USB-C Charger, GL-41 Wood Glue).
- Demo users: Priya Sharma, Arjun Mehta (Managers); Neha Kapoor, Rahul Verma, Kavya Iyer (Staff); Vikram Rao (deactivated).
- No testimonials, customers, or metrics exist; do not fabricate any.

## Product Principles

1. **Show the why behind every number.** Any quantity should be one step from its moves and source documents.
2. **Prevent errors before explaining them.** Surface shortages, stale data and balance changes inline, in plain language, before the user commits.
3. **The present is live.** Never make an operator refresh to trust what they see.
4. **Speed for repeat work.** Optimise the flows staff run dozens of times a day: keyboard, sensible defaults, minimal clicks.
5. **Role-aware, not role-cluttered.** Staff see what they can act on; managers get oversight without a separate app.

## Accessibility & Inclusion

Target WCAG 2.1 AA: keyboard operable throughout (a core product principle), visible focus, status never conveyed by colour alone (document states, stock health).
