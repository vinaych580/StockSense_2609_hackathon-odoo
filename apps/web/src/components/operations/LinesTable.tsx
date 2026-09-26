import type { OperationDto, ShortLine } from '@stocksense/shared';

import { cn } from '@/lib/utils';

import { shortMessage } from './actions';
import { trimQuantity } from './formSchema';

const OUTGOING = new Set(['DELIVERY', 'TRANSFER']);
const OPEN = new Set(['DRAFT', 'WAITING', 'READY']);

function Qty({ value, uom }: { value: string | null; uom: string }) {
  if (value === null) return <span className="text-muted">—</span>;
  return (
    <span className="font-mono tabular-nums">
      {trimQuantity(value)} <span className="text-[10px] tracking-[0.12em] text-muted uppercase">{uom}</span>
    </span>
  );
}

/**
 * Read-only lines. A line is red when a validate failed for it (INSUFFICIENT_STOCK, whose numbers win)
 * or when the API already reports it short (`shortBy`) on an open outgoing document.
 */
export function LinesTable({ operation: op, shortLines }: { operation: OperationDto; shortLines: Map<string, ShortLine> }) {
  const counted = op.type === 'ADJUSTMENT';
  const done = op.status === 'DONE';
  const showOnHand = OPEN.has(op.status) && (OUTGOING.has(op.type) || counted);

  return (
    <section aria-label="Lines" className="flex flex-col gap-3">
      <h2 className="eyebrow">Lines</h2>
      <div className="overflow-hidden rounded-lg border border-hairline bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="font-mono text-[11px] tracking-[0.12em] text-muted uppercase">
              <th className="h-10 w-10 px-3 text-left font-normal">#</th>
              <th className="px-3 text-left font-normal">Product</th>
              <th className="px-3 text-right font-normal">{counted ? 'Counted' : 'Quantity'}</th>
              {showOnHand && <th className="px-3 text-right font-normal">On hand</th>}
              {done && <th className="px-3 text-right font-normal">Posted</th>}
            </tr>
          </thead>
          <tbody>
            {op.lines.length === 0 && (
              <tr className="border-t border-hairline">
                <td colSpan={5} className="px-3 py-6 text-center text-muted">
                  No lines.
                </td>
              </tr>
            )}
            {op.lines.map((line, i) => {
              const failed = shortLines.get(line.productId);
              const short = failed
                ? shortMessage(failed.requested, failed.available, failed.locationName, line.uom)
                : line.shortBy && line.quantity !== null && line.onHand !== null
                  ? shortMessage(line.quantity, line.onHand, op.source.label, line.uom)
                  : undefined;
              return (
                <tr
                  key={line.id}
                  data-short={short ? 'true' : undefined}
                  className={cn('border-t border-hairline align-top', short && 'bg-danger/5 [&>td:first-child]:border-l-2 [&>td:first-child]:border-l-danger')}
                >
                  <td className="px-3 py-2.5 text-muted tabular-nums">{i + 1}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="ref text-xs text-muted">{line.sku}</span>
                      <span>{line.productName}</span>
                      {!line.productActive && <span className="text-xs text-muted">(archived)</span>}
                    </div>
                    {short && <p className="mt-0.5 text-xs text-danger">{short}</p>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Qty value={counted ? line.countedQuantity : line.quantity} uom={line.uom} />
                  </td>
                  {showOnHand && (
                    <td className={cn('px-3 py-2.5 text-right', short && 'text-danger')}>
                      <Qty value={line.onHand} uom={line.uom} />
                    </td>
                  )}
                  {done && (
                    <td className="px-3 py-2.5 text-right">
                      <Qty value={line.postedQuantity} uom={line.uom} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
