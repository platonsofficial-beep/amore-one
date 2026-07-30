import { useEffect, useMemo, useState } from 'react'
import {
  PRODUCT_METADATA_LIMITS,
  STOCK_CATEGORIES,
  STOCK_UNIT_CUSTOM_VALUE,
  buildEmptyStockItemForm,
  getDefaultLocationForCategory,
  getDefaultUnitForCategory,
  getStockTypeOptionsForCategory,
  getStockUnitPresetsForCategory,
  normalizeStockCategory,
  resolveStockFormUnit,
  stockFormToPayload,
  stockItemToForm,
  validateStockItemForm,
} from '../../lib/stockCatalog'
import { buildStockItemSupplierOptions, normalizeSupplierName } from '../../lib/stockSupplierUtils'
import { WorkspaceStorageSelector } from './WorkspaceStorageSelector'

function StockFormSection({ title, children }) {
  return (
    <section className="stock-form-section">
      <h4 className="stock-form-section-title">{title}</h4>
      <div className="stock-form-section-body">{children}</div>
    </section>
  )
}

export function StockItemFormModal({
  initialItem,
  initialForm = null,
  onClose,
  onSubmit,
  isSaving,
  workspaceId = '',
  isWorkspaceReady = false,
  workspaceSetupMessage = '',
  suppliers = [],
  canManage = false,
  onOpenAddSupplier,
  supplierPrefill = '',
  onSupplierPrefillApplied,
}) {
  const isEditing = Boolean(initialItem?.id)
  const isDuplicating = Boolean(initialForm && !initialItem?.id)
  const [form, setForm] = useState(() => {
    if (initialItem?.id) return stockItemToForm(initialItem)
    if (initialForm) return initialForm
    return buildEmptyStockItemForm()
  })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supplierPrefill) return
    const nextSupplier = normalizeSupplierName(supplierPrefill)
    if (!nextSupplier) return
    setForm((current) => ({ ...current, supplier: nextSupplier }))
    onSupplierPrefillApplied?.()
  }, [supplierPrefill, onSupplierPrefillApplied])

  const supplierOptions = useMemo(
    () => buildStockItemSupplierOptions(suppliers, form.supplier),
    [suppliers, form.supplier],
  )

  const hasInactiveSupplierSelected = useMemo(
    () => supplierOptions.some((option) => option.disabled && option.value === form.supplier),
    [supplierOptions, form.supplier],
  )

  const typeOptions = useMemo(
    () => getStockTypeOptionsForCategory(form.category),
    [form.category],
  )

  const unitPresets = useMemo(
    () => getStockUnitPresetsForCategory(form.category),
    [form.category],
  )

  const handleCategoryChange = (category) => {
    const normalizedCategory = normalizeStockCategory(category)
    const nextTypeOptions = getStockTypeOptionsForCategory(normalizedCategory)

    setForm((current) => ({
      ...current,
      category: normalizedCategory,
      itemType: nextTypeOptions[0] ?? 'Other',
      storageLocation: getDefaultLocationForCategory(normalizedCategory),
      unitPreset: getDefaultUnitForCategory(normalizedCategory),
      customUnit: '',
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (isSaving) return

    if (!isWorkspaceReady || !`${workspaceId ?? ''}`.trim()) {
      setError(workspaceSetupMessage || 'Workspace is still loading. Please wait a moment and try again.')
      return
    }

    const validationError = validateStockItemForm(form)
    if (validationError) {
      setError(validationError)
      return
    }

    const inactiveSupplierSelected = supplierOptions.some(
      (option) => option.disabled && option.value === normalizeSupplierName(form.supplier),
    )
    if (inactiveSupplierSelected) {
      setError('Select an active supplier before saving.')
      return
    }

    try {
      setError('')
      await onSubmit(stockFormToPayload(form))
      onClose()
    } catch (submitError) {
      setError(submitError?.message || 'Unable to save this item right now. Please try again.')
    }
  }

  const resolvedUnit = resolveStockFormUnit(form)

  return (
    <div className="employee-modal-backdrop" onClick={onClose}>
      <div
        className="employee-modal stock-item-form-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-item-form-title"
      >
        <div className="stock-item-form-header">
          <div>
            <p className="eyebrow">Stock</p>
            <h3 id="stock-item-form-title">
              {isEditing ? 'Edit Stock Item' : isDuplicating ? 'Duplicate Stock Item' : 'New Stock Item'}
            </h3>
            <p className="stock-item-form-subtitle">
              {isEditing
                ? 'Update product details and stock levels.'
                : isDuplicating
                  ? 'Create a similar product. Update the name and starting quantity.'
                  : 'Add a product to your inventory.'}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="stock-item-form" onSubmit={handleSubmit}>
          <div className="stock-item-form-scroll">
            {!isWorkspaceReady && workspaceSetupMessage ? (
              <div className="staff-status-banner">{workspaceSetupMessage}</div>
            ) : null}

            <StockFormSection title="Identity">
              <label className="stock-form-field stock-form-field-full">
                <span>Product Name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g. Belvedere Vodka"
                  autoFocus
                />
              </label>

              <label className="stock-form-field stock-form-field-full">
                <span>Brand (optional)</span>
                <input
                  type="text"
                  value={form.brand ?? ''}
                  maxLength={PRODUCT_METADATA_LIMITS.brand}
                  onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))}
                  placeholder="e.g. Belvedere"
                />
              </label>

              <div className="stock-form-row">
                <label className="stock-form-field">
                  <span>Category</span>
                  <select
                    value={form.category}
                    onChange={(event) => handleCategoryChange(event.target.value)}
                  >
                    {STOCK_CATEGORIES.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>

                <label className="stock-form-field">
                  <span>Subcategory</span>
                  <select
                    value={form.itemType}
                    onChange={(event) => setForm((current) => ({ ...current, itemType: event.target.value }))}
                    required
                  >
                    {typeOptions.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>
              </div>
            </StockFormSection>

            <StockFormSection title="Inventory">
              <div className="stock-form-field stock-form-field-full">
                <span>Inventory Unit</span>
                <div className="stock-unit-preset-grid" role="group" aria-label="Inventory unit presets">
                  {unitPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className={`stock-unit-preset${form.unitPreset === preset ? ' active' : ''}`}
                      onClick={() => setForm((current) => ({
                        ...current,
                        unitPreset: preset,
                        customUnit: '',
                      }))}
                    >
                      {preset}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`stock-unit-preset${form.unitPreset === STOCK_UNIT_CUSTOM_VALUE ? ' active' : ''}`}
                    onClick={() => setForm((current) => ({
                      ...current,
                      unitPreset: STOCK_UNIT_CUSTOM_VALUE,
                    }))}
                  >
                    Custom
                  </button>
                </div>
              </div>

              {form.unitPreset === STOCK_UNIT_CUSTOM_VALUE ? (
                <label className="stock-form-field stock-form-field-full">
                  <span>Custom unit</span>
                  <input
                    type="text"
                    value={form.customUnit}
                    onChange={(event) => setForm((current) => ({ ...current, customUnit: event.target.value }))}
                    placeholder="Enter custom unit"
                  />
                </label>
              ) : (
                <p className="stock-unit-selected">Selected: {resolvedUnit || '—'}</p>
              )}

              <label className="stock-form-field stock-form-field-full">
                <span>Size (optional)</span>
                <input
                  type="text"
                  value={form.size ?? ''}
                  maxLength={PRODUCT_METADATA_LIMITS.size}
                  onChange={(event) => setForm((current) => ({ ...current, size: event.target.value }))}
                  placeholder="e.g. 700 ml, 1 L, 250 ml"
                />
              </label>

              <label className="stock-form-field stock-form-field-full">
                <span>Packaging note (optional)</span>
                <input
                  type="text"
                  value={form.packagingNote ?? ''}
                  maxLength={240}
                  onChange={(event) => setForm((current) => ({
                    ...current,
                    packagingNote: event.target.value,
                  }))}
                  placeholder="e.g. Usually supplied in cases"
                />
              </label>

              <label className="stock-form-field stock-form-field-full">
                <span>Barcode (optional)</span>
                <input
                  type="text"
                  value={form.barcode ?? ''}
                  maxLength={PRODUCT_METADATA_LIMITS.barcode}
                  onChange={(event) => setForm((current) => ({ ...current, barcode: event.target.value }))}
                  placeholder="Optional product barcode"
                />
              </label>
            </StockFormSection>

            <StockFormSection title="Purchasing">
              <div className="stock-form-field stock-form-field-full stock-supplier-field">
                <span>Supplier</span>
                <div className="stock-supplier-field-row">
                  <select
                    className="stock-supplier-select"
                    value={form.supplier}
                    onChange={(event) => setForm((current) => ({
                      ...current,
                      supplier: normalizeSupplierName(event.target.value),
                    }))}
                    aria-describedby={hasInactiveSupplierSelected ? 'stock-supplier-inactive-note' : undefined}
                  >
                    {supplierOptions.map((option) => (
                      <option
                        key={option.value || 'no-supplier'}
                        value={option.value}
                        disabled={option.disabled}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {canManage ? (
                    <button
                      type="button"
                      className="ghost-btn stock-add-supplier-btn"
                      onClick={onOpenAddSupplier}
                      disabled={isSaving}
                    >
                      + Add supplier
                    </button>
                  ) : null}
                </div>
                {hasInactiveSupplierSelected ? (
                  <p id="stock-supplier-inactive-note" className="stock-supplier-field-note">
                    Current supplier is inactive or not in the directory. Select an active supplier to update.
                  </p>
                ) : null}
              </div>

              <label className="stock-form-field stock-form-field-full">
                <span>Purchase price (€ per unit)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.purchasePrice}
                  onChange={(event) => setForm((current) => ({ ...current, purchasePrice: event.target.value }))}
                  placeholder="0.00"
                />
              </label>
            </StockFormSection>

            <StockFormSection title="Storage">
              <div className="stock-form-field stock-form-field-full">
                <span>Default Storage</span>
                <WorkspaceStorageSelector
                  workspaceId={workspaceId}
                  value={form.storageLocation}
                  variant="grid"
                  disabled={isSaving}
                  onChange={(locationKey) => setForm((current) => ({
                    ...current,
                    storageLocation: locationKey,
                  }))}
                />
              </div>

              <div className="stock-form-row stock-form-row-triple">
                <label className="stock-form-field">
                  <span>Minimum</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.minimumQuantity}
                    onChange={(event) => setForm((current) => ({ ...current, minimumQuantity: event.target.value }))}
                    placeholder="0"
                  />
                </label>

                <label className="stock-form-field">
                  <span>Target</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.targetQuantity}
                    onChange={(event) => setForm((current) => ({ ...current, targetQuantity: event.target.value }))}
                    placeholder="Par level"
                  />
                </label>

                <label className="stock-form-field">
                  <span>Current</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={form.currentQuantity}
                    onChange={(event) => setForm((current) => ({ ...current, currentQuantity: event.target.value }))}
                    placeholder="0"
                  />
                </label>
              </div>
            </StockFormSection>

            {error ? <div className="staff-status-banner">{error}</div> : null}
          </div>

          <div className="stock-item-form-footer">
            <button type="button" className="ghost-btn stock-item-form-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-btn stock-item-form-submit" disabled={isSaving || !isWorkspaceReady}>
              {isSaving ? 'Saving…' : isEditing ? 'Save changes' : isDuplicating ? 'Create duplicate' : '+ Create stock item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
