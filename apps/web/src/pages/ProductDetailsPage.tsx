import { useState } from 'react';
import type { MoveDto, StockRowDto } from '@stocksense/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { PRODUCT_STUBS } from '@/lib/productStub';

type Tab = 'details' | 'stock' | 'reorder' | 'history';

export function ProductDetailsPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [tab, setTab] = useState<Tab>('details');

  const product = PRODUCT_STUBS.find((item) => item.id === id);

  const stockQuery = useQuery({
    queryKey: ['stock', 'product', id],
    queryFn: () =>
      api.list<StockRowDto>('/stock', {
        page: 1,
        pageSize: 100,
        productId: id,
      }),
    enabled: Boolean(id),
  });

  const movesQuery = useQuery({
    queryKey: ['moves', 'product', id],
    queryFn: () =>
      api.list<MoveDto>('/moves', {
        page: 1,
        pageSize: 100,
        productId: id,
      }),
    enabled: Boolean(id),
  });

  if (!product) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Product not found</h1>
        <Button asChild variant="outline">
          <Link to="/products">Back to Products</Link>
        </Button>
      </div>
    );
  }

  const stockRows = stockQuery.data?.data ?? [];
  const moves = movesQuery.data?.data ?? [];

  const totalOnHand = stockRows.reduce(
    (sum, row) => sum + Number(row.onHand),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/products"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← Products
          </Link>

          <h1 className="mt-2 text-2xl font-semibold">{product.name}</h1>

          <p className="font-mono text-sm text-muted-foreground">
            {product.sku}
          </p>
        </div>

        {user?.role === 'MANAGER' && (
          <Button variant="outline">
            Edit Product
          </Button>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b">
        {([
          ['details', 'Details'],
          ['stock', 'Stock by location'],
          ['reorder', 'Reorder rules'],
          ['history', 'History'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`border-b-2 px-4 py-3 text-sm ${
              tab === value
                ? 'border-primary font-medium'
                : 'border-transparent text-muted-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <div className="grid gap-4 md:grid-cols-2">
          <Detail label="SKU" value={product.sku} />
          <Detail label="Name" value={product.name} />
          <Detail
            label="Category"
            value={product.category?.name ?? '—'}
          />
          <Detail label="UOM" value={product.uom} />
          <Detail
            label="Unit cost"
            value={product.unitCost ?? '—'}
          />
          <Detail
            label="Status"
            value={product.isActive ? 'Active' : 'Archived'}
          />
          <Detail
            label="Total on hand"
            value={totalOnHand.toFixed(3)}
          />
        </div>
      )}

      {tab === 'stock' && (
        <div className="overflow-hidden rounded-lg border">
          {stockQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">
              Loading stock...
            </div>
          ) : stockQuery.isError ? (
            <div className="p-6 text-sm text-destructive">
              Could not load stock.
            </div>
          ) : stockRows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No stock records found.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">On hand</th>
                  <th className="px-4 py-3">Outgoing</th>
                  <th className="px-4 py-3">Incoming</th>
                  <th className="px-4 py-3">Free to use</th>
                  <th className="px-4 py-3">Forecast</th>
                </tr>
              </thead>

              <tbody>
                {stockRows.map((row) => (
                  <tr key={row.location.id} className="border-b">
                    <td className="px-4 py-3">{row.location.label}</td>
                    <td className="px-4 py-3">{row.onHand}</td>
                    <td className="px-4 py-3">{row.outgoing}</td>
                    <td className="px-4 py-3">{row.incoming}</td>
                    <td className="px-4 py-3">{row.freeToUse}</td>
                    <td className="px-4 py-3">{row.forecast}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'reorder' && (
        <div className="rounded-lg border p-6">
          <h2 className="font-medium">Reorder Rules</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Reorder-rule API is not available in this branch yet.
            This section is ready for the API integration.
          </p>
        </div>
      )}

      {tab === 'history' && (
        <div className="overflow-hidden rounded-lg border">
          {movesQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">
              Loading history...
            </div>
          ) : moves.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No movement history found.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">From</th>
                  <th className="px-4 py-3">To</th>
                  <th className="px-4 py-3">Quantity</th>
                </tr>
              </thead>

              <tbody>
                {moves.map((move) => (
                  <tr key={move.id} className="border-b">
                    <td className="px-4 py-3">
                      {new Date(move.doneAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">{move.reference}</td>
                    <td className="px-4 py-3">{move.from.label}</td>
                    <td className="px-4 py-3">{move.to.label}</td>
                    <td className="px-4 py-3">{move.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-medium">{value}</div>
    </div>
  );
}