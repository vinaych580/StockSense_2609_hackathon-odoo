import { Link } from 'react-router';
import type { StockRowDto } from '@stocksense/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useSearchParams } from 'react-router';

import { type Column, DataTable } from '@/components/shared/DataTable';
import { FilterBar, FilterSearch, FilterSelect } from '@/components/shared/FilterBar';
import { api } from '@/lib/api';
import { useFilterParams, useListParams } from '@/lib/listParams';
import { useLocationOptions, useWarehouseOptions } from '@/lib/masterDataStub';

const FILTER_KEYS = ['search', 'warehouseId', 'locationId'] as const;

const columns: Column<StockRowDto>[] = [
  {
    id: 'sku',
    header: 'SKU',
    sortKey: 'sku',
    cell: (row) => <span className="font-mono">{row.product.sku}</span>,
  },
  {
    id: 'product',
    header: 'Product',
    sortKey: 'productName',
    cell: (row) => row.product.name,
  },
  {
    id: 'location',
    header: 'Location',
    cell: (row) => row.location.label,
  },
  {
    id: 'onHand',
    header: 'On Hand',
    align: 'right',
    sortKey: 'onHand',
    cell: (row) => row.onHand,
  },
  {
    id: 'free',
    header: 'Free',
    align: 'right',
    sortKey: 'free',
    cell: (row) => row.freeToUse,
  },
  {
    id: 'forecast',
    header: 'Forecast',
    align: 'right',
    sortKey: 'forecast',
    cell: (row) => row.forecast,
  },
];

export function StockPage() {
  const { page, pageSize, sort, setPage, setSort } = useListParams({
    defaultSort: 'sku',
  });

  const filters = useFilterParams(FILTER_KEYS);
  const warehouses = useWarehouseOptions();
  const locations = useLocationOptions(filters.warehouseId);

  const [, setParams] = useSearchParams();

  // Clear an invalid location when warehouse changes.
  useEffect(() => {
    if (filters.locationId && !locations.some((l) => l.value === filters.locationId)) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete('locationId');
          return next;
        },
        { replace: true },
      );
    }
  }, [filters.locationId, locations, setParams]);

  const query = useQuery({
    queryKey: ['stock', { ...filters, page, pageSize, sort }],
    queryFn: () =>
      api.list<StockRowDto>('/stock', {
        ...filters,
        page,
        pageSize,
        sort,
      }),
    placeholderData: keepPreviousData,
  });

  const filtered = Object.keys(filters).length > 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <span className="eyebrow">Inventory</span>
        <h1 className="text-2xl font-semibold">Stock</h1>
        <p className="text-sm text-muted">
          View stock balances across warehouses and locations.
        </p>
      </header>

      <FilterBar>
        <FilterSearch placeholder="Search SKU or product" />
        <FilterSelect name="warehouseId" label="Warehouse" options={warehouses} />
        <FilterSelect name="locationId" label="Location" options={locations} />
      </FilterBar>

      <DataTable
        aria-label="Stock"
        columns={columns}
        rows={query.data?.data}
        getRowId={(row) => `${row.product.id}-${row.location.id}`}
        page={query.data?.page}
        sort={sort}
        onSortChange={setSort}
        onPageChange={setPage}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyMessage={filtered ? 'No stock matches these filters.' : 'No stock found.'}
        errorMessage="Could not load stock."
      />
    </div>
  );
}