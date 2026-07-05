import { getTaskDepartmentByKey } from '../../lib/taskDepartments'
import { getTaskDepartmentLabel, getTodayKey, isTaskOverdue } from '../../lib/taskUtils'
import { formatTime24 } from '../../lib/timeFormatUtils'
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
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(parsed)
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

export default function TaskCard({
  task,
  assigneeName = '',
  onComplete,
  onReopen,
  onEdit,
  onDelete,
  isSaving = false,
}) {
  const isCompleted = task?.status === 'completed'
  const overdue = !isCompleted && isTaskOverdue(task)
  const priority = `${task?.priority ?? 'normal'}`.trim().toLowerCase()
  const departmentKey = `${task?.department ?? ''}`.trim().toLowerCase()
  const department = getTaskDepartmentByKey(departmentKey)
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
            <span className="task-card-metadata-icon" aria-hidden="true">{department?.icon ?? '📋'}</span>
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
      </div>

      <div className="task-card-actions">
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

        <div className="task-card-actions-right">
          {isCompleted ? (
            <button
              type="button"
              className="ghost-btn task-card-action-btn"
              onClick={() => onReopen?.(task)}
              disabled={isSaving}
            >
              Reopen
            </button>
          ) : (
            <button
              type="button"
              className="primary-btn task-card-action-btn"
              onClick={() => onComplete?.(task)}
              disabled={isSaving}
            >
              ✓ Complete
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
