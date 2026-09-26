import * as Dialog from '@radix-ui/react-dialog';
import type { OperationDto } from '@stocksense/shared';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '@/lib/api';
import { SHEETS, TYPE_META, sheetNo } from '@/lib/domain';
import { useProducts } from '@/lib/queries';
import { fmtQty, uomLabel } from '@/lib/utils';
import { HealthTag, StatusTag } from './drawing';

const item =
  'flex cursor-default items-center gap-3 border-b border-rule-2 px-4 py-2 text-base data-[selected=true]:bg-yellow';
const group =
  '[&_[cmdk-group-heading]]:letter [&_[cmdk-group-heading]]:border-b [&_[cmdk-group-heading]]:border-ink [&_[cmdk-group-heading]]:bg-sheet-2 [&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-ink-2';

/** Ctrl/Cmd+K: the drawing index. Jump to any sheet, product record or document. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const products = useProducts();
  const docs = useQuery({
    queryKey: ['palette-docs', search],
    queryFn: () => api.list<OperationDto>('/operations', { search: search || undefined, pageSize: 8 }),
    enabled: open && search.trim().length >= 2,
  });

  const go = (to: string) => {
    onOpenChange(false);
    setSearch('');
    navigate(to);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/25" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[10vh] z-50 w-[min(680px,calc(100vw-24px))] -translate-x-1/2 border-2 border-ink bg-sheet [animation:drop-in_.16s_ease-out]"
        >
          <Dialog.Title className="sr-only">Find anything</Dialog.Title>
          <Command label="Find anything">
            <div className="flex items-center border-b-2 border-ink">
              <span className="letter flex h-12 items-center border-r border-ink px-3 text-2xs font-semibold text-ink-3">Find</span>
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="SKU, product, reference like WH1/OUT, or a sheet"
                className="h-12 w-full bg-transparent px-4 text-lg outline-none placeholder:text-ink-3"
              />
            </div>
            <Command.List className="max-h-[60vh] overflow-y-auto">
              <Command.Empty className="px-4 py-6 text-ink-2">Nothing matches. Try a SKU like SR-01 or a reference like WH1/IN.</Command.Empty>
              <Command.Group heading="Sheets" className={group}>
                {SHEETS.map((s) => (
                  <Command.Item key={s.no} value={`${sheetNo(s.no)} ${s.label}`} className={item} onSelect={() => go(s.path)}>
                    <span className="letter w-12 text-xs font-semibold text-ink-3">{sheetNo(s.no)}</span>
                    <span className="font-medium">{s.label}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              {docs.data && docs.data.data.length > 0 && (
                <Command.Group heading="Documents" className={group} forceMount>
                  {docs.data.data.map((d) => (
                    <Command.Item key={d.id} value={`${d.reference} ${d.partner?.name ?? ''}`} className={item} onSelect={() => go(`/${TYPE_META[d.type].path}/${d.id}`)}>
                      <span className="w-36 shrink-0 font-semibold">{d.reference}</span>
                      <span className="flex-1 truncate text-ink-2">{d.partner?.name ?? `${d.source.label} → ${d.dest.label}`}</span>
                      <StatusTag status={d.status} late={d.isLate} />
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {products.data && (
                <Command.Group heading="Products" className={group}>
                  {products.data.filter((p) => p.isActive).map((p) => (
                    <Command.Item key={p.id} value={`${p.sku} ${p.name}`} className={item} onSelect={() => go(`/stock/${p.id}`)}>
                      <span className="w-16 shrink-0 text-sm font-semibold text-ink-2">{p.sku}</span>
                      <span className="flex-1 truncate">{p.name}</span>
                      {p.health !== 'OK' && <HealthTag health={p.health} />}
                      <span className="w-24 text-right text-sm text-ink-2">{fmtQty(p.onHand, p.uom)} {uomLabel(p.uom)}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
