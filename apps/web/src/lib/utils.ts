import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { UOM_DECIMALS, type Uom } from '@stocksense/shared';
import type { ProductStock } from './domain';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Where to go after log-in: only paths on this site, never `//other.host` or a full URL. */
export function safeNext(next: string | null | undefined, fallback = '/') {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}

const UOM_LABEL: Record<Uom, string> = { UNIT: 'units', BOX: 'boxes', KG: 'kg', L: 'L', M: 'm' };
export const uomLabel = (uom: Uom) => UOM_LABEL[uom];

/** "12.500" -> "12.5", grouped, at most the unit's decimals. */
export function fmtQty(value: string | number | null | undefined, uom?: Uom) {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'number' ? value : Number(value);
  const max = uom ? UOM_DECIMALS[uom] : 3;
  return n.toLocaleString('en-IN', { maximumFractionDigits: max });
}

export function fmtDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/**
 * One-click Replenish: a new receipt pre-filled to bring the product back up to its rule's maximum
 * in that rule's warehouse, counting what is already on its way (forecast, not on hand).
 * Null when incoming stock already covers it.
 */
export function replenishHref(p: ProductStock): string | null {
  if (!p.isActive || p.health === 'OK') return null;
  const rule = p.lowRule ?? p.rules[0] ?? null;
  const forecast = rule ? (p.wh[rule.warehouseId]?.forecast ?? 0) : p.forecast;
  const want = rule ? Number(rule.maxQty) - forecast : Math.max(-forecast, 0);
  if (rule && want <= 0) return null;
  const q = new URLSearchParams({ product: p.id });
  if (want > 0) q.set('qty', String(Number(want.toFixed(3))));
  if (rule) q.set('warehouse', rule.warehouseId);
  return `/receipts/new?${q}`;
}

export function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  return fmtDate(iso);
}
