import { useMemo, useState } from 'react'
import {
  STOCK_CATEGORIES,
  STOCK_LOCATIONS,
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
  onClose,
  onSubmit,
  isSaving,
  workspaceId = '',
  isWorkspaceReady = false,
  workspaceSetupMessage = '',
}) {
  const isEditing = Boolean(initialItem?.id)
  const [form, setForm] = useState(() => (
    initialItem?.id ? stockItemToForm(initialItem) : buildEmptyStockItemForm()
  ))
  const [error, setError] = useState('')

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

    if (!isWorkspaceReady || !`${workspaceId ?? ''}`.trim()) {
      setError(workspaceSetupMessage || 'Workspace is still loading. Please wait a moment and try again.')
      return
    }

    const validationError = validateStockItemForm(form)
    if (validationError) {
      setError(validationError)
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
            <h3 id="stock-item-form-title">{isEditing ? 'Edit Stock Item' : 'New Stock Item'}</h3>
            <p className="stock-item-form-subtitle">
              {isEditing ? 'Update product details and stock levels.' : 'Add a product to your inventory.'}
            </p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form className="stock-item-form" onSubmit={handleSubmit}>
          <div className="stock-item-form-scroll">
            {!isWorkspaceReady && workspaceSetupMessage ? (
              <div className="staff-status-banner">{workspaceSetupMessage}</div>
            ) : null}

            <StockFormSection title="Product details">
            <label className="stock-form-field stock-form-field-full">
              <span>Name</span>
              <input
                type="text"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. Ketel One"
                autoFocus
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
                <span>Type</span>
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

            <label className="stock-form-field stock-form-field-full">
              <span>Supplier</span>
              <input
                type="text"
                value={form.supplier}
                onChange={(event) => setForm((current) => ({ ...current, supplier: event.target.value }))}
                placeholder="e.g. Malakakos AE"
              />
            </label>
          </StockFormSection>

          <StockFormSection title="Stock control">
            <div className="stock-form-field stock-form-field-full">
              <span>Unit</span>
              <div className="stock-unit-preset-grid" role="group" aria-label="Unit presets">
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

            <div className="stock-form-row stock-form-row-triple">
              <label className="stock-form-field">
                <span>Current quantity</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.currentQuantity}
                  onChange={(event) => setForm((current) => ({ ...current, currentQuantity: event.target.value }))}
                  placeholder="0"
                />
              </label>

              <label className="stock-form-field">
                <span>Minimum alert</span>
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
                <span>Target stock</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.targetQuantity}
                  onChange={(event) => setForm((current) => ({ ...current, targetQuantity: event.target.value }))}
                  placeholder="Par level"
                />
              </label>
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

          <StockFormSection title="Location">
            <div className="stock-form-field stock-form-field-full">
              <span>Storage location</span>
              <div className="stock-location-grid" role="group" aria-label="Storage locations">
                {STOCK_LOCATIONS.map((location) => (
                  <button
                    key={location}
                    type="button"
                    className={`stock-location-preset${form.storageLocation === location ? ' active' : ''}`}
                    onClick={() => setForm((current) => ({ ...current, storageLocation: location }))}
                  >
                    {location}
                  </button>
                ))}
              </div>
            </div>
          </StockFormSection>

            {error ? <div className="staff-status-banner">{error}</div> : null}
          </div>

          <div className="stock-item-form-footer">
            <button type="button" className="ghost-btn stock-item-form-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-btn stock-item-form-submit" disabled={isSaving || !isWorkspaceReady}>
              {isSaving ? 'Saving…' : isEditing ? 'Save changes' : '+ Create stock item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
