export type Warehouse = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  isActive: boolean;
};

export type Location = {
  id: string;
  warehouseId: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
};

export type Contact = {
  id: string;
  name: string;
  kind: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
};

export const WAREHOUSE_STUBS: Warehouse[] = [
  {
    id: 'wh-001',
    code: 'WH1',
    name: 'Main Warehouse',
    address: 'ACE Engineering College',
    isActive: true,
  },
  {
    id: 'wh-002',
    code: 'WH2',
    name: 'Secondary Warehouse',
    address: 'Hyderabad',
    isActive: true,
  },
];

export const LOCATION_STUBS: Location[] = [
  {
    id: 'loc-001',
    warehouseId: 'wh-001',
    code: 'STOCK',
    name: 'Stock',
    type: 'INTERNAL',
    isActive: true,
  },
  {
    id: 'loc-002',
    warehouseId: 'wh-001',
    code: 'RACK-A',
    name: 'Rack A',
    type: 'INTERNAL',
    isActive: true,
  },
  {
    id: 'loc-003',
    warehouseId: 'wh-001',
    code: 'RACK-B',
    name: 'Rack B',
    type: 'INTERNAL',
    isActive: true,
  },
  {
    id: 'loc-004',
    warehouseId: 'wh-001',
    code: 'PROD',
    name: 'Production Floor',
    type: 'INTERNAL',
    isActive: true,
  },
  {
    id: 'loc-005',
    warehouseId: 'wh-002',
    code: 'STOCK',
    name: 'Stock',
    type: 'INTERNAL',
    isActive: true,
  },
  {
    id: 'loc-006',
    warehouseId: 'wh-002',
    code: 'COLD',
    name: 'Cold Room',
    type: 'INTERNAL',
    isActive: true,
  },
];

export const CONTACT_STUBS: Contact[] = [
  {
    id: 'contact-001',
    name: 'ABC Suppliers',
    kind: 'SUPPLIER',
    email: 'supplier@example.com',
    phone: '9876543210',
    address: 'Hyderabad',
    isActive: true,
  },
  {
    id: 'contact-002',
    name: 'XYZ Customer',
    kind: 'CUSTOMER',
    email: 'customer@example.com',
    phone: '9123456780',
    address: 'Hyderabad',
    isActive: true,
  },
];