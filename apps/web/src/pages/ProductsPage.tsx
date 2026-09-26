import type { ProductDto, StockRowDto } from '@stocksense/shared';
import { Link } from 'react-router';
import { useMemo, useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLocationOptions } from '@/lib/masterDataStub';
import { PRODUCT_STUBS } from '@/lib/productStub';

type StockStatus = 'ALL' | 'IN_STOCK' | 'LOW' | 'OUT';

const LOW_STOCK_THRESHOLD = 10;

export function ProductsPage() {
  const { user } = useAuth();
  const locations = useLocationOptions();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [stockStatus, setStockStatus] = useState<StockStatus>('ALL');
  const [showArchived, setShowArchived] = useState(false);

  // Temporary stock data until the product API lands.
  const stockRows: StockRowDto[] = [];

  const stockByProduct = useMemo(() => {
    const map = new Map<string, number>();

    for (const row of stockRows) {
      const current = map.get(row.product.id) ?? 0;
      map.set(row.product.id, current + Number(row.onHand));
    }

    return map;
  }, [stockRows]);

  const categories = useMemo(
    () =>
      Array.from(
        new Map(
          PRODUCT_STUBS
            .filter((product) => product.category)
            .map((product) => [
              product.category!.id,
              product.category!.name,
            ]),
        ).entries(),
      ),
    [],
  );

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return PRODUCT_STUBS.filter((product) => {
      if (!showArchived && !product.isActive) return false;

      if (
        query &&
        !product.name.toLowerCase().includes(query) &&
        !product.sku.toLowerCase().includes(query)
      ) {
        return false;
      }

      if (category && product.category?.id !== category) {
        return false;
      }

      const quantity = stockByProduct.get(product.id) ?? 0;

      if (stockStatus === 'OUT' && quantity !== 0) return false;
      if (
        stockStatus === 'LOW' &&
        (quantity <= 0 || quantity > LOW_STOCK_THRESHOLD)
      ) {
        return false;
      }
      if (stockStatus === 'IN_STOCK' && quantity <= LOW_STOCK_THRESHOLD) {
        return false;
      }

      return true;
    });
  }, [search, category, stockStatus, showArchived, stockByProduct]);

  function archiveProduct(product: ProductDto) {
    // Stub only for now. Real API will PATCH isActive=false.
    console.log('Archive product:', product.id);
  }

  function restoreProduct(product: ProductDto) {
    // Stub only for now. Real API will PATCH isActive=true.
    console.log('Restore product:', product.id);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Products</h1>
          <p className="text-sm text-muted-foreground">
            Manage products, categories and stock status.
          </p>
        </div>

        {user?.role === 'MANAGER' && (
          <Button asChild>
            <Link to="/products/new">New Product</Link>
          </Button>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Input
            placeholder="Search SKU or product name..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>

          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={stockStatus}
            onChange={(event) =>
              setStockStatus(event.target.value as StockStatus)
            }
          >
            <option value="ALL">All stock</option>
            <option value="IN_STOCK">In stock</option>
            <option value="LOW">Low stock</option>
            <option value="OUT">Out of stock</option>
          </select>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Show archived
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr className="text-left">
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">UOM</th>
                <th className="px-4 py-3">Unit Cost</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredProducts.map((product) => {
                const quantity = stockByProduct.get(product.id) ?? 0;

                const status =
                  quantity === 0
                    ? 'Out'
                    : quantity <= LOW_STOCK_THRESHOLD
                      ? 'Low'
                      : 'In stock';

                return (
                  <tr
                    key={product.id}
                    className="border-b last:border-0"
                  >
                    <td className="px-4 py-3 font-mono">
                      {product.sku}
                    </td>

                    <td className="px-4 py-3 font-medium">
                      <Link
                        to={`/products/${product.id}`}
                        className="hover:underline"
                      >
                        {product.name}
                      </Link>
                    </td>

                    <td className="px-4 py-3">
                      {product.category?.name ?? '—'}
                    </td>

                    <td className="px-4 py-3">{product.uom}</td>

                    <td className="px-4 py-3">
                      {product.unitCost ?? '—'}
                    </td>

                    <td className="px-4 py-3">
                      {quantity.toFixed(3)}
                    </td>

                    <td className="px-4 py-3">
                      <span className="rounded-full border px-2 py-1 text-xs">
                        {status}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right">
                      {user?.role === 'MANAGER' &&
                        (product.isActive ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => archiveProduct(product)}
                          >
                            Archive
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => restoreProduct(product)}
                          >
                            Restore
                          </Button>
                        ))}
                    </td>
                  </tr>
                );
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        {locations.length} internal locations available.
      </div>
    </div>
  );
}