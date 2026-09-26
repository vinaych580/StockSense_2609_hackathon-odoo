/**
 * seed:master — users, warehouses, locations, categories, contacts and products, with no stock.
 * Ids are UUID v5 of a natural key (product:SR-01, warehouse:WH1), so links survive resets.
 */
import { createHash } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import type { Uom } from '@stocksense/shared';
import type { PrismaClient } from '@prisma/client';

const NAMESPACE = '6f1c3a52-9d0e-4b8a-a1f7-2c5e8d4b9a10';

export function seedId(key: string): string {
  const ns = Buffer.from(NAMESPACE.replace(/-/g, ''), 'hex');
  const bytes = createHash('sha1').update(Buffer.concat([ns, Buffer.from(key)])).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const USERS = [
  { key: 'priya', name: 'Priya Sharma', email: 'manager@stocksense.test', role: 'MANAGER', isActive: true },
  { key: 'arjun', name: 'Arjun Mehta', email: 'arjun@stocksense.test', role: 'MANAGER', isActive: true },
  { key: 'neha', name: 'Neha Kapoor', email: 'staff@stocksense.test', role: 'STAFF', isActive: true },
  { key: 'rahul', name: 'Rahul Verma', email: 'rahul@stocksense.test', role: 'STAFF', isActive: true },
  { key: 'kavya', name: 'Kavya Iyer', email: 'kavya@stocksense.test', role: 'STAFF', isActive: true },
  { key: 'vikram', name: 'Vikram Rao', email: 'vikram@stocksense.test', role: 'STAFF', isActive: false },
] as const;

export const WAREHOUSES = [
  {
    code: 'WH1', name: 'Main Warehouse', address: 'Plot 14, MIDC Industrial Area, Pune 411019',
    locations: [['STOCK', 'Stock'], ['RACKA', 'Rack A'], ['RACKB', 'Rack B'], ['PROD', 'Production Floor']],
  },
  {
    code: 'WH2', name: 'Secondary Warehouse', address: '22 Logistics Park, Ahmedabad 382213',
    locations: [['STOCK', 'Stock'], ['COLD', 'Cold Room']],
  },
] as const;

export const CATEGORIES = ['Raw Materials', 'Furniture', 'Electronics', 'Packaging', 'Consumables'] as const;

type P = [sku: string, name: string, category: (typeof CATEGORIES)[number], uom: Uom, unitCost: string];
export const PRODUCTS: P[] = [
  ['SR-01', 'Steel Rods', 'Raw Materials', 'KG', '85.00'],
  ['CW-02', 'Copper Wire', 'Raw Materials', 'M', '12.00'],
  ['AL-03', 'Aluminium Sheet', 'Raw Materials', 'KG', '210.00'],
  ['PW-04', 'Plywood Board', 'Raw Materials', 'UNIT', '950.00'],
  ['SC-05', 'Screws (box of 500)', 'Raw Materials', 'BOX', '120.00'],
  ['OC-10', 'Office Chair', 'Furniture', 'UNIT', '4500.00'],
  ['DK-11', 'Desk', 'Furniture', 'UNIT', '8200.00'],
  ['CB-12', 'Filing Cabinet', 'Furniture', 'UNIT', '6100.00'],
  ['BS-13', 'Bookshelf', 'Furniture', 'UNIT', '3900.00'],
  ['ST-14', 'Stool', 'Furniture', 'UNIT', '1200.00'],
  ['MN-20', 'Monitor 24"', 'Electronics', 'UNIT', '11500.00'],
  ['KB-21', 'Keyboard', 'Electronics', 'UNIT', '1400.00'],
  ['MS-22', 'Mouse', 'Electronics', 'UNIT', '650.00'],
  ['LP-23', 'Desk Lamp', 'Electronics', 'UNIT', '1800.00'],
  ['CH-24', 'USB-C Charger', 'Electronics', 'UNIT', '1100.00'],
  ['BX-30', 'Cardboard Box', 'Packaging', 'UNIT', '35.00'],
  ['TP-31', 'Packing Tape', 'Packaging', 'UNIT', '90.00'],
  ['BW-32', 'Bubble Wrap', 'Packaging', 'M', '25.00'],
  ['PL-33', 'Pallet', 'Packaging', 'UNIT', '700.00'],
  ['PT-40', 'Paint', 'Consumables', 'L', '320.00'],
  ['GL-41', 'Wood Glue', 'Consumables', 'L', '280.00'],
  ['GV-42', 'Work Gloves (box)', 'Consumables', 'BOX', '450.00'],
  ['CL-43', 'Cleaning Solution', 'Consumables', 'L', '150.00'],
  ['SP-44', 'Sandpaper (box)', 'Consumables', 'BOX', '220.00'],
];

export const PARTNERS = [
  { key: 'azure', name: 'Azure Interior', kind: 'SUPPLIER', email: 'orders@azure-interior.test', phone: '+91 20 4000 1100' },
  { key: 'volt', name: 'Volt Electronics', kind: 'SUPPLIER', email: 'sales@volt.test', phone: '+91 22 4100 2200' },
  { key: 'ironclad', name: 'Ironclad Metals', kind: 'SUPPLIER', email: 'supply@ironclad.test', phone: '+91 79 4200 3300' },
  { key: 'packright', name: 'PackRight Supplies', kind: 'SUPPLIER', email: 'hello@packright.test', phone: '+91 80 4300 4400' },
  { key: 'brightdesk', name: 'Brightdesk Offices', kind: 'CUSTOMER', email: 'procure@brightdesk.test', address: '5th Floor, Baner Road, Pune 411045' },
  { key: 'nova', name: 'Nova Retail', kind: 'CUSTOMER', email: 'ops@novaretail.test', address: '18 MG Road, Bengaluru 560001' },
  { key: 'greenleaf', name: 'Greenleaf Studios', kind: 'CUSTOMER', email: 'studio@greenleaf.test', address: '7 Carter Road, Bandra, Mumbai 400050' },
  { key: 'horizon', name: 'Horizon Coworking', kind: 'CUSTOMER', email: 'admin@horizon.test', address: '41 SG Highway, Ahmedabad 380054' },
] as const;

/** Reorder rules: arranged so the dashboard shows 3 low (KB-21, BX-30, PT-40) and 2 out (CH-24, GL-41). */
export const REORDER_RULES: Array<[sku: string, warehouse: string, min: string, max: string]> = [
  ['OC-10', 'WH1', '5', '30'],
  ['SR-01', 'WH1', '50', '300'],
  ['MN-20', 'WH1', '4', '20'],
  ['GV-42', 'WH2', '5', '20'],
  ['KB-21', 'WH1', '10', '40'],
  ['BX-30', 'WH1', '200', '800'],
  ['PT-40', 'WH1', '20', '60'],
  ['CH-24', 'WH1', '10', '30'],
];

export const ids = {
  user: (key: string) => seedId(`user:${key}`),
  warehouse: (code: string) => seedId(`warehouse:${code}`),
  location: (wh: string, code: string) => seedId(`location:${wh}/${code}`),
  category: (name: string) => seedId(`category:${name}`),
  product: (sku: string) => seedId(`product:${sku}`),
  partner: (key: string) => seedId(`partner:${key}`),
};

export async function seedMaster(db: PrismaClient): Promise<void> {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 10) throw new Error('Set SEED_PASSWORD (10+ characters) in apps/api/.env');
  const passwordHash = await hash(password);

  for (const u of USERS) {
    await db.user.create({
      data: { id: ids.user(u.key), name: u.name, email: u.email, role: u.role, isActive: u.isActive, passwordHash },
    });
  }
  for (const w of WAREHOUSES) {
    await db.warehouse.create({
      data: {
        id: ids.warehouse(w.code), code: w.code, name: w.name, address: w.address,
        locations: { create: w.locations.map(([code, name]) => ({ id: ids.location(w.code, code), code, name })) },
      },
    });
  }
  for (const name of CATEGORIES) await db.category.create({ data: { id: ids.category(name), name } });
  for (const [sku, name, category, uom, unitCost] of PRODUCTS) {
    await db.product.create({ data: { id: ids.product(sku), sku, name, uom, unitCost, categoryId: ids.category(category) } });
  }
  for (const p of PARTNERS) {
    const { key, ...data } = p;
    await db.partner.create({ data: { id: ids.partner(key), ...data } });
  }
  for (const [sku, wh, minQty, maxQty] of REORDER_RULES) {
    await db.reorderRule.create({ data: { productId: ids.product(sku), warehouseId: ids.warehouse(wh), minQty, maxQty } });
  }
}
