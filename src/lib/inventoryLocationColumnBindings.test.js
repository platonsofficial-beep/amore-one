/**
 * @vitest-environment node
 * P8.29.11 — Location column bindings + locationQuantities builder.
 */
import { describe, expect, it } from 'vitest'
import {
  INVENTORY_LOCATION_BINDING_STATUS,
  INVENTORY_LOCATION_QUANTITY_BLOCKER,
  buildInventoryLocationQuantities,
  buildOperationalLocationColumnBindings,
  buildOperationalInventoryLocationQuantities,
  createInventoryLocationColumnBinding,
  resolveWorkspaceStorageByLocationKey,
} from './inventoryLocationColumnBindings.js'

const STORAGES = Object.freeze([
  { id: 'stor-main', locationKey: 'Main Storage', name: 'Main Storage', active: true },
  { id: 'stor-bar', locationKey: 'Bar', name: 'Bar', active: true },
  { id: 'stor-wine', locationKey: 'Wine Cellar', name: 'Wine Cellar', active: true },
  { id: 'stor-apothiki', locationKey: 'Apothiki 2', name: 'Apothiki 2', active: true },
])

describe('resolveWorkspaceStorageByLocationKey', () => {
  it('maps exact custom location keys without inventing storages', () => {
    expect(resolveWorkspaceStorageByLocationKey(STORAGES, 'Apothiki 2')).toEqual({
      status: 'mapped',
      storage: { id: 'stor-apothiki', locationKey: 'Apothiki 2' },
    })
    expect(resolveWorkspaceStorageByLocationKey(STORAGES, 'Pool')).toEqual({
      status: 'unmapped',
      storage: null,
    })
  })

  it('detects ambiguous duplicate location keys', () => {
    const result = resolveWorkspaceStorageByLocationKey([
      { id: 'a', locationKey: 'Bar' },
      { id: 'b', locationKey: 'Bar' },
    ], 'Bar')
    expect(result.status).toBe('ambiguous')
    expect(result.storage).toBeNull()
  })
})

describe('buildOperationalLocationColumnBindings', () => {
  it('binds Storage to selected destination and BAR to exact Bar storage', () => {
    const bindings = buildOperationalLocationColumnBindings({
      workspaceStorages: STORAGES,
      storageDestination: { id: 'stor-main', locationKey: 'Main Storage' },
    })
    expect(bindings).toHaveLength(2)
    expect(bindings[0]).toMatchObject({
      sourceHeaderNormalized: 'storage',
      sourceField: 'storage',
      destinationStorageId: 'stor-main',
      destinationLocationKey: 'Main Storage',
      bindingStatus: 'mapped',
    })
    expect(bindings[1]).toMatchObject({
      sourceHeaderNormalized: 'bar',
      sourceField: 'bar',
      destinationStorageId: 'stor-bar',
      destinationLocationKey: 'Bar',
      bindingStatus: 'mapped',
    })
  })

  it('leaves BAR unmapped when no exact Bar storage exists', () => {
    const bindings = buildOperationalLocationColumnBindings({
      workspaceStorages: [{ id: 'stor-main', locationKey: 'Main Storage' }],
      storageDestination: { id: 'stor-main', locationKey: 'Main Storage' },
    })
    expect(bindings[1].bindingStatus).toBe('unmapped')
    expect(bindings[1].destinationStorageId).toBeNull()
  })

  it('preserves custom workspace location keys via storage destination', () => {
    const bindings = buildOperationalLocationColumnBindings({
      workspaceStorages: STORAGES,
      storageDestination: { locationKey: 'Apothiki 2' },
    })
    expect(bindings[0]).toMatchObject({
      destinationStorageId: 'stor-apothiki',
      destinationLocationKey: 'Apothiki 2',
      bindingStatus: 'mapped',
    })
  })
})

describe('buildInventoryLocationQuantities', () => {
  const mappedBindings = buildOperationalLocationColumnBindings({
    workspaceStorages: STORAGES,
    storageDestination: { id: 'stor-main', locationKey: 'Main Storage' },
    storageColumnIndex: 1,
    barColumnIndex: 2,
  })

  it('parses Storage 288+180 and BAR 66 into distinct ordered entries', () => {
    const frozenSource = Object.freeze({ storage: '288+180', bar: 66 })
    const result = buildInventoryLocationQuantities({
      source: frozenSource,
      bindings: mappedBindings,
    })

    expect(frozenSource).toEqual({ storage: '288+180', bar: 66 })
    expect(result.locationQuantities).toHaveLength(2)
    expect(result.locationQuantities[0]).toMatchObject({
      sourceColumnIndex: 1,
      sourceHeader: 'Storage',
      destinationStorageId: 'stor-main',
      destinationLocationKey: 'Main Storage',
      rawEvidence: '288+180',
      parsedQuantity: 468,
      parseStatus: 'expression_ok',
      validationState: 'warning',
    })
    expect(result.locationQuantities[0].warnings).toContain('expression_summed')
    expect(result.locationQuantities[0].evidence).toEqual({ formulaParts: [288, 180] })
    expect(result.locationQuantities[1]).toMatchObject({
      sourceColumnIndex: 2,
      sourceHeader: 'BAR',
      destinationStorageId: 'stor-bar',
      destinationLocationKey: 'Bar',
      rawEvidence: 66,
      parsedQuantity: 66,
      parseStatus: 'ok',
      validationState: 'valid',
    })
    expect(result.aggregateQuantity).toBe(534)
    expect(result.blockers).toEqual([])
  })

  it('blocks unmapped non-empty fields but allows empty unmapped fields', () => {
    const unmappedBar = [
      createInventoryLocationColumnBinding({
        sourceHeaderNormalized: 'storage',
        sourceHeader: 'Storage',
        sourceField: 'storage',
        sourceColumnIndex: 1,
        destinationStorageId: 'stor-main',
        destinationLocationKey: 'Main Storage',
        bindingStatus: 'mapped',
      }),
      createInventoryLocationColumnBinding({
        sourceHeaderNormalized: 'bar',
        sourceHeader: 'BAR',
        sourceField: 'bar',
        sourceColumnIndex: 2,
        bindingStatus: 'unmapped',
      }),
    ]

    const blocked = buildInventoryLocationQuantities({
      source: { storage: 10, bar: 3 },
      bindings: unmappedBar,
    })
    expect(blocked.blockers).toContain(INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_UNMAPPED)
    expect(blocked.locationQuantities[1].validationState).toBe('blocker')

    const emptyBar = buildInventoryLocationQuantities({
      source: { storage: 10, bar: null },
      bindings: unmappedBar,
    })
    expect(emptyBar.blockers).not.toContain(
      INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_UNMAPPED,
    )
    expect(emptyBar.locationQuantities[1].parseStatus).toBe('empty')
    expect(emptyBar.locationQuantities[1].validationState).toBe('valid')
  })

  it('blocks duplicate destination bindings for non-empty cells', () => {
    const duplicate = [
      createInventoryLocationColumnBinding({
        sourceHeaderNormalized: 'storage',
        sourceHeader: 'Storage',
        sourceField: 'storage',
        destinationStorageId: 'stor-main',
        destinationLocationKey: 'Main Storage',
        bindingStatus: 'mapped',
      }),
      createInventoryLocationColumnBinding({
        sourceHeaderNormalized: 'bar',
        sourceHeader: 'BAR',
        sourceField: 'bar',
        destinationStorageId: 'stor-main',
        destinationLocationKey: 'Main Storage',
        bindingStatus: 'mapped',
      }),
    ]
    const result = buildInventoryLocationQuantities({
      source: { storage: 5, bar: 2 },
      bindings: duplicate,
    })
    expect(result.blockers).toContain(
      INVENTORY_LOCATION_QUANTITY_BLOCKER.DUPLICATE_LOCATION_DESTINATION,
    )
    expect(result.locationQuantities.every((entry) => entry.validationState === 'blocker')).toBe(true)
  })

  it('blocks ambiguous bindings for non-empty quantities', () => {
    const bindings = [
      createInventoryLocationColumnBinding({
        sourceHeaderNormalized: 'bar',
        sourceHeader: 'BAR',
        sourceField: 'bar',
        bindingStatus: INVENTORY_LOCATION_BINDING_STATUS.AMBIGUOUS,
        destinationLocationKey: 'Bar',
      }),
    ]
    const result = buildInventoryLocationQuantities({
      source: { bar: 4 },
      bindings,
    })
    expect(result.blockers).toContain(
      INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_AMBIGUOUS,
    )
  })

  it('does not combine separate locations into one quantity entry', () => {
    const result = buildOperationalInventoryLocationQuantities({
      source: { storage: 10, bar: 20 },
      workspaceStorages: STORAGES,
      storageLocationKey: 'Main Storage',
    })
    expect(result.locationQuantities).toHaveLength(2)
    expect(result.locationQuantities[0].parsedQuantity).toBe(10)
    expect(result.locationQuantities[1].parsedQuantity).toBe(20)
    expect(result.locationQuantities[0].destinationStorageId)
      .not.toBe(result.locationQuantities[1].destinationStorageId)
  })
})
