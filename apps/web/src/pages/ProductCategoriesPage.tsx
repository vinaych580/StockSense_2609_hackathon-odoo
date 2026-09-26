import { useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCategoryOptions } from '@/lib/masterDataStub';

type Category = {
  id: string;
  name: string;
  isActive: boolean;
};

export function ProductCategoriesPage() {
  const { user } = useAuth();
  const categoryOptions = useCategoryOptions();

  const [categories, setCategories] = useState<Category[]>(
    categoryOptions.map((category) => ({
      id: category.value,
      name: category.label,
      isActive: true,
    })),
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const isManager = user?.role === 'MANAGER';

  function startEdit(category: Category) {
    setEditingId(category.id);
    setEditingName(category.name);
  }

  function saveEdit() {
    if (!editingId || !editingName.trim()) return;

    setCategories((current) =>
      current.map((category) =>
        category.id === editingId
          ? { ...category, name: editingName.trim() }
          : category,
      ),
    );

    setEditingId(null);
    setEditingName('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingName('');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Product Categories</h1>
        <p className="text-sm text-muted-foreground">
          Manage product categories used across the inventory.
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="font-medium">Categories</h2>
        </div>

        <div className="divide-y">
          {categories.map((category) => {
            const isEditing = editingId === category.id;

            return (
              <div
                key={category.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                {isEditing ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      autoFocus
                    />

                    <Button onClick={saveEdit}>Save</Button>

                    <Button variant="outline" onClick={cancelEdit}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="font-medium">{category.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {category.isActive ? 'Active' : 'Archived'}
                      </p>
                    </div>

                    {isManager && (
                      <Button
                        variant="outline"
                        onClick={() => startEdit(category)}
                      >
                        Edit
                      </Button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}