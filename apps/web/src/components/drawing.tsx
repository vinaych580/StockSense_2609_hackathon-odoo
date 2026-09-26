/**
 * The drawing grammar. Every screen is a sheet; these are its standard parts:
 * title block, revision cloud, delta flag, item balloon, process line, status lettering,
 * and the stock dimension, which draws a product's quantities to scale.
 */
import type { OperationDto, OperationStatus } from '@stocksense/shared';
import { Check } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { HEALTH_LABEL, STATUS_LABEL, sheetNo, stepsFor, type Health } from '@/lib/domain';
import { cn, fmtQty, uomLabel } from '@/lib/utils';
import type { Uom } from '@stocksense/shared';

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const box = e!.contentRect;
      setSize((s) => (s.w === box.width && s.h === box.height ? s : { w: box.width, h: box.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

// ─── Title block ────────────────────────────────────────────────────────────────────────────

export interface TitleCell {
  caption: string;
  value: ReactNode;
  alarm?: boolean;
  wide?: boolean;
}

/**
 * The page header, drawn as a title block: sheet number, title, the record's facts in captioned cells,
 * and the one next action this sheet asks for.
 */
export function TitleBlock({ sheet, title, sub, cells = [], next, className }: {
  sheet: number | string;
  title: ReactNode;
  sub?: ReactNode;
  cells?: TitleCell[];
  next?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('grid border-2 border-ink', next ? 'lg:grid-cols-[auto_minmax(0,1fr)_auto]' : 'lg:grid-cols-[auto_minmax(0,1fr)]', className)}>
      <div className="flex min-w-0 border-b border-ink lg:contents">
        <div className="hidden w-24 shrink-0 flex-col justify-between border-r border-ink px-3 py-2 lg:flex">
          <span className="letter text-2xs text-ink-3">Sheet</span>
          <span className="letter text-xl font-bold leading-none">{typeof sheet === 'number' ? sheetNo(sheet) : sheet}</span>
        </div>
        <div className={cn('flex min-w-0 flex-1 flex-col', next && 'lg:border-r lg:border-ink')}>
          <div className="px-4 pb-3 pt-2.5">
            <span className="letter float-right ml-3 mt-1 border border-ink px-1.5 text-xs font-bold lg:hidden">{typeof sheet === 'number' ? sheetNo(sheet) : sheet}</span>
            <h1 className="text-balance text-2xl font-semibold leading-tight tracking-[-0.01em] sm:text-3xl">{title}</h1>
            {sub && <div className="mt-1 max-w-[70ch] text-ink-2">{sub}</div>}
          </div>
          {cells.length > 0 && (
            <dl className="mt-auto grid grid-cols-2 border-t border-ink sm:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]">
              {cells.map((c) => (
                <div key={c.caption} className={cn('min-w-0 border-b border-r border-rule px-3 py-1.5 last:border-r-0 sm:border-b-0', c.wide && 'col-span-2 sm:col-span-1')}>
                  <dt className="letter text-2xs text-ink-3">{c.caption}</dt>
                  <dd className={cn('truncate font-medium', c.alarm && 'text-red')}>{c.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
      {next && (
        <div className="flex flex-col justify-between gap-2 bg-sheet-2 px-4 py-2.5 lg:min-w-60">
          <span className="letter text-2xs text-ink-3">Next</span>
          <div className="flex flex-wrap items-center gap-2">{next}</div>
        </div>
      )}
    </header>
  );
}

/** A captioned cell outside the title block: a label in the corner, the value below. */
export function Cell({ caption, children, className }: { caption: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 border border-ink px-3 py-1.5', className)}>
      <div className="letter text-2xs text-ink-3">{caption}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Section heading on a sheet: lettering on a pen line, with an optional count and tools on the right. */
export function SectionHead({ title, count, children, id }: { title: string; count?: ReactNode; children?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 pb-2">
      <h2 id={id} className="letter flex items-baseline gap-2 text-md font-bold">
        {title}
        {count !== undefined && <span className="font-medium text-ink-3">{count}</span>}
      </h2>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

// ─── Revision cloud and delta ───────────────────────────────────────────────────────────────

function cloudPath(w: number, h: number, r: number) {
  const pts: [number, number][] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.round(len / (r * 2)));
    for (let i = 1; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
  };
  const [a, b, c, d] = [r, w - r, h - r, r];
  edge(a, d, b, d);
  edge(b, d, b, c);
  edge(b, c, a, c);
  edge(a, c, a, d);
  let path = `M${a},${d}`;
  let prev: [number, number] = [a, d];
  for (const p of pts) {
    const seg = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    path += ` A${(seg * 0.62).toFixed(1)},${(seg * 0.62).toFixed(1)} 0 0 1 ${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    prev = p;
  }
  return path;
}

/** The scalloped red line a checker draws round anything that changed or needs attention. */
export function RevisionCloud({ children, className, tone = 'red', draw = true }: {
  children: ReactNode;
  className?: string;
  tone?: 'red' | 'ink';
  draw?: boolean;
}) {
  const [ref, { w, h }] = useSize<HTMLDivElement>();
  const r = 9;
  const W = w + 2 * r;
  const H = h + 2 * r;
  const len = W * 2 + H * 2;
  return (
    <div className={cn('relative m-[10px] p-[9px]', className)}>
      {w > 0 && (
        <svg className="pointer-events-none absolute -inset-[9px] overflow-visible" width={W + 18} height={H + 18} aria-hidden>
          <path
            d={cloudPath(W + 18, H + 18, r + 3)}
            fill="none"
            stroke={tone === 'red' ? 'var(--red)' : 'var(--ink)'}
            strokeWidth={1.5}
            strokeLinejoin="round"
            style={draw ? { strokeDasharray: len * 1.6, ['--len' as string]: len * 1.6, animation: 'pen 1.1s cubic-bezier(.16,1,.3,1) both' } : undefined}
          />
        </svg>
      )}
      <div ref={ref}>{children}</div>
    </div>
  );
}

/** A revision delta: the numbered triangle that pairs a flagged item with its note. */
export function Delta({ n, className, tone = 'red' }: { n?: number | string; className?: string; tone?: 'red' | 'ink' }) {
  return (
    <svg viewBox="0 0 24 21" className={cn('h-[1.15em] w-[1.3em] shrink-0 overflow-visible', className)} aria-hidden>
      <path d="M12 1.5 L22.5 19.5 H1.5 Z" fill="var(--sheet)" stroke={tone === 'red' ? 'var(--red)' : 'var(--ink)'} strokeWidth="1.6" strokeLinejoin="round" />
      {n !== undefined && (
        <text x="12" y="16.6" textAnchor="middle" fontSize="10" fontWeight="700" fontFamily="var(--font-cond)" fill={tone === 'red' ? 'var(--red)' : 'var(--ink)'}>
          {n}
        </text>
      )}
    </svg>
  );
}

/** An item balloon: the circled number a drawing uses to call out a part or a line. */
export function Balloon({ n, className, active }: { n: number | string; className?: string; active?: boolean }) {
  return (
    <span
      className={cn(
        'letter inline-flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold tracking-normal',
        active ? 'border-ink bg-yellow' : 'border-ink',
        className,
      )}
    >
      {n}
    </span>
  );
}

// ─── Status lettering ───────────────────────────────────────────────────────────────────────

/**
 * Document status, readable without colour: dashed = draft (construction line), red outline = waiting,
 * solid = ready, highlighter + tick = done (checked), struck through = canceled (void).
 */
export function StatusTag({ status, late, className }: { status: OperationStatus; late?: boolean; className?: string }) {
  const open = status !== 'DONE' && status !== 'CANCELED';
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <span
        className={cn(
          'letter inline-flex h-[22px] items-center gap-1 whitespace-nowrap px-1.5 text-xs font-semibold',
          status === 'DRAFT' && 'border border-dashed border-ink-2 text-ink-2',
          status === 'WAITING' && 'border border-red text-red',
          status === 'READY' && 'border border-ink text-ink',
          status === 'DONE' && 'bg-yellow text-ink',
          status === 'CANCELED' && 'text-ink-3 line-through decoration-1',
        )}
      >
        {status === 'DONE' && <Check className="size-3.5" strokeWidth={2.5} aria-hidden />}
        {STATUS_LABEL[status]}
      </span>
      {late && open && (
        <span className="letter inline-flex h-[22px] items-center gap-1 text-xs font-bold text-red">
          <Delta className="h-3.5 w-4" />
          Late
        </span>
      )}
    </span>
  );
}

/** Stock health: red outline = out, red dashed = promised short, hatched = low, plain = in stock. */
export function HealthTag({ health, className }: { health: Health; className?: string }) {
  if (health === 'OK') return <span className={cn('letter text-xs font-medium text-ink-3', className)}>In stock</span>;
  return (
    <span
      className={cn(
        'letter inline-flex h-[22px] items-center whitespace-nowrap px-1.5 text-xs font-semibold',
        health === 'OUT' && 'border border-red bg-red-wash text-red',
        health === 'SHORT' && 'border border-dashed border-red text-red',
        health === 'LOW' && 'hatch border border-ink text-ink',
        className,
      )}
    >
      {HEALTH_LABEL[health]}
    </span>
  );
}

// ─── Process line ───────────────────────────────────────────────────────────────────────────

type Stepish = Pick<OperationDto, 'type' | 'status' | 'pickedAt' | 'packedAt'>;

function positionOf(op: Stepish): number {
  if (op.status === 'DONE') return stepsFor(op.type).length - 1;
  if (op.status === 'DRAFT' || op.status === 'CANCELED') return 0;
  if (op.type === 'DELIVERY') return op.packedAt ? 3 : op.pickedAt ? 2 : 1;
  return 1;
}

/** The document's route drawn as stations on a line; reached stations are filled, the current one is ringed. */
export function ProcessLine({ op, compact }: { op: Stepish; compact?: boolean }) {
  const steps = stepsFor(op.type);
  const at = positionOf(op);
  const canceled = op.status === 'CANCELED';
  const waiting = op.status === 'WAITING';
  const label = canceled ? 'Canceled' : waiting ? 'Waiting for stock' : steps[at]!.label;
  if (compact)
    return (
      <span className="flex items-center" role="img" aria-label={`Progress: ${label}`}>
        {steps.map((s, i) => (
          <span key={s.key} className="flex items-center">
            {i > 0 && <span className={cn('h-px w-3.5', !canceled && i <= at ? 'bg-ink' : 'bg-rule')} />}
            <span
              className={cn(
                'size-2 rounded-full border',
                canceled ? 'border-rule' : i < at ? 'border-ink bg-ink' : i === at ? (waiting ? 'border-red bg-red' : 'border-ink bg-yellow outline outline-1 outline-offset-1 outline-ink') : 'border-ink-3 bg-sheet',
              )}
            />
          </span>
        ))}
      </span>
    );
  return (
    <ol className="flex items-start" aria-label={`Progress: ${label}`}>
      {steps.map((s, i) => {
        const reached = !canceled && i <= at;
        const current = !canceled && i === at;
        return (
          <li key={s.key} aria-current={current ? 'step' : undefined} className="flex min-w-0 items-start">
            {i > 0 && <span className={cn('mt-[13px] h-0 w-6 border-t sm:w-12', reached ? 'border-t-2 border-ink' : 'border-dashed border-ink-3')} />}
            <span className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  'letter flex size-[28px] items-center justify-center rounded-full border text-xs font-bold tracking-normal',
                  current ? (waiting ? 'border-2 border-red text-red' : 'border-2 border-ink bg-yellow') : reached ? 'border-ink bg-ink text-sheet' : 'border-dashed border-ink-3 text-ink-3',
                )}
              >
                {reached && !current ? <Check className="size-3.5" strokeWidth={3} /> : i + 1}
              </span>
              <span className={cn('letter whitespace-nowrap text-2xs font-semibold', current ? (waiting ? 'text-red' : 'text-ink') : 'text-ink-3')}>
                {i === 1 && waiting ? 'Waiting' : s.label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Stock dimension ────────────────────────────────────────────────────────────────────────

function Arrow({ x, y, dir }: { x: number; y: number; dir: 1 | -1 }) {
  return <path d={`M${x},${y} l${7 * dir},-2.6 v5.2 z`} fill="var(--blue)" />;
}

function DimLine({ x0, x1, y, label, below }: { x0: number; x1: number; y: number; label: string; below?: boolean }) {
  if (x1 - x0 < 1) return null;
  const mid = (x0 + x1) / 2;
  const fits = x1 - x0 > label.length * 7 + 24;
  return (
    <g className="dim-line">
      <line x1={x0} x2={x1} y1={y} y2={y} stroke="var(--blue)" strokeWidth="1" />
      <Arrow x={x0} y={y} dir={1} />
      <Arrow x={x1} y={y} dir={-1} />
      <text
        x={fits ? mid : x1 + 8}
        y={below ? y + 15 : y - 5}
        textAnchor={fits ? 'middle' : 'start'}
        fontSize="13"
        fontStyle="italic"
        fontWeight="500"
        fill="var(--blue)"
        fontFamily="var(--font-sans)"
      >
        {label}
      </text>
    </g>
  );
}

/**
 * A product's quantities drawn to scale. The bar is on hand (hatched like a section), the dashed
 * phantom block is what's incoming, the red block is what's promised out; dimension lines give
 * each figure, and chain lines mark the reorder minimum and maximum.
 */
export function StockDimension({ onHand, outgoing, incoming, forecast, min, max, uom }: {
  onHand: number;
  outgoing: number;
  incoming: number;
  forecast: number;
  min?: number;
  max?: number;
  uom: Uom;
}) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const free = onHand - outgoing;
  const span = Math.max(onHand, forecast, onHand + incoming, max ?? 0, min ?? 0, 1) * 1.08;
  const legend = w >= 520;
  const left = 8;
  const right = legend ? w - 150 : w - 80;
  const x = (v: number) => left + (Math.max(0, v) / span) * (right - left);
  const u = uomLabel(uom);
  const q = (v: number) => `${fmtQty(v, uom)} ${u}`;
  const barY = 58;
  const barH = 30;
  return (
    <div ref={ref} className="w-full">
      {w > 0 && (
        <svg width={w} height={188} role="img" aria-label={`On hand ${q(onHand)}, free to use ${q(free)}, incoming ${q(incoming)}, forecast ${q(forecast)}${min !== undefined ? `, reorder at ${q(min)}` : ''}`}>
          <defs>
            <pattern id="sec-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="7" stroke="var(--ink)" strokeWidth="1" opacity="0.55" />
            </pattern>
            <pattern id="out-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
              <line x1="0" y1="0" x2="0" y2="5" stroke="var(--red)" strokeWidth="1.2" />
            </pattern>
          </defs>

          {/* Ground line: zero. */}
          <line x1={left} x2={left} y1={30} y2={barY + barH + 70} stroke="var(--ink)" strokeWidth="1" />

          {/* Reorder rule: chain lines (long-short dash), the drawing convention for a datum. */}
          {min !== undefined && (
            <g>
              <line x1={x(min)} x2={x(min)} y1={22} y2={barY + barH + 14} stroke="var(--red)" strokeWidth="1" strokeDasharray="12 3 2 3" />
              <text x={x(min)} y={16} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--red)" fontFamily="var(--font-cond)" letterSpacing="0.05em">
                MIN {fmtQty(min, uom)}
              </text>
            </g>
          )}
          {max !== undefined && (
            <g>
              <line x1={x(max)} x2={x(max)} y1={22} y2={barY + barH + 14} stroke="var(--ink-3)" strokeWidth="1" strokeDasharray="12 3 2 3" />
              <text x={x(max)} y={16} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink-2)" fontFamily="var(--font-cond)" letterSpacing="0.05em">
                MAX {fmtQty(max, uom)}
              </text>
            </g>
          )}

          {/* On hand: the section. */}
          {onHand > 0 ? (
            <rect x={left} y={barY} width={x(onHand) - left} height={barH} fill="url(#sec-hatch)" stroke="var(--ink)" strokeWidth="2" />
          ) : (
            <text x={left + 8} y={barY + 20} fontSize="13" fontWeight="600" fill="var(--red)" fontFamily="var(--font-cond)" letterSpacing="0.05em">
              NOTHING ON HAND
            </text>
          )}
          {/* Promised out of what's here. */}
          {outgoing > 0 && (
            <rect x={x(Math.max(free, 0))} y={barY + 2} width={Math.max(x(onHand) - x(Math.max(free, 0)), 2)} height={barH - 4} fill="url(#out-hatch)" stroke="var(--red)" strokeWidth="1" />
          )}
          {/* Incoming: phantom lines, where the stock will be. */}
          {incoming > 0 && (
            <rect x={x(onHand)} y={barY} width={x(onHand + incoming) - x(onHand)} height={barH} fill="none" stroke="var(--ink-2)" strokeWidth="1" strokeDasharray="10 3 2 3 2 3" />
          )}

          <DimLine x0={x(0)} x1={x(onHand)} y={barY - 14} label={`On hand ${q(onHand)}`} />
          <DimLine x0={x(0)} x1={x(Math.max(free, 0))} y={barY + barH + 20} label={`Free ${q(free)}`} below />
          <DimLine x0={x(0)} x1={x(Math.max(forecast, 0))} y={barY + barH + 56} label={`Forecast ${q(forecast)}`} below />
          {/* Extension lines down to the lower dimensions. */}
          {free > 0 && <line x1={x(free)} x2={x(free)} y1={barY + barH + 2} y2={barY + barH + 26} stroke="var(--blue)" strokeWidth="0.75" />}
          {forecast > 0 && <line x1={x(forecast)} x2={x(forecast)} y1={barY + barH + 2} y2={barY + barH + 62} stroke="var(--blue)" strokeWidth="0.75" />}

          {/* Legend, lettered in the margin. */}
          {legend && <g fontFamily="var(--font-cond)" fontSize="11" letterSpacing="0.05em" fill="var(--ink-2)" fontWeight="600">
            <rect x={right + 30} y={40} width={16} height={10} fill="url(#sec-hatch)" stroke="var(--ink)" />
            <text x={right + 52} y={49}>ON HAND</text>
            <rect x={right + 30} y={60} width={16} height={10} fill="url(#out-hatch)" stroke="var(--red)" />
            <text x={right + 52} y={69}>PROMISED OUT</text>
            <rect x={right + 30} y={80} width={16} height={10} fill="none" stroke="var(--ink-2)" strokeDasharray="4 2" />
            <text x={right + 52} y={89}>INCOMING</text>
            <line x1={right + 30} x2={right + 46} y1={105} y2={105} stroke="var(--red)" strokeDasharray="6 2 1 2" />
            <text x={right + 52} y={109}>REORDER MIN</text>
          </g>}
        </svg>
      )}
    </div>
  );
}

/** The checker's stamp: a highlighted tick-and-word that says a figure was verified. */
export function Checked({ children, tone = 'ok' }: { children: ReactNode; tone?: 'ok' | 'bad' }) {
  return tone === 'ok' ? (
    <span className="letter inline-flex items-center gap-1.5 bg-yellow px-2 py-0.5 text-sm font-bold">
      <Check className="size-4" strokeWidth={3} aria-hidden />
      {children}
    </span>
  ) : (
    <span className="letter inline-flex items-center gap-1.5 border border-red px-2 py-0.5 text-sm font-bold text-red">
      <Delta className="h-3.5 w-4" />
      {children}
    </span>
  );
}
