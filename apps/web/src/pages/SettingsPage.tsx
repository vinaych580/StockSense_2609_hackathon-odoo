import { useMemo, useState } from 'react';

import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CONTACT_STUBS,
  LOCATION_STUBS,
  WAREHOUSE_STUBS,
  type Contact,
  type Location,
  type Warehouse,
} from '@/lib/settingsStub';

type Tab = 'warehouses' | 'locations' | 'contacts';

export function SettingsPage() {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER';

  const [tab, setTab] = useState<Tab>('warehouses');

  const [warehouses, setWarehouses] =
    useState<Warehouse[]>(WAREHOUSE_STUBS);

  const [locations, setLocations] =
    useState<Location[]>(LOCATION_STUBS);

  const [contacts, setContacts] =
    useState<Contact[]>(CONTACT_STUBS);

  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const [editingWarehouse, setEditingWarehouse] =
    useState<string | null>(null);
  const [editingLocation, setEditingLocation] =
    useState<string | null>(null);
  const [editingContact, setEditingContact] =
    useState<string | null>(null);

  const [warehouseName, setWarehouseName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [contactName, setContactName] = useState('');

  const visibleWarehouses = useMemo(
    () =>
      warehouses.filter((warehouse) =>
        showArchived ? true : warehouse.isActive,
      ),
    [warehouses, showArchived],
  );

  const visibleLocations = useMemo(
    () =>
      locations.filter(
        (location) =>
          (showArchived || location.isActive) &&
          (!warehouseFilter ||
            location.warehouseId === warehouseFilter),
      ),
    [locations, showArchived, warehouseFilter],
  );

  const visibleContacts = useMemo(
    () =>
      contacts.filter((contact) =>
        showArchived ? true : contact.isActive,
      ),
    [contacts, showArchived],
  );

  function toggleWarehouse(id: string) {
    if (!isManager) return;

    setWarehouses((current) =>
      current.map((warehouse) =>
        warehouse.id === id
          ? { ...warehouse, isActive: !warehouse.isActive }
          : warehouse,
      ),
    );
  }

  function toggleLocation(id: string) {
    if (!isManager) return;

    setLocations((current) =>
      current.map((location) =>
        location.id === id
          ? { ...location, isActive: !location.isActive }
          : location,
      ),
    );
  }

  function toggleContact(id: string) {
    if (!isManager) return;

    setContacts((current) =>
      current.map((contact) =>
        contact.id === id
          ? { ...contact, isActive: !contact.isActive }
          : contact,
      ),
    );
  }

  function saveWarehouse(id: string) {
    if (!warehouseName.trim()) return;

    setWarehouses((current) =>
      current.map((warehouse) =>
        warehouse.id === id
          ? { ...warehouse, name: warehouseName.trim() }
          : warehouse,
      ),
    );

    setEditingWarehouse(null);
    setWarehouseName('');
  }

  function saveLocation(id: string) {
    if (!locationName.trim()) return;

    setLocations((current) =>
      current.map((location) =>
        location.id === id
          ? { ...location, name: locationName.trim() }
          : location,
      ),
    );

    setEditingLocation(null);
    setLocationName('');
  }

  function saveContact(id: string) {
    if (!contactName.trim()) return;

    setContacts((current) =>
      current.map((contact) =>
        contact.id === id
          ? { ...contact, name: contactName.trim() }
          : contact,
      ),
    );

    setEditingContact(null);
    setContactName('');
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage warehouses, locations and contacts.
        </p>
      </div>

      <div className="flex gap-2 border-b pb-2">
        <Button
          variant={tab === 'warehouses' ? 'default' : 'outline'}
          onClick={() => setTab('warehouses')}
        >
          Warehouses
        </Button>

        <Button
          variant={tab === 'locations' ? 'default' : 'outline'}
          onClick={() => setTab('locations')}
        >
          Locations
        </Button>

        <Button
          variant={tab === 'contacts' ? 'default' : 'outline'}
          onClick={() => setTab('contacts')}
        >
          Contacts
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4">
        {tab === 'locations' ? (
          <select
            className="h-10 rounded-md border bg-background px-3 text-sm"
            value={warehouseFilter}
            onChange={(event) => setWarehouseFilter(event.target.value)}
          >
            <option value="">All warehouses</option>
            {warehouses
              .filter((warehouse) => warehouse.isActive)
              .map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.code} · {warehouse.name}
                </option>
              ))}
          </select>
        ) : (
          <div />
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
          />
          Show archived
        </label>
      </div>

      {tab === 'warehouses' && (
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3 font-medium">
            Warehouses
          </div>

          <div className="divide-y">
            {visibleWarehouses.map((warehouse) => (
              <div
                key={warehouse.id}
                className="flex items-center justify-between gap-4 px-4 py-4"
              >
                {editingWarehouse === warehouse.id ? (
                  <div className="flex flex-1 gap-2">
                    <Input
                      value={warehouseName}
                      onChange={(event) =>
                        setWarehouseName(event.target.value)
                      }
                      autoFocus
                    />
                    <Button onClick={() => saveWarehouse(warehouse.id)}>
                      Save
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setEditingWarehouse(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="font-medium">
                        {warehouse.code} · {warehouse.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {warehouse.address ?? 'No address'}
                      </p>
                    </div>

                    {isManager && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingWarehouse(warehouse.id);
                            setWarehouseName(warehouse.name);
                          }}
                        >
                          Edit
                        </Button>

                        <Button
                          variant="outline"
                          onClick={() =>
                            toggleWarehouse(warehouse.id)
                          }
                        >
                          {warehouse.isActive ? 'Archive' : 'Restore'}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'locations' && (
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3 font-medium">
            Locations
          </div>

          <div className="divide-y">
            {visibleLocations.map((location) => {
              const warehouse = warehouses.find(
                (item) => item.id === location.warehouseId,
              );

              return (
                <div
                  key={location.id}
                  className="flex items-center justify-between gap-4 px-4 py-4"
                >
                  {editingLocation === location.id ? (
                    <div className="flex flex-1 gap-2">
                      <Input
                        value={locationName}
                        onChange={(event) =>
                          setLocationName(event.target.value)
                        }
                        autoFocus
                      />

                      <Button onClick={() => saveLocation(location.id)}>
                        Save
                      </Button>

                      <Button
                        variant="outline"
                        onClick={() => setEditingLocation(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <p className="font-medium">
                          {location.code} · {location.name}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {warehouse?.code ?? 'Unknown warehouse'} ·{' '}
                          {location.type}
                        </p>
                      </div>

                      {isManager && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setEditingLocation(location.id);
                              setLocationName(location.name);
                            }}
                          >
                            Edit
                          </Button>

                          <Button
                            variant="outline"
                            onClick={() =>
                              toggleLocation(location.id)
                            }
                          >
                            {location.isActive ? 'Archive' : 'Restore'}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'contacts' && (
        <div className="rounded-lg border">
          <div className="border-b px-4 py-3 font-medium">
            Contacts
          </div>

          <div className="divide-y">
            {visibleContacts.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between gap-4 px-4 py-4"
              >
                {editingContact === contact.id ? (
                  <div className="flex flex-1 gap-2">
                    <Input
                      value={contactName}
                      onChange={(event) =>
                        setContactName(event.target.value)
                      }
                      autoFocus
                    />

                    <Button onClick={() => saveContact(contact.id)}>
                      Save
                    </Button>

                    <Button
                      variant="outline"
                      onClick={() => setEditingContact(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <div>
                      <p className="font-medium">{contact.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {contact.kind} ·{' '}
                        {contact.email ?? 'No email'} ·{' '}
                        {contact.phone ?? 'No phone'}
                      </p>
                    </div>

                    {isManager && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingContact(contact.id);
                            setContactName(contact.name);
                          }}
                        >
                          Edit
                        </Button>

                        <Button
                          variant="outline"
                          onClick={() =>
                            toggleContact(contact.id)
                          }
                        >
                          {contact.isActive ? 'Archive' : 'Restore'}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}