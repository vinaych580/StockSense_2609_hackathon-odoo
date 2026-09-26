/**
 * seed:stock — every operation, created and validated through the real services, so the ledger
 * and balances reconcile from the first run. Only the seed passes doneAt (spreads Move History
 * over realistic dates). Dates are relative to today, so there are always Late and Waiting documents.
 */
import { SYSTEM_LOCATION_IDS, type OperationType } from '@stocksense/shared';
import type { Actor } from '../inventory/posting';
import { prisma } from '../lib/db';
import { createOperation, runAction, type ActionName } from '../operations/service';
import { ids, USERS } from './master';

type End = 'VENDORS' | 'CUSTOMERS' | 'ADJUST' | `${'WH1' | 'WH2'}/${string}`;
type Target = 'DONE' | 'READY' | 'WAITING' | 'DRAFT' | 'CANCELED' | 'PICKED';

interface Doc {
  type: OperationType;
  from: End;
  to: End;
  partner?: string;
  lines: Array<[sku: string, qty: string]>;
  /** Days from today: when it was done (past) or is scheduled. */
  day: number;
  target: Target;
  by: (typeof USERS)[number]['key'];
  responsible?: (typeof USERS)[number]['key'];
  notes?: string;
}

const loc = (end: End): string => {
  if (end === 'VENDORS') return SYSTEM_LOCATION_IDS.VENDOR;
  if (end === 'CUSTOMERS') return SYSTEM_LOCATION_IDS.CUSTOMER;
  if (end === 'ADJUST') return SYSTEM_LOCATION_IDS.ADJUSTMENT;
  const [wh, code] = end.split('/') as [string, string];
  return ids.location(wh, code);
};

/** In order: validating a document depends on the stock the earlier ones posted. */
export const DOCS: Doc[] = [
  // ── Opening receipts (Done) ──
  { type: 'RECEIPT', from: 'VENDORS', to: 'WH1/STOCK', partner: 'azure', day: -20, target: 'DONE', by: 'neha', responsible: 'priya',
    lines: [['OC-10', '20'], ['DK-11', '8'], ['CB-12', '5'], ['BS-13', '6'], ['ST-14', '15']] },
  { type: 'RECEIPT', from: 'VENDORS', to: 'WH1/STOCK', partner: 'volt', day: -18, target: 'DONE', by: 'rahul',
    lines: [['MN-20', '14'], ['KB-21', '20'], ['MS-22', '30'], ['LP-23', '10'], ['CH-24', '10']] },
  // The brief's walkthrough, step 1: receive 100 kg of steel.
  { type: 'RECEIPT', from: 'VENDORS', to: 'WH1/STOCK', partner: 'ironclad', day: -16, target: 'DONE', by: 'neha',
    lines: [['SR-01', '100'], ['CW-02', '250.5'], ['AL-03', '80'], ['SC-05', '40']], notes: 'Steel for the frames order' },
  // Step 2: move it to the production floor (total unchanged).
  { type: 'TRANSFER', from: 'WH1/STOCK', to: 'WH1/PROD', day: -15, target: 'DONE', by: 'rahul', lines: [['SR-01', '100']] },
  { type: 'RECEIPT', from: 'VENDORS', to: 'WH1/RACKA', partner: 'packright', day: -14, target: 'DONE', by: 'kavya',
    lines: [['BX-30', '500'], ['TP-31', '60'], ['BW-32', '120'], ['PL-33', '25']] },
  // Step 3: deliver 20 kg.
  { type: 'DELIVERY', from: 'WH1/PROD', to: 'CUSTOMERS', partner: 'brightdesk', day: -13, target: 'DONE', by: 'priya', lines: [['SR-01', '20']] },
  { type: 'RECEIPT', from: 'VENDORS', to: 'WH1/RACKB', partner: 'azure', day: -12, target: 'DONE', by: 'neha',
    lines: [['PW-04', '30'], ['PT-40', '40'], ['CL-43', '25'], ['SP-44', '18']] },
  // Step 4: the count finds 77 kg (3 kg damaged).
  { type: 'ADJUSTMENT', from: 'ADJUST', to: 'WH1/PROD', day: -11, target: 'DONE', by: 'priya', lines: [['SR-01', '77']], notes: '3 kg damaged in handling' },
  { type: 'RECEIPT', from: 'VENDORS', to: 'WH2/STOCK', partner: 'packright', day: -10, target: 'DONE', by: 'kavya',
    lines: [['GV-42', '10'], ['CL-43', '12'], ['MS-22', '15']] },

  // ── Done deliveries, transfers and counts that shape today's KPIs ──
  { type: 'DELIVERY', from: 'WH1/STOCK', to: 'CUSTOMERS', partner: 'nova', day: -9, target: 'DONE', by: 'arjun', lines: [['OC-10', '2'], ['DK-11', '1'], ['MN-20', '2']] },
  { type: 'DELIVERY', from: 'WH1/STOCK', to: 'CUSTOMERS', partner: 'horizon', day: -8, target: 'DONE', by: 'priya', lines: [['KB-21', '14']] },
  { type: 'DELIVERY', from: 'WH1/RACKA', to: 'CUSTOMERS', partner: 'greenleaf', day: -7, target: 'DONE', by: 'arjun', lines: [['BX-30', '350']] },
  { type: 'DELIVERY', from: 'WH1/STOCK', to: 'CUSTOMERS', partner: 'brightdesk', day: -6, target: 'DONE', by: 'priya', lines: [['CH-24', '10']] },
  { type: 'TRANSFER', from: 'WH1/STOCK', to: 'WH2/STOCK', day: -5, target: 'DONE', by: 'rahul', lines: [['OC-10', '5'], ['LP-23', '3']], notes: 'Stock for the Ahmedabad showroom' },
  { type: 'DELIVERY', from: 'WH1/RACKB', to: 'CUSTOMERS', partner: 'nova', day: -4, target: 'DONE', by: 'arjun', lines: [['PT-40', '27.5']] },
  { type: 'TRANSFER', from: 'WH1/STOCK', to: 'WH1/RACKB', day: -3, target: 'DONE', by: 'kavya', lines: [['ST-14', '5']] },
  { type: 'ADJUSTMENT', from: 'ADJUST', to: 'WH2/STOCK', day: -2, target: 'DONE', by: 'priya', lines: [['GV-42', '9']], notes: 'One box torn' },

  // ── Open receipts: 3 Ready (1 late), 2 Draft, 1 Canceled ──
  { type: 'RECEIPT', from: 'VENDORS', to: 'WH1/STOCK', partner: 'volt', day: 2, target: 'READY', by: 'priya', responsible: 'neha', lines: [['CH-24', '20']] },
  { type: 'RECEIPT', from: 'VENDORS', to: 'WH1/STOCK', partner: 'volt', day: -1, target: 'READY', by: 'priya', responsible: 'rahul', lines: [['KB-21', '30']] },
  { type: 'RECEIPT', from: 'VENDORS', to: 'WH1/RACKB', partner: 'azure', day: 1, target: 'READY', by: 'arjun', lines: [['GL-41', '10']] },
  { type: 'RECEIPT', from: 'VENDORS', to: 'WH1/RACKB', partner: 'azure', day: 5, target: 'DRAFT', by: 'priya', lines: [['PT-40', '30']] },
  { type: 'RECEIPT', from: 'VENDORS', to: 'WH1/STOCK', partner: 'ironclad', day: 7, target: 'DRAFT', by: 'arjun', lines: [['SR-01', '200']] },
  { type: 'RECEIPT', from: 'VENDORS', to: 'WH1/STOCK', partner: 'ironclad', day: 3, target: 'CANCELED', by: 'priya', lines: [['AL-03', '10']], notes: 'Supplier out of stock' },

  // ── Open deliveries: 2 Ready (1 picked), 2 Waiting (short), 1 Draft, 1 Canceled ──
  { type: 'DELIVERY', from: 'WH1/STOCK', to: 'CUSTOMERS', partner: 'brightdesk', day: 1, target: 'PICKED', by: 'priya', responsible: 'neha', lines: [['OC-10', '3']] },
  { type: 'DELIVERY', from: 'WH1/STOCK', to: 'CUSTOMERS', partner: 'greenleaf', day: -1, target: 'READY', by: 'arjun', responsible: 'kavya', lines: [['DK-11', '2']] },
  { type: 'DELIVERY', from: 'WH1/STOCK', to: 'CUSTOMERS', partner: 'nova', day: 2, target: 'WAITING', by: 'priya', lines: [['MN-20', '20']] },
  { type: 'DELIVERY', from: 'WH1/STOCK', to: 'CUSTOMERS', partner: 'horizon', day: 3, target: 'WAITING', by: 'arjun', lines: [['CH-24', '5'], ['MS-22', '4']] },
  { type: 'DELIVERY', from: 'WH1/STOCK', to: 'CUSTOMERS', partner: 'greenleaf', day: 4, target: 'DRAFT', by: 'priya', lines: [['BS-13', '2']] },
  { type: 'DELIVERY', from: 'WH1/RACKB', to: 'CUSTOMERS', partner: 'nova', day: 2, target: 'CANCELED', by: 'arjun', lines: [['ST-14', '1']] },

  // ── Open transfers: 2 Ready, 1 Draft ──
  { type: 'TRANSFER', from: 'WH1/STOCK', to: 'WH1/RACKA', day: 1, target: 'READY', by: 'rahul', lines: [['MS-22', '10']] },
  { type: 'TRANSFER', from: 'WH2/STOCK', to: 'WH2/COLD', day: 0, target: 'READY', by: 'kavya', lines: [['CL-43', '4']] },
  { type: 'TRANSFER', from: 'WH1/RACKB', to: 'WH2/STOCK', day: 3, target: 'DRAFT', by: 'rahul', lines: [['PW-04', '5']] },

  // ── Open count ──
  { type: 'ADJUSTMENT', from: 'ADJUST', to: 'WH1/RACKA', day: 0, target: 'DRAFT', by: 'kavya', lines: [['TP-31', '58']] },
];

function actorFor(key: Doc['by']): Actor {
  const u = USERS.find((x) => x.key === key)!;
  return { id: ids.user(u.key), name: u.name, role: u.role };
}

function dayAt(offset: number, hour = 10): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export async function seedStock(): Promise<void> {
  const manager = actorFor('priya');
  for (const [i, doc] of DOCS.entries()) {
    const actor = actorFor(doc.by);
    // Receipts and deliveries are planned by a Manager; Staff then receive or pick.
    const planner = doc.type === 'RECEIPT' || doc.type === 'DELIVERY' ? manager : actor;
    const op = await createOperation(planner, {
      type: doc.type,
      sourceLocationId: loc(doc.from),
      destLocationId: loc(doc.to),
      partnerId: doc.partner ? ids.partner(doc.partner) : null,
      responsibleId: doc.responsible ? ids.user(doc.responsible) : null,
      scheduledDate: dayAt(doc.day, 9),
      notes: doc.notes ?? null,
      lines: doc.lines.map(([sku, qty]) =>
        doc.type === 'ADJUSTMENT' ? { productId: ids.product(sku), countedQuantity: qty } : { productId: ids.product(sku), quantity: qty },
      ),
    });

    let version = op.version;
    const step = async (who: Actor, action: ActionName, doneAt?: Date) => {
      const r = await runAction(who, op.id, action, { version }, { doneAt });
      version = r.operation.version;
      return r.operation.status;
    };

    const outgoing = doc.type === 'DELIVERY' || doc.type === 'TRANSFER';
    if (doc.target === 'DRAFT') continue;
    if (doc.target === 'CANCELED') {
      await step(planner, 'cancel');
      continue;
    }
    if (outgoing || doc.target !== 'DONE') {
      const status = await step(planner, 'confirm');
      const expected = doc.target === 'WAITING' ? 'WAITING' : 'READY';
      if (status !== expected) throw new Error(`Seed doc #${i + 1} (${op.reference}) is ${status}, expected ${expected}`);
    }
    if (doc.type === 'DELIVERY' && (doc.target === 'PICKED' || doc.target === 'DONE')) {
      await step(actorFor('neha'), 'pick');
      if (doc.target === 'DONE') await step(actorFor('neha'), 'pack');
    }
    if (doc.target === 'DONE') {
      // Staff receive goods; deliveries and counts are posted by a Manager.
      const validator = doc.type === 'DELIVERY' || doc.type === 'ADJUSTMENT' ? (actor.role === 'MANAGER' ? actor : manager) : actor;
      await step(validator, 'validate', dayAt(doc.day, 11 + (i % 6)));
    }
  }
}

export async function summary() {
  const byStatus = await prisma.operation.groupBy({ by: ['type', 'status'], _count: true, orderBy: [{ type: 'asc' }, { status: 'asc' }] });
  return byStatus.map((r) => `${r.type}/${r.status}: ${r._count}`).join(', ');
}
