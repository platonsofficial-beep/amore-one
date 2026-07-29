import { describe, expect, it } from 'vitest'
import {
  buildDefaultInventoryLocationAllocations,
  detectInventoryImportQuantitySourceColumns,
  formatLocationAllocationEvidenceLabel,
  isMultiLocationQuantityColumnSheet,
  mergeInventoryLocationAllocations,
  resolveInventoryLocationAllocations,
  resolvePrimaryStorageLocationKeyFromAllocations,
  serializeAllocationsToLocationQuantities,
} from './inventoryImportLocationAllocation.js'
import { INVENTORY_LOCATION_QUANTITY_BLOCKER } from './inventoryLocationColumnBindings.js'

function storage(partial) {
  return {
    id: partial.id,
    locationKey: partial.locationKey,
    name: partial.name ?? partial.locationKey,
  }
}

describe('inventoryImportLocationAllocation', () => {
  const workspaceStorages = [
    storage({ id: 's-water', locationKey: 'Water Storage' }),
    storage({ id: 's-bar', locationKey: 'Bar' }),
    storage({ id: 's-kitchen', locationKey: 'Kitchen' }),
  ]

  it('detects Storage, BAR, and generic quantity columns without a hard limit', () => {
    const columns = detectInventoryImportQuantitySourceColumns({
      headers: [
        { columnIndex: 0, sourceHeader: '', isBlank: true },
        { columnIndex: 1, sourceHeader: 'Storage', normalized: 'storage' },
        { columnIndex: 2, sourceHeader: 'BAR', normalized: 'bar' },
        { columnIndex: 3, sourceHeader: 'Kitchen', normalized: 'kitchen' },
        { columnIndex: 4, sourceHeader: 'Terrace', normalized: 'terrace' },
        { columnIndex: 5, sourceHeader: 'Freezer', normalized: 'freezer' },
        { columnIndex: 6, sourceHeader: 'Order', normalized: 'order' },
      ],
    })
    expect(columns.map((column) => column.sourceField)).toEqual([
      'storage',
      'bar',
      'kitchen',
      'terrace',
      'freezer',
    ])
    expect(isMultiLocationQuantityColumnSheet(columns)).toBe(true)
  })

  it('builds defaults, totals, expression evidence, and serializes locationQuantities', () => {
    const defaults = buildDefaultInventoryLocationAllocations({
      source: { storage: '288+180', bar: 20 },
      columns: [
        { sourceField: 'storage', sourceHeader: 'Storage', sourceColumnIndex: 1 },
        { sourceField: 'bar', sourceHeader: 'BAR', sourceColumnIndex: 2 },
      ],
      workspaceStorages,
      preferredStorageLocationKey: 'Water Storage',
    })
    const resolved = resolveInventoryLocationAllocations({
      allocations: defaults,
      workspaceStorages,
    })
    expect(resolved.totalOpeningStock).toBe(488)
    expect(resolved.blockers).toEqual([])
    expect(formatLocationAllocationEvidenceLabel(resolved.allocations[0]))
      .toBe('from 288 + 180')
    expect(formatLocationAllocationEvidenceLabel(resolved.allocations[1])).toBe('BAR')
    expect(resolvePrimaryStorageLocationKeyFromAllocations(resolved.allocations))
      .toBe('Water Storage')
    expect(serializeAllocationsToLocationQuantities(resolved.allocations)).toEqual([
      expect.objectContaining({
        destinationLocationKey: 'Water Storage',
        destinationStorageId: 's-water',
        parsedQuantity: 468,
        validationState: 'warning',
      }),
      expect.objectContaining({
        destinationLocationKey: 'Bar',
        destinationStorageId: 's-bar',
        parsedQuantity: 20,
        validationState: 'valid',
      }),
    ])
  })

  it('blocks duplicate destinations and missing destination storage', () => {
    const defaults = buildDefaultInventoryLocationAllocations({
      source: { storage: 10, bar: 5 },
      workspaceStorages,
      preferredStorageLocationKey: 'Water Storage',
    })
    const merged = mergeInventoryLocationAllocations(defaults, [
      {
        sourceField: 'bar',
        destinationLocationKey: 'Water Storage',
        quantityInput: 5,
      },
    ])
    const duplicate = resolveInventoryLocationAllocations({
      allocations: merged,
      workspaceStorages,
    })
    expect(duplicate.blockers).toContain(
      INVENTORY_LOCATION_QUANTITY_BLOCKER.DUPLICATE_LOCATION_DESTINATION,
    )

    const missing = resolveInventoryLocationAllocations({
      allocations: mergeInventoryLocationAllocations(defaults, [
        {
          sourceField: 'storage',
          destinationLocationKey: null,
          quantityInput: 10,
        },
      ]),
      workspaceStorages,
    })
    expect(missing.blockers).toContain(
      INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_UNMAPPED,
    )
  })
})
