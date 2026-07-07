import { getChecklistDepartmentLabel } from '../../lib/operationsChecklistUtils'

export function OperationsStartChecklistModal({
  isOpen,
  templates = [],
  isSaving = false,
  onClose,
  onStart,
}) {
  if (!isOpen) return null

  const activeTemplates = templates.filter((template) => template.active !== false && (template.items?.length ?? 0) > 0)

  return (
    <div className="employee-modal-backdrop task-modal-backdrop operations-form-backdrop" onClick={onClose}>
      <div
        className="employee-modal task-form-modal is-responsive-sheet operations-form-modal operations-start-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="operations-start-checklist-title"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Daily checklists</p>
            <h3 id="operations-start-checklist-title">Start checklist</h3>
            <p className="operations-section-subtitle">Generate today&apos;s operational tasks from a template.</p>
          </div>
          <button type="button" className="icon-btn operations-form-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {activeTemplates.length === 0 ? (
          <div className="operations-empty-state">
            <h4>No active checklists</h4>
            <p>Create a checklist template with items first.</p>
          </div>
        ) : (
          <ul className="operations-start-checklist-list">
            {activeTemplates.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  className="operations-start-checklist-option"
                  disabled={isSaving}
                  onClick={() => onStart?.(template)}
                >
                  <span className="operations-start-checklist-name">{template.name}</span>
                  <span className="operations-start-checklist-meta">
                    {getChecklistDepartmentLabel(template.department)}
                    <span aria-hidden="true">·</span>
                    {template.items.length} task{template.items.length === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
