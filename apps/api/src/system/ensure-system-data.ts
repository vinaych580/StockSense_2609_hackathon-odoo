import { SYSTEM_LOCATION_IDS } from '@stocksense/shared';
import type { PrismaClient } from '@prisma/client';
import type { Tx } from '../lib/db';

const VIRTUAL_LOCATIONS = [
  { id: SYSTEM_LOCATION_IDS.VENDOR, code: 'VENDORS', name: 'Vendors', type: 'VENDOR' },
  { id: SYSTEM_LOCATION_IDS.CUSTOMER, code: 'CUSTOMERS', name: 'Customers', type: 'CUSTOMER' },
  { id: SYSTEM_LOCATION_IDS.ADJUSTMENT, code: 'ADJUST', name: 'Inventory adjustment', type: 'ADJUSTMENT' },
] as const;

/**
 * Upserts the three virtual locations with their fixed ids. Runs after migrations, at the
 * start of the seed and after every test truncate, so a truncate never loses system data.
 */
export async function ensureSystemData(db: PrismaClient | Tx): Promise<void> {
  for (const l of VIRTUAL_LOCATIONS) {
    await db.location.upsert({
      where: { id: l.id },
      create: { id: l.id, code: l.code, name: l.name, type: l.type, isActive: true },
      update: { isActive: true, type: l.type },
    });
  }
}
