import { useState } from 'react'

const EMPTY_FORM = {
  companyName: '',
  contactPerson: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  active: true,
}

export function StockSupplierFormModal({
  isOpen,
  supplier = null,
  isSaving = false,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(() => (
    supplier
      ? {
          companyName: supplier.companyName ?? '',
          contactPerson: supplier.contactPerson ?? '',
          phone: supplier.phone ?? '',
          email: supplier.email ?? '',
          address: supplier.address ?? '',
          notes: supplier.notes ?? '',
          active: supplier.active !== false,
        }
      : EMPTY_FORM
  ))

  if (!isOpen) return null

  const handleSubmit = (event) => {
    event.preventDefault()

    onSubmit?.({
      companyName: form.companyName.trim(),
      contactPerson: form.contactPerson.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      notes: form.notes.trim(),
      active: form.active,
    })
  }

  return (
    <div className="employee-modal-backdrop task-modal-backdrop stock-supplier-form-backdrop" onClick={onClose}>
      <div
        className="employee-modal task-form-modal is-responsive-sheet stock-supplier-form-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-supplier-form-title"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Supplier</p>
            <h3 id="stock-supplier-form-title">{supplier ? 'Edit supplier' : 'Add supplier'}</h3>
          </div>
          <button type="button" className="icon-btn stock-supplier-form-close" onClick={onClose} aria-label="Close supplier form">
            ✕
          </button>
        </div>

        <form className="employee-form stock-supplier-form" onSubmit={handleSubmit}>
          <div className="form-grid">
            <label className="form-field">
              <span>Supplier name</span>
              <input
                value={form.companyName}
                onChange={(event) => setForm((current) => ({ ...current, companyName: event.target.value }))}
                placeholder="Company name"
                required
              />
            </label>
            <label className="form-field">
              <span>Contact person</span>
              <input
                value={form.contactPerson}
                onChange={(event) => setForm((current) => ({ ...current, contactPerson: event.target.value }))}
                placeholder="Contact person"
              />
            </label>
            <label className="form-field">
              <span>Phone</span>
              <input
                value={form.phone}
                onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="Phone"
              />
            </label>
            <label className="form-field">
              <span>Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="Email"
              />
            </label>
            <label className="form-field full-width">
              <span>Address</span>
              <input
                value={form.address}
                onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                placeholder="Address"
              />
            </label>
          </div>

          <label className="form-field full-width">
            <span>Notes</span>
            <textarea
              rows={4}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Delivery notes, account details, or preferences"
            />
          </label>

          <label className="stock-supplier-active-toggle">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
            />
            <span className="stock-supplier-active-toggle-copy">
              <strong>Active supplier</strong>
              <span>Inactive suppliers stay in history but are hidden from new orders.</span>
            </span>
          </label>

          <div className="modal-actions">
            <button type="button" className="ghost-btn stock-supplier-form-action" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-btn stock-supplier-form-action" disabled={isSaving}>
              {isSaving ? 'Saving…' : 'Save supplier'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function getEmptySupplierForm() {
  return { ...EMPTY_FORM }
}
