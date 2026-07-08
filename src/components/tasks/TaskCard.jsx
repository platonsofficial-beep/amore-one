import { useState } from 'react'
import { getTaskDepartmentBoardKey, resolveDepartmentBoardDisplay } from '../../lib/taskDepartments'
import { getTaskDepartmentLabel, getTodayKey, isTaskOverdue } from '../../lib/taskUtils'
import { formatTime24, formatTimestampDayAndTime24 } from '../../lib/timeFormatUtils'
import { formatLocalDateKey, parseLocalDate } from '../../lib/weekUtils'

const PRIORITY_LABELS = {
  normal: 'Normal',
  important: 'Important',
  urgent: 'Urgent',
}

function normalizeTaskDateKey(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function getTomorrowKey(todayKey = getTodayKey()) {
  const date = parseLocalDate(todayKey)
  date.setDate(date.getDate() + 1)
  return formatLocalDateKey(date)
}

function formatTaskDueDateLabel(dueDate, todayKey = getTodayKey()) {
  const normalized = normalizeTaskDateKey(dueDate)
  if (!normalized) return 'No due date'

  if (normalized === todayKey) return 'Today'
  if (normalized === getTomorrowKey(todayKey)) return 'Tomorrow'

  const date = parseLocalDate(normalized)
  if (Number.isNaN(date.getTime())) return normalized

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatTaskDueLabel(task, todayKey = getTodayKey()) {
  const dueLabel = formatTaskDueDateLabel(task?.dueDate, todayKey)
  const dueTime = formatTime24(task?.dueTime, '')
  return dueTime ? `${dueLabel} · ${dueTime}` : dueLabel
}

function formatCompletedTimestamp(value) {
  if (!value) return ''

  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) {
    return formatTimestampDayAndTime24(parsed)
  }

  const dateKey = normalizeTaskDateKey(value)
  if (!dateKey) return ''

  const date = parseLocalDate(dateKey)
  if (Number.isNaN(date.getTime())) return dateKey

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function getRecurrenceLabel(recurrence) {
  const value = `${recurrence ?? 'none'}`.trim().toLowerCase()
  if (value === 'daily') return 'Daily'
  if (value === 'weekly') return 'Weekly'
  if (value === 'monthly') return 'Monthly'
  return null
}

function TaskChecklist({
  items = [],
  isTaskCompleted = false,
  onToggleItem,
  isSaving = false,
  canToggleItems = true,
}) {
  const [showAll, setShowAll] = useState(false)
  const completedCount = items.filter((item) => item.isCompleted).length
  const totalCount = items.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  const visibleItems = showAll ? items : items.slice(0, 5)
  const hiddenCount = Math.max(totalCount - 5, 0)
  const allComplete = totalCount > 0 && completedCount === totalCount

  return (
    <div className="task-card-checklist">
      <div className="task-card-checklist-summary">
        <span className="task-card-checklist-count">{completedCount}/{totalCount} completed</span>
        <div className="task-checklist-progress" aria-hidden="true">
          <span className="task-checklist-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      {allComplete && !isTaskCompleted ? (
        <p className="task-checklist-all-complete">All checklist items complete</p>
      ) : null}

      <ul className="task-checklist-items">
        {visibleItems.map((item) => (
          <li key={item.id} className={`task-checklist-item${item.isCompleted ? ' is-completed' : ''}`}>
            <button
              type="button"
              className="task-checklist-item-btn"
              onClick={() => onToggleItem?.(item.id, !item.isCompleted)}
              disabled={isSaving || !canToggleItems}
              aria-pressed={item.isCompleted}
            >
              <span className="task-checklist-item-icon" aria-hidden="true">
                {item.isCompleted ? '☑' : '☐'}
              </span>
              <span className="task-checklist-item-title">{item.title}</span>
            </button>
          </li>
        ))}
      </ul>

      {hiddenCount > 0 && !showAll ? (
        <button
          type="button"
          className="ghost-btn task-checklist-show-all-btn"
          onClick={() => setShowAll(true)}
        >
          Show all ({totalCount})
        </button>
      ) : null}
    </div>
  )
}

export default function TaskCard({
  task,
  assigneeName = '',
  checklistItems = [],
  onComplete,
  onReopen,
  onEdit,
  onDelete,
  onToggleChecklistItem,
  customDepartmentIcons = {},
  isSaving = false,
  canManage = false,
  canComplete = false,
}) {
  const isCompleted = task?.status === 'completed'
  const canInteract = canManage || canComplete
  const overdue = !isCompleted && isTaskOverdue(task)
  const priority = `${task?.priority ?? 'normal'}`.trim().toLowerCase()
  const departmentBoard = resolveDepartmentBoardDisplay(
    getTaskDepartmentBoardKey(task),
    customDepartmentIcons,
  )
  const departmentLabel = getTaskDepartmentLabel(task)
  const hasAssignee = Boolean(`${assigneeName ?? ''}`.trim())
  const dueLabel = formatTaskDueLabel(task)
  const recurrenceLabel = getRecurrenceLabel(task?.recurrence)
  const completedLabel = formatCompletedTimestamp(task?.completedAt)

  return (
    <article
      className={`task-card${isCompleted ? ' is-completed' : ''}${overdue ? ' is-overdue' : ''}`}
    >
      <div className="task-card-top">
        {isCompleted ? (
          <span className="task-card-status-badge is-completed">✓ Completed</span>
        ) : (
          <span className={`task-priority-badge priority-${priority}`}>
            {PRIORITY_LABELS[priority] ?? 'Normal'}
          </span>
        )}
      </div>

      <div className="task-card-body">
        <h4 className="task-card-title">{task?.title || 'Untitled task'}</h4>

        {isCompleted && completedLabel ? (
          <p className="task-card-completed-at">Completed {completedLabel}</p>
        ) : null}

        <div className="task-card-metadata">
          <span className="task-card-metadata-item task-card-department">
            <span className="task-card-metadata-icon" aria-hidden="true">{departmentBoard.icon ?? '📋'}</span>
            <span>{departmentLabel}</span>
          </span>

          {hasAssignee ? (
            <span className="task-card-metadata-item">{assigneeName}</span>
          ) : null}

          {!isCompleted ? (
            <span className={`task-card-metadata-item${overdue ? ' is-overdue' : ''}`}>
              {dueLabel}
            </span>
          ) : null}

          {recurrenceLabel ? (
            <span className="task-card-metadata-item task-card-recurrence" title={`Repeats ${recurrenceLabel.toLowerCase()}`}>
              <span className="task-card-metadata-icon" aria-hidden="true">🔁</span>
              <span className="sr-only">Repeats {recurrenceLabel.toLowerCase()}</span>
            </span>
          ) : null}
        </div>

        {checklistItems.length > 0 ? (
          <TaskChecklist
            items={checklistItems}
            isTaskCompleted={isCompleted}
            onToggleItem={onToggleChecklistItem}
            isSaving={isSaving}
            canToggleItems={canInteract}
          />
        ) : null}
      </div>

      <div className="task-card-actions">
        {canManage ? (
          <div className="task-card-actions-left">
            <button
              type="button"
              className="ghost-btn task-card-action-btn"
              onClick={() => onEdit?.(task)}
              disabled={isSaving}
            >
              Edit
            </button>
            <button
              type="button"
              className="ghost-btn task-card-action-btn task-card-delete-btn"
              onClick={() => onDelete?.(task)}
              disabled={isSaving}
            >
              Delete
            </button>
          </div>
        ) : null}

        <div className={`task-card-actions-right${canManage ? '' : ' is-staff-only'}`}>
          {isCompleted ? (
            canManage ? (
              <button
                type="button"
                className="ghost-btn task-card-action-btn"
                onClick={() => onReopen?.(task)}
                disabled={isSaving}
              >
                Reopen
              </button>
            ) : null
          ) : canInteract ? (
            <button
              type="button"
              className="primary-btn task-card-action-btn"
              onClick={() => onComplete?.(task)}
              disabled={isSaving}
            >
              ✓ Complete
            </button>
          ) : null}
        </div>
      </div>
    </article>
  )
}
