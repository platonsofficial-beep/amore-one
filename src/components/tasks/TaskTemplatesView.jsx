import { getTaskDepartmentByKey, TASK_DEPARTMENTS } from '../../lib/taskDepartments'
import { getTaskDepartmentLabel, groupTaskTemplatesByDepartment } from '../../lib/taskUtils'
import { formatTime24 } from '../../lib/timeFormatUtils'

const PRIORITY_LABELS = {
  normal: 'Normal',
  important: 'Important',
  urgent: 'Urgent',
}

const RECURRENCE_LABELS = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
}

function truncateNotes(notes, maxLength = 120) {
  const value = `${notes ?? ''}`.trim()
  if (!value) return ''
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1)}…`
}

function TemplateCard({
  template,
  checklistItems = [],
  onEdit,
  onDelete,
  isSaving,
}) {
  const department = getTaskDepartmentByKey(template.department)
  const departmentLabel = getTaskDepartmentLabel(template)
  const notesPreview = truncateNotes(template.notes)
  const defaultTimeLabel = formatTime24(template.defaultTime, '')
  const isInactive = template.isActive === false
  const previewItems = checklistItems.slice(0, 3)
  const remainingChecklistCount = Math.max(checklistItems.length - previewItems.length, 0)

  return (
    <article className={`task-template-card${isInactive ? ' is-inactive' : ''}`}>
      <div className="task-template-card-top">
        <h4 className="task-template-card-title">{template.title}</h4>
        {isInactive ? <span className="task-template-inactive-badge">Inactive</span> : null}
      </div>

      <div className="task-template-card-meta">
        <span className="task-template-meta-item">
          {department?.icon ? `${department.icon} ` : ''}{departmentLabel}
        </span>
        {defaultTimeLabel ? (
          <span className="task-template-meta-item">{defaultTimeLabel}</span>
        ) : null}
        <span className="task-template-meta-item">{PRIORITY_LABELS[template.priority] ?? 'Normal'}</span>
        <span className="task-template-meta-item">
          {RECURRENCE_LABELS[template.recurrence] ?? 'Daily'}
        </span>
      </div>

      {notesPreview ? (
        <p className="task-template-notes-preview">{notesPreview}</p>
      ) : null}

      {previewItems.length > 0 ? (
        <ul className="task-template-checklist-preview">
          {previewItems.map((item) => (
            <li key={item.id ?? item.title}>{item.title}</li>
          ))}
          {remainingChecklistCount > 0 ? (
            <li className="task-template-checklist-more">+ {remainingChecklistCount} more</li>
          ) : null}
        </ul>
      ) : null}

      <div className="task-template-card-actions">
        <button
          type="button"
          className="ghost-btn task-card-action-btn"
          onClick={() => onEdit?.(template)}
          disabled={isSaving}
        >
          Edit
        </button>
        <button
          type="button"
          className="ghost-btn task-card-action-btn task-template-delete-btn"
          onClick={() => onDelete?.(template)}
          disabled={isSaving}
        >
          Delete
        </button>
      </div>
    </article>
  )
}

export default function TaskTemplatesView({
  templates = [],
  templateChecklistItemsByTemplateId = {},
  isLoading = false,
  isSaving = false,
  isGenerating = false,
  errorMessage = '',
  noticeMessage = '',
  onBack,
  onOpenNewTemplate,
  onEditTemplate,
  onDeleteTemplate,
  onGenerateToday,
}) {
  const groupedTemplates = groupTaskTemplatesByDepartment(templates)
  const hasTemplates = templates.length > 0
  const tableUnavailable = `${errorMessage}`.toLowerCase().includes('not ready yet')
  const activeTemplateCount = templates.filter((template) => template.isActive !== false).length

  const departmentSections = TASK_DEPARTMENTS
    .map((department) => ({
      department,
      templates: groupedTemplates.get(department.key) ?? [],
    }))
    .filter((section) => section.templates.length > 0)

  return (
    <section className="tasks-templates">
      <header className="tasks-templates-header">
        <div className="tasks-templates-header-main">
          <button type="button" className="ghost-btn tasks-back-btn" onClick={onBack}>
            ← Department Boards
          </button>
          <div>
            <p className="eyebrow">Daily operations</p>
            <h3>Daily Operation Templates</h3>
            <p className="staff-subtitle">
              Reusable checklists for opening, closing, and department routines.
            </p>
          </div>
        </div>

        <div className="tasks-templates-header-actions">
          <button
            type="button"
            className="ghost-btn tasks-generate-btn"
            onClick={onGenerateToday}
            disabled={isGenerating || isSaving || tableUnavailable || activeTemplateCount === 0}
          >
            {isGenerating ? 'Generating…' : 'Generate Today'}
          </button>
          <button
            type="button"
            className="primary-btn tasks-new-btn"
            onClick={onOpenNewTemplate}
            disabled={isSaving || tableUnavailable}
          >
            + New Template
          </button>
        </div>
      </header>

      {errorMessage ? (
        <div className={`staff-status-banner${tableUnavailable ? ' tasks-status-unavailable' : ''}`}>
          {errorMessage}
        </div>
      ) : null}

      {noticeMessage ? <div className="staff-status-banner tasks-status-notice">{noticeMessage}</div> : null}

      {isLoading ? (
        <div className="tasks-templates-loading">Loading templates…</div>
      ) : !hasTemplates ? (
        <div className="tasks-templates-empty">
          <p className="tasks-templates-empty-line">No templates yet.</p>
          <p className="tasks-templates-empty-subline">Create your first daily operation template.</p>
        </div>
      ) : (
        <div className="tasks-templates-groups">
          {departmentSections.map(({ department, templates: departmentTemplates }) => (
            <section key={department.key} className="tasks-templates-group">
              <header className="tasks-templates-group-header">
                <span className="tasks-templates-group-icon" aria-hidden="true">{department.icon}</span>
                <h4>{department.label}</h4>
                <span className="tasks-templates-group-count">{departmentTemplates.length}</span>
              </header>
              <div className="tasks-templates-list">
                {departmentTemplates.map((template) => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    checklistItems={templateChecklistItemsByTemplateId[String(template.id)] ?? []}
                    onEdit={onEditTemplate}
                    onDelete={onDeleteTemplate}
                    isSaving={isSaving}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
