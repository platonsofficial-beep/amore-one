import { describe, expect, it } from 'vitest'
import {
  INVENTORY_LOCATION_HEADER_PREFIXES,
  parseInventoryLocationHeader,
} from './inventoryLocationHeaderParser.js'
import {
  detectInventoryImportQuantitySourceColumns,
  buildDefaultInventoryLocationAllocations,
  resolveInventoryLocationAllocations,
  serializeAllocationsToLocationQuantities,
} from './inventoryImportLocationAllocation.js'
import {
  buildOperationalLocationColumnBindings,
  buildInventoryLocationQuantities,
} from './inventoryLocationColumnBindings.js'
import { serializeLocationQuantitiesForApply } from './inventoryImportStagingPayload.js'

describe('parseInventoryLocationHeader — P8.29.15', () => {
  it('separates canonical location prefixes from operator labels', () => {
    expect(parseInventoryLocationHeader('Storage Tasos')).toMatchObject({
      matched: true,
      locationKey: 'Storage',
      operatorLabel: 'Tasos',
      sourceField: 'storage',
    })
    expect(parseInventoryLocationHeader('Storage Night Shift')).toMatchObject({
      locationKey: 'Storage',
      operatorLabel: 'Night Shift',
    })
    expect(parseInventoryLocationHeader('BAR Kostas')).toMatchObject({
      locationKey: 'Bar',
      operatorLabel: 'Kostas',
      sourceField: 'bar',
    })
    expect(parseInventoryLocationHeader('Kitchen Anna')).toMatchObject({
      locationKey: 'Kitchen',
      operatorLabel: 'Anna',
    })
    expect(parseInventoryLocationHeader('Wine Storage Nikos')).toMatchObject({
      locationKey: 'Wine Storage',
      operatorLabel: 'Nikos',
    })
  })

  it('keeps headers without a suffix unchanged (operator null)', () => {
    expect(parseInventoryLocationHeader('Storage')).toMatchObject({
      locationKey: 'Storage',
      operatorLabel: null,
    })
    expect(parseInventoryLocationHeader('Main Storage')).toMatchObject({
      locationKey: 'Main Storage',
      operatorLabel: null,
    })
    expect(parseInventoryLocationHeader('Water Storage')).toMatchObject({
      locationKey: 'Water Storage',
      operatorLabel: null,
    })
  })

  it('matches longest prefixes before Storage', () => {
    expect(INVENTORY_LOCATION_HEADER_PREFIXES[0].normalized).toBe('coffee station')
    expect(parseInventoryLocationHeader('Main Storage Maria')).toMatchObject({
      locationKey: 'Main Storage',
      operatorLabel: 'Maria',
    })
  })
})

describe('detectInventoryImportQuantitySourceColumns — operator headers', () => {
  it('detects Storage Tasos as storage with operator metadata', () => {
    const columns = detectInventoryImportQuantitySourceColumns({
      headers: [
        { columnIndex: 0, sourceHeader: '', isBlank: true },
        { columnIndex: 1, sourceHeader: 'Storage Tasos', normalized: 'storage tasos' },
        { columnIndex: 2, sourceHeader: 'BAR Kostas', normalized: 'bar kostas' },
      ],
    })
    expect(columns).toHaveLength(2)
    expect(columns[0]).toMatchObject({
      sourceField: 'storage',
      locationKey: 'Storage',
      operatorLabel: 'Tasos',
      sourceHeader: 'Storage Tasos',
    })
    expect(columns[1]).toMatchObject({
      sourceField: 'bar',
      locationKey: 'Bar',
      operatorLabel: 'Kostas',
      sourceHeader: 'BAR Kostas',
    })
  })
})

describe('allocation + bindings — bind Storage not Storage Tasos', () => {
  const workspaceStorages = [
    { id: 's-storage', locationKey: 'Storage' },
    { id: 's-bar', locationKey: 'Bar' },
    { id: 's-kitchen', locationKey: 'Kitchen' },
  ]

  it('defaults Storage Tasos destination to Storage and keeps operatorLabel in payload', () => {
    const columns = detectInventoryImportQuantitySourceColumns({
      headers: [
        { columnIndex: 1, sourceHeader: 'Storage Tasos', normalized: 'storage tasos' },
        { columnIndex: 2, sourceHeader: 'BAR', normalized: 'bar' },
      ],
    })
    const defaults = buildDefaultInventoryLocationAllocations({
      source: { storage: 7, bar: 20 },
      columns,
      workspaceStorages,
    })
    expect(defaults[0]).toMatchObject({
      locationKey: 'Storage',
      operatorLabel: 'Tasos',
      destinationLocationKey: 'Storage',
      destinationStorageId: 's-storage',
    })
    expect(defaults[0].destinationLocationKey).not.toBe('Storage Tasos')

    const resolved = resolveInventoryLocationAllocations({
      allocations: defaults,
      workspaceStorages,
    })
    const payload = serializeAllocationsToLocationQuantities(resolved.allocations)
    expect(payload[0]).toMatchObject({
      destinationLocationKey: 'Storage',
      parsedQuantity: 7,
      operatorLabel: 'Tasos',
    })
    expect(payload[1]).toMatchObject({
      destinationLocationKey: 'Bar',
      parsedQuantity: 20,
      operatorLabel: null,
    })
  })

  it('bindings + apply serializer preserve operatorLabel as audit metadata', () => {
    const bindings = buildOperationalLocationColumnBindings({
      workspaceStorages,
      storageDestination: { id: 's-storage', locationKey: 'Storage' },
      storageHeader: 'Storage Tasos',
      barHeader: 'BAR Morning',
    })
    expect(bindings[0]).toMatchObject({
      operatorLabel: 'Tasos',
      locationKey: 'Storage',
      destinationLocationKey: 'Storage',
    })
    expect(bindings[1]).toMatchObject({
      operatorLabel: 'Morning',
      locationKey: 'Bar',
    })

    const built = buildInventoryLocationQuantities({
      source: { storage: 7, bar: 20 },
      bindings,
    })
    expect(built.locationQuantities[0].operatorLabel).toBe('Tasos')
    expect(built.locationQuantities[1].operatorLabel).toBe('Morning')

    const forApply = serializeLocationQuantitiesForApply(built.locationQuantities)
    expect(forApply[0]).toMatchObject({
      destinationLocationKey: 'Storage',
      operatorLabel: 'Tasos',
      parsedQuantity: 7,
    })
  })
})
