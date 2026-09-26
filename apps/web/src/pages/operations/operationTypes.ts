import type { OperationType } from '@stocksense/shared';

export interface OperationTypeInfo {
  type: OperationType;
  slug: string;
  title: string;
  /** Singular, lower case: "No receipts match", "New receipt". */
  noun: string;
  plural: string;
  /** Receipts and deliveries have a contact; transfers and adjustments don't. */
  hasPartner: boolean;
  /** Only outgoing documents can wait on stock. */
  canWait: boolean;
}

export const OPERATION_TYPE_INFO: OperationTypeInfo[] = [
  { type: 'RECEIPT', slug: 'receipts', title: 'Receipts', noun: 'receipt', plural: 'receipts', hasPartner: true, canWait: false },
  { type: 'DELIVERY', slug: 'deliveries', title: 'Deliveries', noun: 'delivery', plural: 'deliveries', hasPartner: true, canWait: true },
  { type: 'TRANSFER', slug: 'transfers', title: 'Transfers', noun: 'transfer', plural: 'transfers', hasPartner: false, canWait: true },
  { type: 'ADJUSTMENT', slug: 'adjustments', title: 'Adjustments', noun: 'adjustment', plural: 'adjustments', hasPartner: false, canWait: false },
];

export const infoForType = (type: OperationType) => OPERATION_TYPE_INFO.find((i) => i.type === type)!;
export const infoForSlug = (slug: string | undefined) => OPERATION_TYPE_INFO.find((i) => i.slug === slug);
