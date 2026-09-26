import type { StockRowDto } from '@stocksense/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, isApiError } from '@/lib/api';
import { useLocationOptions } from '@/lib/masterDataStub';

const ADJUSTMENT_LOCATION_ID =
  '00000000-0000-4000-8000-000000000003';

export function QuickCountPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const locations = useLocationOptions();

  const [locationId, setLocationId] = useState(
    locations[0]?.value ?? '',
  );
  const [productId, setProductId] = useState('');
  const [countedQuantity, setCountedQuantity] = useState('');
  const [message, setMessage] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);

  const stockQuery = useQuery({
    queryKey: ['stock', 'quick-count'],
    queryFn: () =>
      api.list<StockRowDto>('/stock', {
        page: 1,
        pageSize: 100,
      }),
  });

  const createAdjustment = useMutation({
    mutationFn: async () => {
      return api.post<{ id: string }>('/operations', {
        type: 'ADJUSTMENT',
        sourceLocationId: ADJUSTMENT_LOCATION_ID,
        destLocationId: locationId,
        lines: [
          {
            productId,
            countedQuantity,
          },
        ],
      });
    },

    onSuccess: async (operation) => {
      setCreatedId(operation.id);
      setMessage(
        user?.role === 'MANAGER'
          ? 'Adjustment created. You can validate it below.'
          : 'Adjustment created and is waiting for Manager validation.',
      );

      setCountedQuantity('');

      await queryClient.invalidateQueries({
        queryKey: ['stock'],
      });
    },

    onError: (error) => {
      if (isApiError(error, 'BALANCE_CHANGED')) {
        setMessage(
          'The stock balance changed while you were counting. Review the current balance and post again if appropriate.',
        );
        return;
      }

      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not create adjustment.',
      );
    },
  });

  const validateAdjustment = useMutation({
    mutationFn: async (id: string) => {
      return api.post(`/operations/${id}/validate`, {});
    },

    onSuccess: async () => {
      setMessage('Adjustment validated successfully.');
      setCreatedId(null);

      await queryClient.invalidateQueries({
        queryKey: ['stock'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['operations'],
      });
    },

    onError: (error) => {
      if (isApiError(error, 'BALANCE_CHANGED'))  {
        setMessage(
          'BALANCE_CHANGED: the stock changed since the count. Review the new balance before posting again.',
        );
        return;
      }

      setMessage(
        error instanceof Error
          ? error.message
          : 'Could not validate adjustment.',
      );
    },
  });

  const rows = stockQuery.data?.data ?? [];

  // Unique products from the stock response.
  const products = rows.filter(
    (row, index, array) =>
      array.findIndex(
        (item) => item.product.id === row.product.id,
      ) === index,
  );

  const selectedProduct = products.find(
    (row) => row.product.id === productId,
  );

  const selectedStock = rows.find(
    (row) =>
      row.product.id === productId &&
      row.location.id === locationId,
  );

  function handleSubmit() {
    setMessage('');
    setCreatedId(null);

    if (!locationId || !productId || countedQuantity === '') {
      setMessage(
        'Select a location, product and enter the counted quantity.',
      );
      return;
    }

    if (Number(countedQuantity) < 0) {
      setMessage('Counted quantity cannot be negative.');
      return;
    }

    createAdjustment.mutate();
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to="/stock"
          className="text-sm text-muted hover:underline"
        >
          ← Back to Stock
        </Link>

        <h1 className="mt-2 text-2xl font-semibold">
          Quick Count
        </h1>

        <p className="text-sm text-muted">
          Record the physical quantity found at a location.
        </p>
      </div>

      <div className="max-w-xl rounded-lg border p-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              Location
            </label>

            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              {locations.map((location) => (
                <option
                  key={location.value}
                  value={location.value}
                >
                  {location.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              Product
            </label>

            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Select product</option>

              {products.map((row) => (
                <option
                  key={row.product.id}
                  value={row.product.id}
                >
                  {row.product.sku} — {row.product.name}
                </option>
              ))}
            </select>
          </div>

          {selectedProduct && (
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <div>
                <span className="font-medium">SKU:</span>{' '}
                {selectedProduct.product.sku}
              </div>

              <div>
                <span className="font-medium">
                  Current stock:
                </span>{' '}
                {selectedStock?.onHand ?? '0'}{' '}
                {selectedProduct.product.uom}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              Counted Quantity
            </label>

            <Input
              type="number"
              min="0"
              step="any"
              value={countedQuantity}
              onChange={(e) =>
                setCountedQuantity(e.target.value)
              }
              placeholder="Enter physical count"
            />
          </div>

          {message && (
            <div className="rounded-md border p-3 text-sm">
              {message}
            </div>
          )}

          <Button
            type="button"
            disabled={createAdjustment.isPending}
            onClick={handleSubmit}
          >
            {createAdjustment.isPending
              ? 'Creating...'
              : 'Create Adjustment'}
          </Button>

          {createdId && user?.role === 'MANAGER' && (
            <Button
              type="button"
              disabled={validateAdjustment.isPending}
              onClick={() =>
                validateAdjustment.mutate(createdId)
              }
            >
              {validateAdjustment.isPending
                ? 'Validating...'
                : 'Validate Adjustment'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}