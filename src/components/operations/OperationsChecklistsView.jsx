import { useMemo, useState } from 'react'
import {
  getChecklistDepartmentLabel,
  sortChecklistItems,
} from '../../lib/operationsChecklistUtils'
import { OperationsChecklistTemplateEditor } from './OperationsChecklistTemplateEditor'

function ChecklistTemplateCard({
  template,
  isSaving,
  onEdit,
  onDelete,
  onToggleActive,
}) {
  const items = sortChecklistItems(template.items ?? [])
  const previewItems = items.slice(0, 4)

  return (
    <article className={`operations-checklist-card panel staff-panel${template.active === false ? ' is-inactive' : ''}`}>
      <div className="operations-checklist-card-top">
        <div>
          <h4 className="operations-checklist-card-title">{template.name}</h4>
          <p className="operations-checklist-card-meta">
            {getChecklistDepartmentLabel(template.department)}
            <span aria-hidden="true">·</span>
            {items.length} task{items.length === 1 ? '' : 's'}
          </p>
        </div>
        <span className={`operations-checklist-status-badge${template.active === false ? ' is-inactive' : ''}`}>
          {template.active === false ? 'Inactive' : 'Active'}
        </span>
      </div>

      {previewItems.length > 0 ? (
        <ul className="operations-checklist-card-preview">
          {previewItems.map((item) => (
            <li key={item.id}>☐ {item.title}</li>
          ))}
          {items.length > previewItems.length ? (
            <li className="operations-checklist-card-more">+ {items.length - previewItems.length} more</li>
          ) : null}
        </ul>
      ) : (
        <p className="operations-checklist-card-empty">No tasks added yet.</p>
      )}

      <div className="operations-checklist-card-actions">
        <button type="button" className="ghost-btn operations-checklist-card-action" onClick={() => onEdit(template)} disabled={isSaving}>
          Edit
        </button>
        <button
          type="button"
          className="ghost-btn operations-checklist-card-action"
          onClick={() => onToggleActive(template)}
          disabled={isSaving}
        >
          {template.active === false ? 'Activate' : 'Deactivate'}
        </button>
        <button
          type="button"
          className="ghost-btn operations-checklist-card-action operations-checklist-card-delete"
          onClick={() => onDelete(template)}
          disabled={isSaving}
        >
          Delete
        </button>
      </div>
    </article>
  )
}

export function OperationsChecklistsView({
  templates = [],
  isLoading = false,
  noticeMessage = '',
  isSaving = false,
  isWorkspaceReady = false,
  workspaceSetupMessage = '',
  searchTerm = '',
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onSaveItemOrder,
}) {
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [isCreating, setIsCreating] = useState(false)

  const visibleTemplates = useMemo(() => {
    const needle = `${searchTerm ?? ''}`.trim().toLowerCase()
    return (templates ?? []).filter((template) => {
      if (!needle) return true
      const haystack = [
        template.name,
        template.department,
        ...(template.items ?? []).map((item) => item.title),
      ].join(' ').toLowerCase()
      return haystack.includes(needle)
    })
  }, [templates, searchTerm])

  const handleSaveTemplate = async (form) => {
    if (editingTemplate?.id) {
      const updated = await onUpdateTemplate?.(editingTemplate.id, form)
      setEditingTemplate(null)
      return updated
    }

    const created = await onCreateTemplate?.(form)
    return created
  }

  if (isCreating || editingTemplate) {
    return (
      <OperationsChecklistTemplateEditor
        key={editingTemplate?.id ?? 'new'}
        template={editingTemplate}
        isSaving={isSaving}
        onClose={() => {
          if (isSaving) return
          setEditingTemplate(null)
          setIsCreating(false)
        }}
        onSaveTemplate={async (form, localItems) => {
          await handleSaveTemplate(form, localItems)
          setEditingTemplate(null)
          setIsCreating(false)
        }}
        onCreateItem={onCreateItem}
        onUpdateItem={onUpdateItem}
        onDeleteItem={onDeleteItem}
        onSaveItemOrder={onSaveItemOrder}
      />
    )
  }

  return (
    <section className="operations-checklists-page" aria-label="Checklist templates">
      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {!isWorkspaceReady && workspaceSetupMessage ? (
        <div className="staff-status-banner">{workspaceSetupMessage}</div>
      ) : null}
      {isLoading ? <div className="staff-status-banner">Loading checklists…</div> : null}

      <div className="operations-dashboard-toolbar">
        <div>
          <p className="operations-dashboard-eyebrow">Procedures</p>
          <h3 className="operations-dashboard-heading">Checklist templates</h3>
          <p className="operations-dashboard-copy">
            Build once. ONE generates daily operational tasks for your team.
          </p>
        </div>
        <button
          type="button"
          className="primary-btn operations-dashboard-action"
          onClick={() => setIsCreating(true)}
          disabled={!isWorkspaceReady || isSaving}
        >
          Create checklist
        </button>
      </div>

      {visibleTemplates.length === 0 && !isLoading ? (
        <div className="operations-empty-state">
          <h4>No checklist templates yet</h4>
          <p>Create opening, closing, and prep procedures for daily execution.</p>
        </div>
      ) : (
        <div className="operations-checklist-grid">
          {visibleTemplates.map((template) => (
            <ChecklistTemplateCard
              key={template.id}
              template={template}
              isSaving={isSaving}
              onEdit={setEditingTemplate}
              onDelete={onDeleteTemplate}
              onToggleActive={(entry) => onUpdateTemplate?.(entry.id, { active: entry.active === false })}
            />
          ))}
        </div>
      )}
    </section>
  )
}
