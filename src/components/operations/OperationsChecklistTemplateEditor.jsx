import { useMemo, useState } from 'react'
import {
  buildEmptyChecklistItemForm,
  buildEmptyChecklistTemplateForm,
  CHECKLIST_DEPARTMENTS,
  getChecklistDepartmentLabel,
  moveChecklistItemByDrag,
  reorderChecklistItems,
  sortChecklistItems,
  validateChecklistItemForm,
  validateChecklistTemplateForm,
} from '../../lib/operationsChecklistUtils'

function ChecklistItemEditorRow({
  item,
  index,
  totalCount,
  isSaving,
  onChange,
  onMove,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
}) {
  return (
    <li
      className="operations-checklist-item-row"
      draggable={!isSaving}
      onDragStart={(event) => onDragStart(event, item.id)}
      onDragOver={onDragOver}
      onDrop={(event) => onDrop(event, item.id)}
    >
      <button
        type="button"
        className="operations-checklist-item-drag"
        aria-label={`Reorder ${item.title}`}
        disabled={isSaving}
      >
        ⋮⋮
      </button>

      <div className="operations-checklist-item-fields">
        <input
          value={item.title}
          onChange={(event) => onChange(item.id, { title: event.target.value })}
          placeholder={`Task ${index + 1}`}
          disabled={isSaving}
        />
        <textarea
          rows={2}
          value={item.description}
          onChange={(event) => onChange(item.id, { description: event.target.value })}
          placeholder="Optional details"
          disabled={isSaving}
        />
      </div>

      <div className="operations-checklist-item-actions">
        <button
          type="button"
          className="ghost-btn operations-checklist-item-action"
          onClick={() => onMove(item.id, 'up')}
          disabled={isSaving || index === 0}
          aria-label="Move up"
        >
          ↑
        </button>
        <button
          type="button"
          className="ghost-btn operations-checklist-item-action"
          onClick={() => onMove(item.id, 'down')}
          disabled={isSaving || index >= totalCount - 1}
          aria-label="Move down"
        >
          ↓
        </button>
        <button
          type="button"
          className="ghost-btn operations-checklist-item-action operations-checklist-item-delete"
          onClick={() => onDelete(item)}
          disabled={isSaving}
        >
          Delete
        </button>
      </div>
    </li>
  )
}

export function OperationsChecklistTemplateEditor({
  template = null,
  isSaving = false,
  onClose,
  onSaveTemplate,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onSaveItemOrder,
}) {
  const [form, setForm] = useState(() => (
    template
      ? {
        name: template.name ?? '',
        department: template.department ?? 'service',
        active: template.active !== false,
      }
      : buildEmptyChecklistTemplateForm()
  ))
  const [items, setItems] = useState(() => sortChecklistItems(template?.items ?? []))
  const [newItemForm, setNewItemForm] = useState(() => buildEmptyChecklistItemForm(items.length))
  const [error, setError] = useState('')
  const [draggedItemId, setDraggedItemId] = useState(null)

  const isEditing = Boolean(template?.id)

  const handleSaveTemplate = async (event) => {
    event.preventDefault()
    const validationError = validateChecklistTemplateForm(form)
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setError('')
      const savedTemplate = await onSaveTemplate?.({
        ...form,
        name: form.name.trim(),
      }, items)

      const templateId = savedTemplate?.id ?? template?.id
      if (templateId) {
        await persistDraftItems(templateId, sortChecklistItems(items))
        if (isEditing) {
          await onSaveItemOrder?.(sortChecklistItems(items))
        }
      }
    } catch (submitError) {
      setError(submitError?.message || 'Unable to save checklist right now.')
    }
  }

  const handleAddItem = async () => {
    const validationError = validateChecklistItemForm(newItemForm)
    if (validationError) {
      setError(validationError)
      return
    }

    if (!isEditing) {
      const localItem = {
        id: `local-${Date.now()}`,
        title: newItemForm.title.trim(),
        description: newItemForm.description.trim(),
        orderIndex: items.length,
        required: newItemForm.required !== false,
        estimatedMinutes: newItemForm.estimatedMinutes ? Number(newItemForm.estimatedMinutes) : null,
      }
      setItems((current) => [...current, localItem])
      setNewItemForm(buildEmptyChecklistItemForm(items.length + 1))
      setError('')
      return
    }

    try {
      setError('')
      const created = await onCreateItem?.(template.id, {
        title: newItemForm.title.trim(),
        description: newItemForm.description.trim(),
        orderIndex: items.length,
        required: newItemForm.required !== false,
        estimatedMinutes: newItemForm.estimatedMinutes ? Number(newItemForm.estimatedMinutes) : null,
      })
      setItems((current) => sortChecklistItems([...current, created]))
      setNewItemForm(buildEmptyChecklistItemForm(items.length + 1))
    } catch (submitError) {
      setError(submitError?.message || 'Unable to add checklist item right now.')
    }
  }

  const handleItemChange = (itemId, patch) => {
    setItems((current) => current.map((item) => (
      `${item.id}` === `${itemId}` ? { ...item, ...patch } : item
    )))
  }

  const persistDraftItems = async (templateId, draftItems = []) => {
    for (const [index, item] of draftItems.entries()) {
      if (`${item.id}`.startsWith('local-')) {
        await onCreateItem?.(templateId, {
          title: item.title,
          description: item.description,
          orderIndex: index,
          required: item.required !== false,
          estimatedMinutes: item.estimatedMinutes,
        })
      } else {
        await onUpdateItem?.(item.id, {
          title: item.title,
          description: item.description,
          orderIndex: index,
          required: item.required !== false,
          estimatedMinutes: item.estimatedMinutes,
        })
      }
    }
  }

  const persistItemOrder = async (nextItems) => {
    setItems(nextItems)
    if (!isEditing) return
    try {
      await onSaveItemOrder?.(nextItems)
    } catch (submitError) {
      setError(submitError?.message || 'Unable to reorder checklist items right now.')
    }
  }

  const handleMoveItem = (itemId, direction) => {
    persistItemOrder(reorderChecklistItems(items, itemId, direction))
  }

  const handleDeleteItem = async (item) => {
    if (!isEditing || `${item.id}`.startsWith('local-')) {
      setItems((current) => current
        .filter((entry) => `${entry.id}` !== `${item.id}`)
        .map((entry, index) => ({ ...entry, orderIndex: index })))
      return
    }

    try {
      await onDeleteItem?.(item.id)
      setItems((current) => current
        .filter((entry) => `${entry.id}` !== `${item.id}`)
        .map((entry, index) => ({ ...entry, orderIndex: index })))
    } catch (submitError) {
      setError(submitError?.message || 'Unable to delete checklist item right now.')
    }
  }

  const handleDragStart = (event, itemId) => {
    setDraggedItemId(itemId)
    event.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (event) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (event, targetId) => {
    event.preventDefault()
    if (!draggedItemId) return
    persistItemOrder(moveChecklistItemByDrag(items, draggedItemId, targetId))
    setDraggedItemId(null)
  }

  const previewItems = useMemo(() => sortChecklistItems(items), [items])

  return (
    <section className="operations-checklist-editor-page panel staff-panel" aria-label="Checklist template editor">
      <header className="operations-checklist-editor-header">
        <div>
          <p className="eyebrow">Checklist template</p>
          <h3>{isEditing ? 'Edit checklist' : 'Create checklist'}</h3>
        </div>
        <button type="button" className="ghost-btn operations-checklist-editor-back" onClick={onClose}>
          ← Back
        </button>
      </header>

      <form className="operations-checklist-editor-form" onSubmit={handleSaveTemplate}>
        <label className="form-field full-width">
          <span>Name</span>
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="e.g. Bar Closing"
            required
            disabled={isSaving}
          />
        </label>

        <div className="form-grid">
          <label className="form-field">
            <span>Department</span>
            <select
              value={form.department}
              onChange={(event) => setForm((current) => ({ ...current, department: event.target.value }))}
              disabled={isSaving}
            >
              {CHECKLIST_DEPARTMENTS.map((department) => (
                <option key={department} value={department}>{getChecklistDepartmentLabel(department)}</option>
              ))}
            </select>
          </label>

          <label className="form-field operations-checklist-active-toggle">
            <span>Status</span>
            <button
              type="button"
              className={`operations-checklist-active-btn${form.active ? ' is-active' : ''}`}
              onClick={() => setForm((current) => ({ ...current, active: !current.active }))}
              disabled={isSaving}
            >
              {form.active ? 'Active' : 'Inactive'}
            </button>
          </label>
        </div>

        <div className="operations-checklist-items-section">
          <div className="operations-section-header">
            <div>
              <p className="eyebrow">Tasks</p>
              <h4>Checklist items</h4>
            </div>
            <p className="operations-section-count">{previewItems.length} item{previewItems.length === 1 ? '' : 's'}</p>
          </div>

          {previewItems.length === 0 ? (
            <div className="operations-empty-state">
              <h4>No tasks yet</h4>
              <p>Add the steps your team should complete every shift.</p>
            </div>
          ) : (
            <ul className="operations-checklist-item-list">
              {previewItems.map((item, index) => (
                <ChecklistItemEditorRow
                  key={item.id}
                  item={item}
                  index={index}
                  totalCount={previewItems.length}
                  isSaving={isSaving}
                  onChange={handleItemChange}
                  onMove={handleMoveItem}
                  onDelete={handleDeleteItem}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
              ))}
            </ul>
          )}

          <div className="operations-checklist-add-item">
            <input
              value={newItemForm.title}
              onChange={(event) => setNewItemForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Add checklist task"
              disabled={isSaving}
            />
            <button
              type="button"
              className="ghost-btn operations-checklist-add-item-btn"
              onClick={handleAddItem}
              disabled={isSaving}
            >
              Add task
            </button>
          </div>
        </div>

        {error ? <div className="staff-status-banner">{error}</div> : null}

        <div className="modal-actions">
          <button type="button" className="ghost-btn operations-form-action" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button type="submit" className="primary-btn operations-form-action" disabled={isSaving}>
            {isSaving ? 'Saving…' : isEditing ? 'Save checklist' : 'Create checklist'}
          </button>
        </div>
      </form>
    </section>
  )
}
