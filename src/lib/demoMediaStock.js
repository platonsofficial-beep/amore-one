/**
 * Supply storages for the auth-disabled demo. Real venues are unchanged.
 * English names match the Stock walkthrough: Bar, Cellar, Storage, Kitchen.
 */

export const DEMO_STOCK_STORAGES = [
  { id: 'stor-bar', name: 'Bar', locationKey: 'Bar', isSupply: true, sortOrder: 0 },
  { id: 'stor-cellar', name: 'Cellar', locationKey: 'Cellar', isSupply: true, sortOrder: 1 },
  { id: 'stor-storage', name: 'Storage', locationKey: 'Storage', isSupply: true, sortOrder: 2 },
  { id: 'stor-kitchen', name: 'Kitchen', locationKey: 'Kitchen', isSupply: true, sortOrder: 3 },
]

export function demoStorageRows(workspaceId) {
  return DEMO_STOCK_STORAGES.map((storage) => ({
    id: storage.id,
    workspace_id: workspaceId,
    location_key: storage.locationKey,
    name: storage.name,
    active: true,
    sort_order: storage.sortOrder,
    is_supply: storage.isSupply,
    department_id: null,
  }))
}

export function demoStorageIdForLocation(location) {
  const key = `${location ?? ''}`.trim().toLowerCase()
  const aliases = {
    bar: 'stor-bar',
    cellar: 'stor-cellar',
    'wine cellar': 'stor-cellar',
    κάβα: 'stor-cellar',
    storage: 'stor-storage',
    'dry store': 'stor-storage',
    αποθήκη: 'stor-storage',
    kitchen: 'stor-kitchen',
    κουζίνα: 'stor-kitchen',
  }
  return aliases[key] ?? 'stor-storage'
}
