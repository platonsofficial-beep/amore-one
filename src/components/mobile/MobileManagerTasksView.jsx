import {
  getOperationsCategoryLabel,
  getOperationsPriorityLabel,
  resolveEmployeeName,
} from '../../lib/operationsUtils'
import { formatTime24 } from '../../lib/timeFormatUtils'
import { parseLocalDate } from '../../lib/weekUtils'

function formatManagerTaskDueLabel(task, todayKey = '') {
  const dueDateRaw = task?.dueDate ?? task?.due_date
  const dueDate = dueDateRaw
    ? (`${dueDateRaw}`.includes('T') ? `${dueDateRaw}`.split('T')[0] : `${dueDateRaw}`.slice(0, 10))
    : ''
  const dueTime = formatTime24(task?.dueTime ?? task?.due_time, '')

  let dateLabel = 'No due date'
  if (dueDate) {
    if (dueDate === todayKey) {
      dateLabel = 'Today'
    } else if (dueDate < todayKey) {
      dateLabel = 'Overdue'
    } else {
      const parsed = parseLocalDate(dueDate)
      dateLabel = Number.isNaN(parsed.getTime())
        ? dueDate
        : new Intl.DateTimeFormat('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        }).format(parsed)
    }
  }

  if (dueTime) return `${dateLabel} · ${dueTime}`
  return dateLabel
}

function ManagerTaskPreviewCard({ task, employees = [], todayKey = '' }) {
  const priority = `${task?.priority ?? 'normal'}`.trim().toLowerCase()
  const assignmentLabel = task?.assignedTo ?? task?.assigned_to
    ? resolveEmployeeName(task.assignedTo ?? task.assigned_to, employees)
    : 'Unassigned'

  return (
    <li className="mobile-manager-task-preview-item">
      <div className={`mobile-manager-task-preview-card${priority === 'urgent' ? ' is-urgent' : ''}`}>
        <div className="mobile-manager-task-preview-title-row">
          <strong>{task.title ?? 'Task'}</strong>
          <span className={`mobile-task-priority-badge priority-${priority}`}>
            {getOperationsPriorityLabel(task.priority)}
          </span>
        </div>
        <span className="mobile-manager-task-preview-due">{formatManagerTaskDueLabel(task, todayKey)}</span>
        <span className="mobile-manager-task-preview-meta">
          {getOperationsCategoryLabel(task.category)}
          {' · '}
          {assignmentLabel}
        </span>
      </div>
    </li>
  )
}

export function MobileManagerTasksView({
  taskOverview = {},
  overdueTasks = [],
  openTodayTasks = [],
  employees = [],
  todayKey = '',
  isLoading = false,
  onOpenOperationsDashboard,
  onOpenTaskWorkspace,
}) {
  const {
    active = 0,
    overdue = 0,
    completedToday = 0,
    completionPercent = 0,
  } = taskOverview

  const hasPreviewTasks = overdueTasks.length > 0 || openTodayTasks.length > 0

  return (
    <div className="mobile-screen mobile-manager-tasks">
      <header className="mobile-screen-header">
        <p className="mobile-screen-eyebrow">Team work</p>
        <h1 className="mobile-screen-title">Tasks</h1>
        <p className="mobile-screen-subtitle">Operations tasks across the team</p>
      </header>

      {isLoading ? (
        <p className="mobile-empty-note">Loading tasks…</p>
      ) : (
        <>
          <section className="mobile-card" aria-label="Team task summary">
            <p className="mobile-card-label">Summary</p>
            <div className="mobile-task-summary-grid">
              <div className="mobile-task-summary-item">
                <strong>{active}</strong>
                <span>Active</span>
              </div>
              <div className={`mobile-task-summary-item${overdue > 0 ? ' is-alert' : ''}`}>
                <strong>{overdue}</strong>
                <span>Overdue</span>
              </div>
              <div className="mobile-task-summary-item">
                <strong>{completedToday}</strong>
                <span>Done today</span>
              </div>
              <div className="mobile-task-summary-item">
                <strong>{completionPercent}%</strong>
                <span>Today</span>
              </div>
            </div>
          </section>

          {overdueTasks.length > 0 ? (
            <section className="mobile-card mobile-manager-task-section" aria-label="Overdue tasks">
              <p className="mobile-card-label">Overdue</p>
              <ul className="mobile-manager-task-preview-list">
                {overdueTasks.map((task) => (
                  <ManagerTaskPreviewCard
                    key={task.id}
                    task={task}
                    employees={employees}
                    todayKey={todayKey}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {openTodayTasks.length > 0 ? (
            <section className="mobile-card mobile-manager-task-section" aria-label="Open tasks">
              <p className="mobile-card-label">Due today</p>
              <ul className="mobile-manager-task-preview-list">
                {openTodayTasks.map((task) => (
                  <ManagerTaskPreviewCard
                    key={task.id}
                    task={task}
                    employees={employees}
                    todayKey={todayKey}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {!hasPreviewTasks ? (
            <section className="mobile-card">
              <p className="mobile-manager-attention-empty">No overdue or due-today team tasks.</p>
            </section>
          ) : null}

          <section className="mobile-card mobile-manager-actions-section" aria-label="Task actions">
            <p className="mobile-card-label">Quick actions</p>
            <div className="mobile-manager-actions">
              {onOpenOperationsDashboard ? (
                <button
                  type="button"
                  className="mobile-manager-action-btn mobile-manager-action-btn-primary"
                  onClick={onOpenOperationsDashboard}
                >
                  Open Operations dashboard
                </button>
              ) : null}
              {onOpenTaskWorkspace ? (
                <button type="button" className="mobile-manager-action-btn" onClick={onOpenTaskWorkspace}>
                  Open task workspace
                </button>
              ) : null}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
