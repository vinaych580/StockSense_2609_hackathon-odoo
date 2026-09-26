import type { FilterOption } from '@/components/shared/FilterBar';

// TODO: replace with GET /warehouses, /locations and /categories once D1/D4/D5 land.
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
