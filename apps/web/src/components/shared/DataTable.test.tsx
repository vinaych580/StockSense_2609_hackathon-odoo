import type { ListResponse } from '@stocksense/shared';
import { useQuery } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { api } from '@/lib/api';
import { useListParams } from '@/lib/listParams';
import { manager, mockApi, renderWithProviders } from '@/test/render';

import { type Column, DataTable } from './DataTable';

interface Row {
  id: string;
  reference: string;
  qty: string;
}

const columns: Column<Row>[] = [
  { id: 'reference', header: 'Reference', sortKey: 'reference', cell: (r) => <span className="ref">{r.reference}</span> },
  { id: 'qty', header: 'Quantity', align: 'right', cell: (r) => `${r.qty} units` },
];
const rows: Row[] = [
  { id: '1', reference: 'WH1/IN/00001', qty: '5' },
  { id: '2', reference: 'WH1/IN/00002', qty: '12' },
];
const base = { columns, getRowId: (r: Row) => r.id, 'aria-label': 'Receipts' };

describe('DataTable states', () => {
  it('shows skeleton rows while loading', () => {
    render(<DataTable {...base} isLoading skeletonRows={3} />);
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(3);
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
  });

  it('shows the empty message', () => {
    render(<DataTable {...base} rows={[]} emptyMessage="No receipts match these filters." />);
    expect(screen.getByText('No receipts match these filters.')).toBeInTheDocument();
  });

  it('shows the error with Retry', async () => {
    const onRetry = vi.fn();
    render(<DataTable {...base} error={new Error('boom')} errorMessage="Couldn't load receipts." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load receipts.");
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('renders rows through the cell renderers', () => {
    render(<DataTable {...base} rows={rows} />);
    const body = screen.getAllByRole('rowgroup')[1]!;
    expect(within(body).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('12 units')).toBeInTheDocument();
  });

  it('keeps rows visible while refetching', () => {
    render(<DataTable {...base} rows={rows} isFetching />);
    expect(screen.getByText('WH1/IN/00001')).toBeInTheDocument();
    expect(screen.queryByTestId('skeleton-row')).not.toBeInTheDocument();
  });
});

describe('DataTable sorting and paging', () => {
  it('sorts descending first, then toggles, and marks aria-sort', async () => {
    const onSortChange = vi.fn();
    const { rerender } = render(<DataTable {...base} rows={rows} onSortChange={onSortChange} />);
    const user = userEvent.setup();

    expect(screen.getByRole('columnheader', { name: /Reference/ })).toHaveAttribute('aria-sort', 'none');
    await user.click(screen.getByRole('button', { name: /Reference/ }));
    expect(onSortChange).toHaveBeenLastCalledWith('-reference');

    rerender(<DataTable {...base} rows={rows} sort="-reference" onSortChange={onSortChange} />);
    expect(screen.getByRole('columnheader', { name: /Reference/ })).toHaveAttribute('aria-sort', 'descending');
    await user.click(screen.getByRole('button', { name: /Reference/ }));
    expect(onSortChange).toHaveBeenLastCalledWith('reference');

    // Columns without a sortKey aren't buttons.
    expect(screen.queryByRole('button', { name: /Quantity/ })).not.toBeInTheDocument();
  });

  it('shows the range and pages within bounds', async () => {
    const onPageChange = vi.fn();
    const { rerender } = render(<DataTable {...base} rows={rows} page={{ page: 1, pageSize: 25, total: 33 }} onPageChange={onPageChange} />);
    const user = userEvent.setup();

    expect(screen.getByText('1–25 of 33')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    rerender(<DataTable {...base} rows={rows} page={{ page: 2, pageSize: 25, total: 33 }} onPageChange={onPageChange} />);
    expect(screen.getByText('26–33 of 33')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});

/** How a list page wires it: URL params → useQuery → DataTable. */
function ReceiptsList() {
  const { page, pageSize, sort, setPage, setSort } = useListParams({ defaultSort: '-createdAt' });
  const query = useQuery({
    queryKey: ['operations', { page, pageSize, sort }],
    queryFn: () => api.list<Row>('/operations', { type: 'RECEIPT', page, pageSize, sort }),
    retry: false,
  });
  return (
    <DataTable
      {...base}
      rows={query.data?.data}
      page={query.data?.page}
      sort={sort}
      onSortChange={setSort}
      onPageChange={setPage}
      isLoading={query.isPending}
      isFetching={query.isFetching}
      error={query.error}
      onRetry={() => void query.refetch()}
    />
  );
}

describe('DataTable with useListParams and useQuery', () => {
  it('loads, shows a failure, retries and follows sort and page in the URL', async () => {
    let fail = true;
    const list = (): [number, ListResponse<Row> | unknown] =>
      fail
        ? [500, { error: { code: 'INTERNAL', message: 'db down' } }]
        : [200, { data: rows, page: { page: 1, pageSize: 25, total: 30 } }];
    const fetchMock = mockApi({ 'GET /auth/me': [200, { data: manager }], 'GET /operations': list });
    renderWithProviders(<ReceiptsList />, '/operations/receipts');
    const user = userEvent.setup();

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('WH1/IN/00001')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/operations/receipts?page=2');
    await user.click(screen.getByRole('button', { name: /Reference/ }));
    // A new sort goes back to page 1.
    expect(screen.getByTestId('location')).toHaveTextContent('/operations/receipts?sort=-reference');
    const lastUrl = String(fetchMock.mock.calls.at(-1)?.[0]);
    expect(lastUrl).toContain('sort=-reference');
    expect(lastUrl).toContain('page=1');
  });
});
