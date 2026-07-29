/**
 * P8.16.14 / P8.26.6 / P8.28.1 — New product review with bulk resolution workspace.
 *
 * Wizard-local drafts only. No database writes, product creation, or Apply.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  INVENTORY_NEW_PRODUCT_UNITS,
  getNewProductDraftDefaults,
  listCreateNewPreviewRows,
  mergeNewProductDraft,
  validateNewProductDraft,
} from '../../lib/inventoryNewProductDrafts'
import { INVENTORY_UNIT_INFERENCE_STATUS } from '../../lib/inventoryUnitInference'
import { buildStockItemSupplierOptions, normalizeSupplierName } from '../../lib/stockSupplierUtils'
import { getSuppliers } from '../../services/supplierService'
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
 * }} NewProductDraftValue
 */

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
  }
}

/**
 * @param {{
 *   preview?: object|null,
 *   drafts?: Record<string, NewProductDraftValue>,
 *   categoryOptions?: string[],
 *   workspaceId?: string,
 *   onChangeDraft?: (rowKey: string, next: NewProductDraftValue) => void,
 *   onChangeDraftsBulk?: (updates: Record<string, NewProductDraftValue>) => void,
 * }} props
 */
export function InventoryNewProductReview({
  preview = null,
  drafts = {},
  categoryOptions = [],
  workspaceId = '',
  onChangeDraft = undefined,
  onChangeDraftsBulk = undefined,
} = {}) {
  const createRows = useMemo(() => listCreateNewPreviewRows(preview), [preview])
  const [selectedKeys, setSelectedKeys] = useState(() => new Set())
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
      const merged = mergeNewProductDraft(row, drafts[key] ?? defaults)
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
      }
    })

    return { mapped, unitsSuggested, needUnitSelection }
  }, [createRows, drafts])

  const allKeys = useMemo(() => cards.mapped.map((card) => card.key), [cards.mapped])
  const allKeysSignature = allKeys.join('\u0001')
  const selectedCount = selectedKeys.size
  const allSelected = allKeys.length > 0 && allKeys.every((key) => selectedKeys.has(key))

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

  function selectKeys(keys) {
    setSelectedKeys(new Set(keys))
  }

  function clearSelection() {
    setSelectedKeys(new Set())
    setBulkPanel(null)
  }

  function selectMissingUnits() {
    selectKeys(cards.mapped.filter(({ merged }) => !merged.skipped && !merged.unit).map(({ key }) => key))
  }

  function selectMissingStorage() {
    selectKeys(cards.mapped.filter(({ merged }) => !merged.skipped && !merged.storage).map(({ key }) => key))
  }

  function selectMissingSupplier() {
    selectKeys(cards.mapped.filter(({ merged }) => !merged.skipped && !`${merged.supplier ?? ''}`.trim()).map(({ key }) => key))
  }

  function selectNewProducts() {
    selectKeys(allKeys)
  }

  function selectDuplicateProducts() {
    selectKeys([...duplicateNameKeys])
  }

  const selectedKeyList = [...selectedKeys]
  const sharedCategories = Array.from(new Set([
    ...categoryOptions,
    ...cards.mapped.map(({ merged }) => merged.category).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b))

  const supplierOptions = buildStockItemSupplierOptions(suppliers, '')

  return (
    <section
      className="inventory-new-product-review"
      aria-label="New products"
      data-new-product-count={createRows.length}
      data-units-suggested={cards.unitsSuggested}
      data-need-unit-selection={cards.needUnitSelection}
      data-selected-count={selectedCount}
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
            ONE has suggested units where possible. Confirm Product Name, Category, Unit, and Storage.
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
            <span>
              Selected:
              {' '}
              {selectedCount}
            </span>
          </p>

          <div className="inventory-new-product-smart-select" aria-label="Smart selection">
            <button type="button" className="inventory-new-product-smart-btn" onClick={selectMissingUnits}>
              Select Missing Units
            </button>
            <button type="button" className="inventory-new-product-smart-btn" onClick={selectMissingStorage}>
              Select Missing Storage
            </button>
            <button type="button" className="inventory-new-product-smart-btn" onClick={selectMissingSupplier}>
              Select Missing Supplier
            </button>
            <button type="button" className="inventory-new-product-smart-btn" onClick={selectNewProducts}>
              Select New Products
            </button>
            <button type="button" className="inventory-new-product-smart-btn" onClick={selectDuplicateProducts}>
              Select Duplicate Products
            </button>
            <button type="button" className="inventory-new-product-smart-btn" onClick={selectNewProducts}>
              Select Current Page
            </button>
            <button type="button" className="inventory-new-product-smart-btn" onClick={selectNewProducts}>
              Select All
            </button>
            <button type="button" className="inventory-new-product-smart-btn" onClick={clearSelection}>
              Clear Selection
            </button>
          </div>

          <div className="inventory-new-product-select-all-row">
            <label className="inventory-new-product-select-control">
              <input
                type="checkbox"
                checked={allSelected}
                aria-label="Select all new products"
                onChange={() => {
                  if (allSelected) clearSelection()
                  else selectNewProducts()
                }}
              />
              <span>Select All</span>
            </label>
            {selectedCount > 0 ? (
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

          <ul className="inventory-new-product-review-list">
            {cards.mapped.map(({ key, row, merged, validation, showingSuggested }) => {
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

              return (
                <li
                  key={key}
                  className={`inventory-new-product-review-card${isSelected ? ' is-selected' : ''}${merged.skipped ? ' is-skipped' : ''}`}
                  data-row-key={key}
                  data-draft-valid={validation.valid ? 'true' : 'false'}
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

                  <dl className="inventory-new-product-review-facts">
                    <div>
                      <dt>Source storage</dt>
                      <dd>{formatOperationalImportPreviewValue(row.source?.storage)}</dd>
                    </div>
                    <div>
                      <dt>BAR</dt>
                      <dd>{formatOperationalImportPreviewValue(row.source?.bar)}</dd>
                    </div>
                  </dl>

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
                      <span>Storage</span>
                      <WorkspaceStorageSelector
                        workspaceId={workspaceId}
                        value={merged.storage ?? ''}
                        variant="select"
                        disabled={merged.skipped}
                        emptyLabel="Select storage"
                        aria-label="Storage"
                        onChange={(locationKey) => {
                          emitDraft(key, merged, {
                            storage: locationKey === '' ? null : locationKey,
                          })
                        }}
                      />
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
                </li>
              )
            })}
          </ul>

          {selectedCount > 0 ? (
            <div className="inventory-new-product-bulk-bar" role="toolbar" aria-label="Bulk actions">
              <span className="inventory-new-product-bulk-count">
                {selectedCount}
                {' '}
                selected
              </span>
              <button type="button" onClick={() => setBulkPanel(bulkPanel === 'storage' ? null : 'storage')}>
                Assign Storage
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
                    selectedKeyList,
                    () => ({ skipped: true }),
                    `Skipped ${selectedCount} product${selectedCount === 1 ? '' : 's'}.`,
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
                    emptyLabel="Choose storage"
                    aria-label="Bulk assign storage"
                    onChange={(locationKey) => {
                      if (!locationKey) return
                      applyBulk(
                        selectedKeyList,
                        () => ({ storage: locationKey, skipped: false }),
                        `Storage assigned to ${selectedCount} product${selectedCount === 1 ? '' : 's'}.`,
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
                        selectedKeyList,
                        () => ({ unit, skipped: false }),
                        `Unit assigned to ${selectedCount} product${selectedCount === 1 ? '' : 's'}.`,
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
                        selectedKeyList,
                        () => ({ category, skipped: false }),
                        `Category assigned to ${selectedCount} product${selectedCount === 1 ? '' : 's'}.`,
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
                        selectedKeyList,
                        () => ({
                          supplier: nextName,
                          supplierId: matched?.id ?? null,
                          skipped: false,
                        }),
                        `Supplier assigned to ${selectedCount} product${selectedCount === 1 ? '' : 's'}.`,
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
