import type { PartnerKind, Role, Uom } from '@stocksense/shared';

import type { FilterOption } from '@/components/shared/FilterBar';

// TODO: replace with GET /warehouses, /locations, /categories, /products, /partners and /users once D1/D4/D5/D6 land.
// Until then, filter options come from the seed (apps/api/src/seed/master.ts). Seed ids are UUIDv5 of
// natural keys, so they match any database built with `pnpm db:reset`; records users create won't appear.

interface StubLocation extends FilterOption {
  warehouseId: string;
}

const WAREHOUSES: FilterOption[] = [
  { value: '6a84c851-4c9d-5cae-9b05-c49b36e877b0', label: 'WH1 · Main Warehouse' },
  { value: '08e15f1b-0a8a-5434-a95b-3848f47e3084', label: 'WH2 · Secondary Warehouse' },
];

const [WH1, WH2] = WAREHOUSES.map((w) => w.value) as [string, string];

const LOCATIONS: StubLocation[] = [
  { value: 'b03e4479-2673-51ba-8663-56be4c76f423', label: 'WH1/Stock', warehouseId: WH1 },
  { value: '59c0ae35-6400-5211-9245-97efd658be4e', label: 'WH1/Rack A', warehouseId: WH1 },
  { value: '806dc46e-3144-50ac-9ff7-1fd973fc5067', label: 'WH1/Rack B', warehouseId: WH1 },
  { value: '5110c2af-33dc-5c72-a2c4-12bedaedf00f', label: 'WH1/Production Floor', warehouseId: WH1 },
  { value: '97d0402a-38cc-59cd-a4cc-f2f3144e66c3', label: 'WH2/Stock', warehouseId: WH2 },
  { value: 'ae628e22-6eb5-5242-9fc5-720cda0de779', label: 'WH2/Cold Room', warehouseId: WH2 },
];

const CATEGORIES: FilterOption[] = [
  { value: 'ba48bf6d-d3c2-5a5c-96f8-1675c65269e0', label: 'Raw Materials' },
  { value: '96bd8b7c-9b4c-5546-b188-c25bf2183bbc', label: 'Furniture' },
  { value: '13174f24-dfa2-58b1-adf4-28d0283b1823', label: 'Electronics' },
  { value: '10b7062a-ea57-50bd-8c51-4946ea74d0d2', label: 'Packaging' },
  { value: 'dec4f302-485a-5a52-b20e-36507104e2e2', label: 'Consumables' },
];

export function useWarehouseOptions(): FilterOption[] {
  return WAREHOUSES;
}

/** Internal locations, narrowed to one warehouse when given. */
export function useLocationOptions(warehouseId?: string): FilterOption[] {
  return warehouseId ? LOCATIONS.filter((l) => l.warehouseId === warehouseId) : LOCATIONS;
}

export function useCategoryOptions(): FilterOption[] {
  return CATEGORIES;
}

export interface ProductOption {
  id: string;
  sku: string;
  name: string;
  uom: Uom;
  isActive: boolean;
}

const PRODUCTS: ProductOption[] = [
  { id: '12d635f1-a8fa-5a3a-8912-71e9e08c34a0', sku: 'SR-01', name: 'Steel Rods', uom: 'KG', isActive: true },
  { id: '6ec62e73-1a91-5a68-adc7-f9b722313ad6', sku: 'CW-02', name: 'Copper Wire', uom: 'M', isActive: true },
  { id: '74725736-72bf-5467-a7a4-dbfb52a22886', sku: 'AL-03', name: 'Aluminium Sheet', uom: 'KG', isActive: true },
  { id: '0759d01a-4721-5034-8ca2-da27e96206c8', sku: 'PW-04', name: 'Plywood Board', uom: 'UNIT', isActive: true },
  { id: '5ccb3af9-6a89-52c6-8c13-1add4b4c6e62', sku: 'SC-05', name: 'Screws (box of 500)', uom: 'BOX', isActive: true },
  { id: 'de5f43f5-0364-52e9-9622-9f02953b3df8', sku: 'OC-10', name: 'Office Chair', uom: 'UNIT', isActive: true },
  { id: '6839da27-ada4-5584-bb7b-8c486db51951', sku: 'DK-11', name: 'Desk', uom: 'UNIT', isActive: true },
  { id: '917c1a8d-5f00-5647-94e0-d0b2faeef99e', sku: 'CB-12', name: 'Filing Cabinet', uom: 'UNIT', isActive: true },
  { id: '4dda08ba-5f93-567b-acc0-21cd4dbf2aee', sku: 'BS-13', name: 'Bookshelf', uom: 'UNIT', isActive: true },
  { id: 'a762bfc6-fcf8-590d-926a-257e1b4493bb', sku: 'ST-14', name: 'Stool', uom: 'UNIT', isActive: true },
  { id: '1c68c52b-1f8e-56e7-bd9b-466104183732', sku: 'MN-20', name: 'Monitor 24"', uom: 'UNIT', isActive: true },
  { id: 'aa75aef3-ea4b-5010-99b7-3b4ad10f2424', sku: 'KB-21', name: 'Keyboard', uom: 'UNIT', isActive: true },
  { id: 'a3491404-ecef-58f0-8f52-67197d88866c', sku: 'MS-22', name: 'Mouse', uom: 'UNIT', isActive: true },
  { id: 'f2efd61c-d829-565a-929b-be0e35388377', sku: 'LP-23', name: 'Desk Lamp', uom: 'UNIT', isActive: true },
  { id: 'aea5cbba-637a-51cd-a9ad-1cdc9200ee5a', sku: 'CH-24', name: 'USB-C Charger', uom: 'UNIT', isActive: true },
  { id: '583b1834-f5f7-5990-9b71-4c3525c0470f', sku: 'BX-30', name: 'Cardboard Box', uom: 'UNIT', isActive: true },
  { id: 'a3eeab4f-85be-57aa-813b-69a127975bdd', sku: 'TP-31', name: 'Packing Tape', uom: 'UNIT', isActive: true },
  { id: '6307ae43-dc19-51fb-b9d5-2124f2aed3ce', sku: 'BW-32', name: 'Bubble Wrap', uom: 'M', isActive: true },
  { id: 'a00c77a3-d0a7-5550-9d8d-091c02b0903f', sku: 'PL-33', name: 'Pallet', uom: 'UNIT', isActive: true },
  { id: '37374952-fad9-5e61-bbc5-5d6d4758ab7e', sku: 'PT-40', name: 'Paint', uom: 'L', isActive: true },
  { id: 'ac7cfd89-534d-5841-b199-4503bda4897b', sku: 'GL-41', name: 'Wood Glue', uom: 'L', isActive: true },
  { id: '0cc1c92e-d509-5881-8ec5-2cd5221b1362', sku: 'GV-42', name: 'Work Gloves (box)', uom: 'BOX', isActive: true },
  { id: 'cedda7d3-023e-5af2-bc66-2fce17b6e52b', sku: 'CL-43', name: 'Cleaning Solution', uom: 'L', isActive: true },
  { id: '43cdb63f-df57-5ddf-a861-ec775a902f79', sku: 'SP-44', name: 'Sandpaper (box)', uom: 'BOX', isActive: true },
];

export interface PartnerOption {
  id: string;
  name: string;
  kind: PartnerKind;
}

const PARTNERS: PartnerOption[] = [
  { id: '04aa490c-1c87-5d91-b4bf-a2a4ecc6bb05', name: 'Azure Interior', kind: 'SUPPLIER' },
  { id: '63f9dc95-fa3c-5542-853a-75d629dc2562', name: 'Volt Electronics', kind: 'SUPPLIER' },
  { id: '1a0b719b-f6ee-58b4-befb-e35f8d74cfe0', name: 'Ironclad Metals', kind: 'SUPPLIER' },
  { id: '95a7652e-3232-5e59-ad13-5b910ff82dd8', name: 'PackRight Supplies', kind: 'SUPPLIER' },
  { id: '46277066-e82a-5f78-8d44-89760fce46e1', name: 'Brightdesk Offices', kind: 'CUSTOMER' },
  { id: 'c056c9c7-59bd-556b-adba-7871a1817af0', name: 'Nova Retail', kind: 'CUSTOMER' },
  { id: '36eba393-d49f-59da-99e2-ed67f67038ce', name: 'Greenleaf Studios', kind: 'CUSTOMER' },
  { id: '9fe5b7c4-5cc9-5a50-9962-7fb2403b48c3', name: 'Horizon Coworking', kind: 'CUSTOMER' },
];

export interface UserOption {
  id: string;
  name: string;
  role: Role;
}

/** Active users only: the API refuses an inactive responsible. */
const USERS: UserOption[] = [
  { id: 'a49dc0d0-e3c3-52ee-9b0b-64e3f9b380eb', name: 'Priya Sharma', role: 'MANAGER' },
  { id: 'a37b8312-d3df-5bed-a5a4-0b1aa056ce62', name: 'Arjun Mehta', role: 'MANAGER' },
  { id: '2327f285-c9f8-5dfa-bb50-b32ed0e5cb5b', name: 'Neha Kapoor', role: 'STAFF' },
  { id: '64be76c8-4743-5b12-8e94-a4327467c876', name: 'Rahul Verma', role: 'STAFF' },
  { id: '59da6b6b-ccd8-573b-9af8-428032fdafc6', name: 'Kavya Iyer', role: 'STAFF' },
];

/** Products for line pickers. Archived ones are hidden unless asked for (none are archived in the seed). */
export function useProductOptions({ includeArchived = false }: { includeArchived?: boolean } = {}): ProductOption[] {
  return includeArchived ? PRODUCTS : PRODUCTS.filter((p) => p.isActive);
}

export function usePartnerOptions(kind: PartnerKind | undefined): PartnerOption[] {
  return kind ? PARTNERS.filter((p) => p.kind === kind) : [];
}

export function useUserOptions(): UserOption[] {
  return USERS;
}

/** Internal locations grouped by warehouse, for <optgroup>s. */
export function useInternalLocationGroups(): { warehouse: FilterOption; locations: FilterOption[] }[] {
  return WAREHOUSES.map((warehouse) => ({ warehouse, locations: LOCATIONS.filter((l) => l.warehouseId === warehouse.value) }));
}
