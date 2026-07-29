/**
 * P8.16.14 / P8.26.6 / P8.28.1 / P8.28.2 — New product review with filtered
 * bulk resolution workspace.
 *
 * Wizard-local drafts only. No database writes, product creation, or Apply.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  INVENTORY_LOCATION_ALLOCATION_SOURCE,
  isLocationAllocationQuantityPresent,
} from '../../lib/inventoryImportLocationAllocation'
import {
  INVENTORY_NEW_PRODUCT_UNITS,
  getNewProductDraftDefaults,
  listCreateNewPreviewRows,
  resolveNewProductLocationAllocationsState,
  validateNewProductDraft,
} from '../../lib/inventoryNewProductDrafts'
import { INVENTORY_LOCATION_QUANTITY_BLOCKER } from '../../lib/inventoryLocationColumnBindings'
import { INVENTORY_UNIT_INFERENCE_STATUS } from '../../lib/inventoryUnitInference'
import { buildStockItemSupplierOptions, normalizeSupplierName } from '../../lib/stockSupplierUtils'
import { getSuppliers } from '../../services/supplierService'
import { InventoryImportLocationAllocationEditor } from './InventoryImportLocationAllocationEditor'
import { formatOperationalImportPreviewValue } from './InventoryOperationalImportPreview'
import { WorkspaceStorageSelector } from './WorkspaceStorageSelector'

/**
 * @typedef {{
 *   productName: string,
 *   category: string,
 *   unit: string|null,
 *   storage: string|null,
 *   supplier?: string,
 *   supplierId?: string|null,
 *   skipped?: boolean,
 *   locationAllocations?: object[]|null,
 * }} NewProductDraftValue
 */

/** @typedef {'all'|'missing_units'|'missing_storage'|'missing_supplier'|'new_products'|'duplicate_products'} NewProductFilterId */

export const INVENTORY_NEW_PRODUCT_FILTERS = Object.freeze([
  { id: 'all', label: 'All' },
  { id: 'missing_units', label: 'Missing Units' },
  { id: 'missing_storage', label: 'Missing Destination' },
  { id: 'missing_supplier', label: 'Missing Supplier' },
  { id: 'new_products', label: 'New Products' },
  { id: 'duplicate_products', label: 'Duplicates' },
])

/**
 * @param {NewProductDraftValue} merged
 * @returns {NewProductDraftValue}
 */
function toDraftPayload(merged) {
  return {
    productName: merged.productName,
    category: merged.category,
    unit: merged.unit ?? null,
    storage: merged.storage ?? null,
    supplier: merged.supplier ?? '',
    supplierId: merged.supplierId ?? null,
    skipped: merged.skipped === true,
    locationAllocations: Array.isArray(merged.locationAllocations)
      ? merged.locationAllocations
      : null,
  }
}

/**
 * @param {object|null|undefined} resolved
 * @returns {boolean}
 */
function hasMissingAllocationDestination(resolved) {
  if (!resolved || !Array.isArray(resolved.allocations)) return true
  return resolved.allocations.some((allocation) => (
    isLocationAllocationQuantityPresent(allocation.quantityInput)
    && (
      !allocation.destinationLocationKey
      || allocation.warnings?.includes(
        INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_UNMAPPED,
      )
      || allocation.warnings?.includes(
        INVENTORY_LOCATION_QUANTITY_BLOCKER.LOCATION_BINDING_AMBIGUOUS,
      )
    )
  ))
}

/**
 * @param {{
 *   key: string,
 *   merged: NewProductDraftValue,
 *   resolvedAllocations?: object|null,
 * }} card
 * @param {NewProductFilterId} filterId
 * @param {Set<string>} duplicateNameKeys
 * @returns {boolean}
 */
export function matchesNewProductFilter(card, filterId, duplicateNameKeys) {
  const { key, merged, resolvedAllocations } = card
  if (filterId === 'all' || filterId === 'new_products') return true
  if (filterId === 'missing_units') {
    return !merged.skipped && !merged.unit
  }
  if (filterId === 'missing_storage') {
    return !merged.skipped && hasMissingAllocationDestination(resolvedAllocations)
  }
  if (filterId === 'missing_supplier') {
    return !merged.skipped && !`${merged.supplier ?? ''}`.trim()
  }
  if (filterId === 'duplicate_products') {
    return duplicateNameKeys.has(key)
  }
  return true
}

/**
 * @param {{
 *   preview?: object|null,
 *   drafts?: Record<string, NewProductDraftValue>,
 *   categoryOptions?: string[],
 *   workspaceId?: string,
 *   workspaceStorages?: object[]|null,
 *   quantitySourceColumns?: object[]|null,
 *   preferredStorageLocationKey?: string|null,
 *   onChangeDraft?: (rowKey: string, next: NewProductDraftValue) => void,
 *   onChangeDraftsBulk?: (updates: Record<string, NewProductDraftValue>) => void,
 * }} props
 */
export function InventoryNewProductReview({
  preview = null,
  drafts = {},
  categoryOptions = [],
  workspaceId = '',
  workspaceStorages = null,
  quantitySourceColumns = null,
  preferredStorageLocationKey = null,
  onChangeDraft = undefined,
  onChangeDraftsBulk = undefined,
} = {}) {
  const createRows = useMemo(() => listCreateNewPreviewRows(preview), [preview])
  const [selectedKeys, setSelectedKeys] = useState(() => new Set())
  const [activeFilter, setActiveFilter] = useState(/** @type {NewProductFilterId} */ ('all'))
  const [bulkPanel, setBulkPanel] = useState(/** @type {null|'storage'|'unit'|'category'|'supplier'} */ (null))
  const [undoState, setUndoState] = useState(/** @type {{ message: string, drafts: Record<string, NewProductDraftValue> }|null} */ (null))
  const [suppliers, setSuppliers] = useState(/** @type {object[]} */ ([]))

  useEffect(() => {
    let cancelled = false
    const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
    if (!normalizedWorkspaceId) {
      setSuppliers([])
      return undefined
    }
    ;(async () => {
      try {
        const list = await getSuppliers(normalizedWorkspaceId)
        if (!cancelled) setSuppliers(Array.isArray(list) ? list : [])
      } catch (loadError) {
        console.warn('[InventoryNewProductReview] getSuppliers failed:', loadError)
        if (!cancelled) setSuppliers([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const cards = useMemo(() => {
    let unitsSuggested = 0
    let needUnitSelection = 0

    const mapped = createRows.map(({ key, row }) => {
      const defaults = getNewProductDraftDefaults(row)
      const locationState = resolveNewProductLocationAllocationsState({
        row,
        draft: drafts[key] ?? defaults,
        quantitySourceColumns,
        workspaceStorages,
        preferredStorageLocationKey,
      })
      const merged = {
        ...locationState.merged,
        storage: locationState.primaryStorage ?? locationState.merged.storage,
        locationAllocations: locationState.allocations.map((allocation) => ({
          sourceField: allocation.sourceField,
          quantityInput: allocation.quantityInput,
          destinationLocationKey: allocation.destinationLocationKey,
          destinationStorageId: allocation.destinationStorageId,
          bindingStatus: allocation.bindingStatus,
        })),
      }
      const validation = validateNewProductDraft(merged)
      const inferredUnit = defaults.unitInference?.status === INVENTORY_UNIT_INFERENCE_STATUS.INFERRED
        ? defaults.unitInference.proposedUnit
        : null
      const showingSuggested = Boolean(
        inferredUnit
        && merged.unit === inferredUnit,
      )
      if (showingSuggested) unitsSuggested += 1
      if (!merged.unit && !merged.skipped) needUnitSelection += 1

      return {
        key,
        row,
        merged,
        validation,
        showingSuggested,
        resolvedAllocations: locationState.resolved,
        primaryStorage: locationState.primaryStorage,
      }
    })

    return { mapped, unitsSuggested, needUnitSelection }
  }, [createRows, drafts, quantitySourceColumns, workspaceStorages, preferredStorageLocationKey])

  const allKeys = useMemo(() => cards.mapped.map((card) => card.key), [cards.mapped])
  const allKeysSignature = allKeys.join('\u0001')

  const duplicateNameKeys = useMemo(() => {
    /** @type {Map<string, string[]>} */
    const byName = new Map()
    cards.mapped.forEach(({ key, merged }) => {
      const name = `${merged.productName ?? ''}`.trim().toLowerCase()
      if (!name) return
      const list = byName.get(name) ?? []
      list.push(key)
      byName.set(name, list)
    })
    /** @type {Set<string>} */
    const keys = new Set()
    for (const list of byName.values()) {
      if (list.length > 1) list.forEach((key) => keys.add(key))
    }
    return keys
  }, [cards.mapped])

  const visibleCards = useMemo(
    () => cards.mapped.filter((card) => matchesNewProductFilter(card, activeFilter, duplicateNameKeys)),
    [cards.mapped, activeFilter, duplicateNameKeys],
  )
  const visibleKeys = useMemo(() => visibleCards.map((card) => card.key), [visibleCards])

  /** Bulk + visible selection counts use selected ∩ visible only (no hidden mutations). */
  const selectedVisibleKeys = useMemo(
    () => visibleKeys.filter((key) => selectedKeys.has(key)),
    [visibleKeys, selectedKeys],
  )
  const selectedVisibleCount = selectedVisibleKeys.length
  const allVisibleSelected = visibleKeys.length > 0
    && visibleKeys.every((key) => selectedKeys.has(key))

  useEffect(() => {
    const allowed = new Set(allKeysSignature ? allKeysSignature.split('\u0001') : [])
    setSelectedKeys((current) => {
      const next = new Set()
      current.forEach((key) => {
        if (allowed.has(key)) next.add(key)
      })
      if (next.size === current.size) {
        let unchanged = true
        current.forEach((key) => {
          if (!next.has(key)) unchanged = false
        })
        if (unchanged) return current
      }
      return next
    })
  }, [allKeysSignature])

  function emitDraft(key, merged, patch) {
    onChangeDraft?.(key, toDraftPayload({
      ...merged,
      ...patch,
    }))
  }

  /**
   * @param {string} key
   * @param {NewProductDraftValue} merged
   * @param {object[]} currentAllocations
   * @param {string} sourceField
   * @param {object} patch
   */
  function emitAllocationChange(key, merged, currentAllocations, sourceField, patch) {
    const nextAllocations = currentAllocations.map((allocation) => (
      allocation.sourceField === sourceField
        ? { ...allocation, ...patch }
        : allocation
    ))
    const storageField = nextAllocations.find(
      (allocation) => allocation.sourceField === INVENTORY_LOCATION_ALLOCATION_SOURCE.STORAGE,
    )
    emitDraft(key, merged, {
      locationAllocations: nextAllocations,
      storage: storageField?.destinationLocationKey
        ?? merged.storage
        ?? null,
    })
  }

  /**
   * @param {string[]} keys
   * @param {(merged: NewProductDraftValue) => Partial<NewProductDraftValue>} patcher
   * @param {string} message
   */
  function applyBulk(keys, patcher, message) {
    if (keys.length === 0) return

    /** @type {Record<string, NewProductDraftValue>} */
    const previous = {}
    /** @type {Record<string, NewProductDraftValue>} */
    const updates = {}

    cards.mapped.forEach(({ key, merged }) => {
      if (!keys.includes(key)) return
      previous[key] = toDraftPayload(merged)
      updates[key] = toDraftPayload({
        ...merged,
        ...patcher(merged),
      })
    })

    setUndoState({ message, drafts: previous })
    if (onChangeDraftsBulk) {
      onChangeDraftsBulk(updates)
    } else {
      Object.entries(updates).forEach(([key, draft]) => onChangeDraft?.(key, draft))
    }
    setBulkPanel(null)
  }

  function handleUndo() {
    if (!undoState) return
    if (onChangeDraftsBulk) {
      onChangeDraftsBulk(undoState.drafts)
    } else {
      Object.entries(undoState.drafts).forEach(([key, draft]) => onChangeDraft?.(key, draft))
    }
    setUndoState(null)
  }

  function toggleKey(key) {
    setSelectedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function selectVisible() {
    setSelectedKeys(new Set(visibleKeys))
  }

  function clearSelection() {
    setSelectedKeys(new Set())
    setBulkPanel(null)
  }

  /**
   * Deterministic filter contract (P8.28.2):
   * - Activating a non-All filter: replace selection with matching visible rows.
   * - Show All / All: restore full list and preserve existing selection keys.
   * - Bulk actions apply only to selected ∩ visible rows.
   *
   * @param {NewProductFilterId} nextFilter
   */
  function applyFilter(nextFilter) {
    setActiveFilter(nextFilter)
    setBulkPanel(null)
    if (nextFilter === 'all') {
      return
    }
    const matching = cards.mapped
      .filter((card) => matchesNewProductFilter(card, nextFilter, duplicateNameKeys))
      .map((card) => card.key)
    setSelectedKeys(new Set(matching))
  }

  function showAll() {
    applyFilter('all')
  }

  const totalCount = cards.mapped.length
  const showingCount = visibleCards.length
  const sharedCategories = Array.from(new Set([
    ...categoryOptions,
    ...cards.mapped.map(({ merged }) => merged.category).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b))

  const supplierOptions = buildStockItemSupplierOptions(suppliers, '')
  const bulkTargetKeys = selectedVisibleKeys
  const bulkTargetCount = bulkTargetKeys.length

  return (
    <section
      className="inventory-new-product-review"
      aria-label="New products"
      data-new-product-count={createRows.length}
      data-units-suggested={cards.unitsSuggested}
      data-need-unit-selection={cards.needUnitSelection}
      data-selected-count={selectedVisibleCount}
      data-active-filter={activeFilter}
      data-showing-count={showingCount}
      data-total-count={totalCount}
    >
      <header className="inventory-new-product-review-header">
        <div>
          <h3 className="inventory-operational-review-title">
            New Products
          </h3>
          <p className="inventory-new-product-review-subtext">
            Review every new product before import.
          </p>
          <p className="inventory-new-product-review-guidance">
            ONE has suggested units where possible. Confirm Product Name, Category, Unit, and location quantities.
          </p>
        </div>
      </header>

      {createRows.length === 0 ? (
        <div className="inventory-operational-review-empty" role="status">
          <p className="inventory-operational-review-empty-title">
            No new products
          </p>
          <p className="inventory-operational-review-empty-copy">
            All rows will link to existing ONE products or be skipped.
          </p>
        </div>
      ) : (
        <>
          <p className="inventory-new-product-review-summary" role="status">
            <span>
              Units suggested:
              {' '}
              {cards.unitsSuggested}
            </span>
            <span>
              Need unit selection:
              {' '}
              {cards.needUnitSelection}
            </span>
          </p>

          <div className="inventory-new-product-filter-bar" aria-label="Product filters">
            <div className="inventory-new-product-filter-chips" role="tablist" aria-label="Filter products">
              {INVENTORY_NEW_PRODUCT_FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  role="tab"
                  aria-selected={activeFilter === filter.id}
                  className={`inventory-new-product-filter-chip${activeFilter === filter.id ? ' is-active' : ''}`}
                  data-filter={filter.id}
                  onClick={() => applyFilter(/** @type {NewProductFilterId} */ (filter.id))}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <p className="inventory-new-product-filter-status" role="status">
              {`Showing ${showingCount} of ${totalCount} · Selected ${selectedVisibleCount}`}
            </p>
            <div className="inventory-new-product-filter-actions">
              <button type="button" className="inventory-new-product-smart-btn" onClick={selectVisible}>
                Select Visible
              </button>
              <button type="button" className="inventory-new-product-smart-btn" onClick={clearSelection}>
                Clear Selection
              </button>
              {activeFilter !== 'all' ? (
                <button type="button" className="inventory-new-product-smart-btn" onClick={showAll}>
                  Show All
                </button>
              ) : null}
            </div>
          </div>

          <div className="inventory-new-product-select-all-row">
            <label className="inventory-new-product-select-control">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                aria-label="Select visible new products"
                onChange={() => {
                  if (allVisibleSelected) clearSelection()
                  else selectVisible()
                }}
              />
              <span>Select Visible</span>
            </label>
            {selectedVisibleCount > 0 ? (
              <button type="button" className="inventory-new-product-clear-selection" onClick={clearSelection}>
                Clear Selection
              </button>
            ) : null}
          </div>

          {undoState ? (
            <div className="inventory-new-product-undo-banner" role="status">
              <span>{undoState.message}</span>
              <button type="button" onClick={handleUndo}>
                Undo
              </button>
            </div>
          ) : null}

          {visibleCards.length === 0 ? (
            <div className="inventory-operational-review-empty" role="status">
              <p className="inventory-operational-review-empty-title">
                No products match this filter
              </p>
              <p className="inventory-operational-review-empty-copy">
                Show All to return to the full new-product list.
              </p>
            </div>
          ) : (
            <ul className="inventory-new-product-review-list">
              {visibleCards.map(({ key, row, merged, validation, showingSuggested, resolvedAllocations }) => {
                const categories = Array.from(new Set([
                  ...categoryOptions,
                  ...(merged.category ? [merged.category] : []),
                ])).sort((a, b) => a.localeCompare(b))
                const rowSupplierOptions = buildStockItemSupplierOptions(
                  suppliers,
                  merged.supplier ?? '',
                  merged.supplierId ?? null,
                )
                const isSelected = selectedKeys.has(key)
                const allocationValid = !merged.skipped
                  && Array.isArray(resolvedAllocations?.blockers)
                  && resolvedAllocations.blockers.length === 0
                const draftValid = validation.valid && (merged.skipped || allocationValid)

                return (
                  <li
                    key={key}
                    className={`inventory-new-product-review-card${isSelected ? ' is-selected' : ''}${merged.skipped ? ' is-skipped' : ''}`}
                    data-row-key={key}
                    data-draft-valid={draftValid ? 'true' : 'false'}
                    data-unit-suggested={showingSuggested ? 'true' : 'false'}
                    data-storage={merged.storage ?? ''}
                    data-selected={isSelected ? 'true' : 'false'}
                    data-skipped={merged.skipped ? 'true' : 'false'}
                  >
                    <div className="inventory-new-product-review-card-head">
                      <label className="inventory-new-product-select-control">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          aria-label={`Select ${merged.productName || 'product'}`}
                          onChange={() => toggleKey(key)}
                        />
                      </label>
                      <div>
                        <h4 className="inventory-new-product-review-source-name">
                          {formatOperationalImportPreviewValue(row.source?.productName)}
                        </h4>
                        <p className="inventory-new-product-review-source-category">
                          {formatOperationalImportPreviewValue(row.source?.category)}
                        </p>
                      </div>
                      <span className="inventory-new-product-review-badge">
                        {merged.skipped ? 'Skipped' : 'New Product'}
                      </span>
                    </div>

                    <div className="inventory-new-product-review-fields">
                      <label className="inventory-new-product-review-field">
                        <span>Product Name</span>
                        <input
                          type="text"
                          value={merged.productName}
                          disabled={merged.skipped}
                          aria-invalid={validation.errors.productName ? 'true' : undefined}
                          onChange={(event) => {
                            emitDraft(key, merged, { productName: event.target.value })
                          }}
                        />
                        {validation.errors.productName ? (
                          <span className="inventory-new-product-review-error" role="alert">
                            {validation.errors.productName}
                          </span>
                        ) : null}
                      </label>

                      <label className="inventory-new-product-review-field">
                        <span>Category</span>
                        <select
                          value={merged.category}
                          disabled={merged.skipped}
                          aria-invalid={validation.errors.category ? 'true' : undefined}
                          onChange={(event) => {
                            emitDraft(key, merged, { category: event.target.value })
                          }}
                        >
                          {categories.length === 0 ? (
                            <option value="">Select category</option>
                          ) : null}
                          {categories.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                        {validation.errors.category ? (
                          <span className="inventory-new-product-review-error" role="alert">
                            {validation.errors.category}
                          </span>
                        ) : null}
                      </label>

                      <label className="inventory-new-product-review-field">
                        <span>Unit</span>
                        <select
                          value={merged.unit ?? ''}
                          disabled={merged.skipped}
                          aria-invalid={validation.errors.unit ? 'true' : undefined}
                          onChange={(event) => {
                            emitDraft(key, merged, {
                              unit: event.target.value === '' ? null : event.target.value,
                            })
                          }}
                        >
                          <option value="">Select unit</option>
                          {INVENTORY_NEW_PRODUCT_UNITS.map((unit) => (
                            <option key={unit} value={unit}>
                              {unit}
                            </option>
                          ))}
                        </select>
                        {showingSuggested ? (
                          <span className="inventory-new-product-review-hint">
                            Suggested from product name
                          </span>
                        ) : null}
                        {validation.errors.unit ? (
                          <span className="inventory-new-product-review-error" role="alert">
                            {validation.errors.unit}
                          </span>
                        ) : null}
                      </label>

                      <label className="inventory-new-product-review-field">
                        <span>Supplier</span>
                        <select
                          value={merged.supplier ?? ''}
                          disabled={merged.skipped}
                          aria-label="Supplier"
                          onChange={(event) => {
                            const nextName = normalizeSupplierName(event.target.value)
                            const matched = suppliers.find(
                              (supplier) => normalizeSupplierName(supplier.companyName) === nextName,
                            )
                            emitDraft(key, merged, {
                              supplier: nextName,
                              supplierId: matched?.id ?? null,
                            })
                          }}
                        >
                          {rowSupplierOptions.map((option) => (
                            <option
                              key={option.value || 'no-supplier'}
                              value={option.value}
                              disabled={option.disabled}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <InventoryImportLocationAllocationEditor
                      allocations={resolvedAllocations?.allocations ?? []}
                      totalOpeningStock={resolvedAllocations?.totalOpeningStock ?? null}
                      workspaceId={workspaceId}
                      disabled={merged.skipped}
                      onChangeAllocation={(sourceField, patch) => {
                        emitAllocationChange(
                          key,
                          merged,
                          merged.locationAllocations ?? [],
                          sourceField,
                          patch,
                        )
                      }}
                    />
                  </li>
                )
              })}
            </ul>
          )}

          {bulkTargetCount > 0 ? (
            <div className="inventory-new-product-bulk-bar" role="toolbar" aria-label="Bulk actions">
              <span className="inventory-new-product-bulk-count">
                {bulkTargetCount}
                {' '}
                selected
              </span>
              <button type="button" onClick={() => setBulkPanel(bulkPanel === 'storage' ? null : 'storage')}>
                Assign Storage Destination
              </button>
              <button type="button" onClick={() => setBulkPanel(bulkPanel === 'unit' ? null : 'unit')}>
                Assign Unit
              </button>
              <button type="button" onClick={() => setBulkPanel(bulkPanel === 'category' ? null : 'category')}>
                Assign Category
              </button>
              <button type="button" onClick={() => setBulkPanel(bulkPanel === 'supplier' ? null : 'supplier')}>
                Assign Supplier
              </button>
              <button
                type="button"
                onClick={() => {
                  applyBulk(
                    bulkTargetKeys,
                    () => ({ skipped: true }),
                    `Skipped ${bulkTargetCount} product${bulkTargetCount === 1 ? '' : 's'}.`,
                  )
                  clearSelection()
                }}
              >
                Skip Selected
              </button>
              <button type="button" onClick={clearSelection}>
                Clear Selection
              </button>

              {bulkPanel === 'storage' ? (
                <div className="inventory-new-product-bulk-panel">
                  <WorkspaceStorageSelector
                    workspaceId={workspaceId}
                    value=""
                    variant="select"
                    emptyLabel="Choose storage destination"
                    aria-label="Bulk assign storage destination"
                    onChange={(locationKey) => {
                      if (!locationKey) return
                      applyBulk(
                        bulkTargetKeys,
                        (merged) => {
                          const baseAllocations = Array.isArray(merged.locationAllocations)
                            ? merged.locationAllocations
                            : []
                          const hasStorage = baseAllocations.some(
                            (allocation) => (
                              allocation.sourceField === INVENTORY_LOCATION_ALLOCATION_SOURCE.STORAGE
                            ),
                          )
                          const nextAllocations = hasStorage
                            ? baseAllocations.map((allocation) => (
                              allocation.sourceField === INVENTORY_LOCATION_ALLOCATION_SOURCE.STORAGE
                                ? {
                                    ...allocation,
                                    destinationLocationKey: locationKey,
                                    destinationStorageId: null,
                                    bindingStatus: 'mapped',
                                  }
                                : allocation
                            ))
                            : [
                              ...baseAllocations,
                              {
                                sourceField: INVENTORY_LOCATION_ALLOCATION_SOURCE.STORAGE,
                                quantityInput: '',
                                destinationLocationKey: locationKey,
                                destinationStorageId: null,
                                bindingStatus: 'mapped',
                              },
                            ]
                          return {
                            storage: locationKey,
                            locationAllocations: nextAllocations,
                            skipped: false,
                          }
                        },
                        `Storage destination assigned to ${bulkTargetCount} product${bulkTargetCount === 1 ? '' : 's'}.`,
                      )
                    }}
                  />
                </div>
              ) : null}

              {bulkPanel === 'unit' ? (
                <div className="inventory-new-product-bulk-panel">
                  <select
                    aria-label="Bulk assign unit"
                    defaultValue=""
                    onChange={(event) => {
                      const unit = event.target.value === '' ? null : event.target.value
                      if (!unit) return
                      applyBulk(
                        bulkTargetKeys,
                        () => ({ unit, skipped: false }),
                        `Unit assigned to ${bulkTargetCount} product${bulkTargetCount === 1 ? '' : 's'}.`,
                      )
                    }}
                  >
                    <option value="">Choose unit</option>
                    {INVENTORY_NEW_PRODUCT_UNITS.map((unit) => (
                      <option key={unit} value={unit}>{unit}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              {bulkPanel === 'category' ? (
                <div className="inventory-new-product-bulk-panel">
                  <select
                    aria-label="Bulk assign category"
                    defaultValue=""
                    onChange={(event) => {
                      const category = event.target.value
                      if (!category) return
                      applyBulk(
                        bulkTargetKeys,
                        () => ({ category, skipped: false }),
                        `Category assigned to ${bulkTargetCount} product${bulkTargetCount === 1 ? '' : 's'}.`,
                      )
                    }}
                  >
                    <option value="">Choose category</option>
                    {sharedCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              {bulkPanel === 'supplier' ? (
                <div className="inventory-new-product-bulk-panel">
                  <select
                    aria-label="Bulk assign supplier"
                    defaultValue=""
                    onChange={(event) => {
                      const nextName = normalizeSupplierName(event.target.value)
                      if (!nextName) return
                      const matched = suppliers.find(
                        (supplier) => normalizeSupplierName(supplier.companyName) === nextName,
                      )
                      applyBulk(
                        bulkTargetKeys,
                        () => ({
                          supplier: nextName,
                          supplierId: matched?.id ?? null,
                          skipped: false,
                        }),
                        `Supplier assigned to ${bulkTargetCount} product${bulkTargetCount === 1 ? '' : 's'}.`,
                      )
                    }}
                  >
                    <option value="">Choose supplier</option>
                    {supplierOptions
                      .filter((option) => option.value && !option.disabled)
                      .map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                  </select>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}
