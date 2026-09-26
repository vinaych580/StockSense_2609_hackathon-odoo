import { useState } from 'react';
import { useNavigate } from 'react-router';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  useCategoryOptions,
  useLocationOptions,
} from '@/lib/masterDataStub';

const UOMS = ['UNIT', 'BOX', 'KG', 'L', 'M'] as const;

export function ProductCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const categories = useCategoryOptions();
  const locations = useLocationOptions();

  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [uom, setUom] = useState<(typeof UOMS)[number]>('UNIT');
  const [unitCost, setUnitCost] = useState('');
  const [initialStock, setInitialStock] = useState('');
  const [locationId, setLocationId] = useState('');
  const [message, setMessage] = useState('');

  if (user?.role !== 'MANAGER') {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">New Product</h1>
        <p className="text-sm text-muted-foreground">
          Only Managers can create products.
        </p>
      </div>
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage('');

    if (!sku.trim() || !name.trim()) {
      setMessage('SKU and product name are required.');
      return;
    }

    if (initialStock && !locationId) {
      setMessage('Select a location for the initial stock.');
      return;
    }

    // Temporary stub until the product API lands.
    const payload = {
      sku: sku.trim().toUpperCase(),
      name: name.trim(),
      categoryId: categoryId || undefined,
      uom,
      unitCost: unitCost || undefined,
      initialStock: initialStock
        ? {
            locationId,
            quantity: initialStock,
          }
        : undefined,
    };

    console.log('Create product:', payload);

    setMessage(
      'Product form is valid. Backend product creation will be connected when the API lands.',
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">New Product</h1>
        <p className="text-sm text-muted-foreground">
          Create a product and optionally add initial stock.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="space-y-5 rounded-lg border bg-card p-6"
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">SKU</label>
          <Input
            value={sku}
            onChange={(event) => setSku(event.target.value)}
            placeholder="e.g. RM-001"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Product name</label>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Steel Sheets"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Category</label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Unit of Measure</label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={uom}
            onChange={(event) =>
              setUom(event.target.value as (typeof UOMS)[number])
            }
          >
            {UOMS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Unit cost</label>
          <Input
            type="number"
            min="0"
            step="0.001"
            value={unitCost}
            onChange={(event) => setUnitCost(event.target.value)}
            placeholder="Optional"
          />
        </div>

        <div className="border-t pt-5">
          <h2 className="font-medium">Initial Stock</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Optional. Leave quantity empty if the product starts with no stock.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Quantity</label>
              <Input
                type="number"
                min="0"
                step="0.001"
                value={initialStock}
                onChange={(event) => setInitialStock(event.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Location</label>
              <select
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
                disabled={!initialStock}
              >
                <option value="">Select location</option>
                {locations.map((location) => (
                  <option key={location.value} value={location.value}>
                    {location.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {message && (
          <div className="rounded-md border p-3 text-sm">
            {message}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit">Create Product</Button>

          <Button
            type="button"
            variant="outline"
            onClick={() => navigate('/products')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}