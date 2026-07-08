import { resolveEmployeeName } from '../../lib/operationsUtils'
import { formatTime24 } from '../../lib/timeFormatUtils'
import { getTaskDepartmentLabel } from '../../lib/taskUtils'

function formatAlertDueLabel(task) {
  const dueTime = formatTime24(task?.dueTime ?? task?.due_time, '')
  return dueTime ? `Due ${dueTime}` : 'No due time'
}

function AlertGroup({ title, tasks, tone = 'default', employees = [], compact = false }) {
  if (tasks.length === 0) return null

  return (
    <section className={`tasks-alert-group tone-${tone}`}>
      <header className="tasks-alert-group-header">
        <h4>{title}</h4>
        <span className="tasks-alert-group-count">{tasks.length}</span>
      </header>
      <ul className="tasks-alert-list">
        {tasks.map((task) => {
          const ownerName = task?.assignedEmployeeId ?? task?.assignedTo ?? task?.assigned_to
            ? resolveEmployeeName(
              task.assignedEmployeeId ?? task.assignedTo ?? task.assigned_to,
              employees,
            )
            : ''

          return (
            <li key={task.id} className="tasks-alert-item">
              <div className="tasks-alert-item-main">
                <p className="tasks-alert-item-title">{task.title}</p>
                {compact && ownerName ? (
                  <p className="tasks-alert-item-owner">{ownerName}</p>
                ) : null}
                {compact ? (
                  <p className="tasks-alert-item-due">{formatAlertDueLabel(task)}</p>
                ) : (
                  <p className="tasks-alert-item-meta">{getTaskDepartmentLabel(task)}</p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export default function TaskAlertsSection({
  alerts,
  employees = [],
  compact = false,
  title = 'Task alerts',
  emptyMessage = 'No task alerts. Operations are clear.',
}) {
  if (!alerts?.hasAlerts) {
    return (
      <section className={`tasks-alerts${compact ? ' is-compact' : ''}`} aria-label={title}>
        <header className="tasks-alerts-header">
          {!compact ? <p className="eyebrow">Manager view</p> : null}
          <h3>{title}</h3>
        </header>
        <div className="tasks-alerts-empty">
          {emptyMessage}
        </div>
      </section>
    )
  }

  return (
    <section className={`tasks-alerts${compact ? ' is-compact' : ''}`} aria-label={title}>
      <header className="tasks-alerts-header">
        {!compact ? <p className="eyebrow">Manager view</p> : null}
        <h3>{title}</h3>
      </header>

      <div className="tasks-alerts-groups">
        <AlertGroup title="Overdue" tasks={alerts.overdue} tone="overdue" employees={employees} compact={compact} />
        <AlertGroup title="Urgent active" tasks={alerts.urgent} tone="urgent" employees={employees} compact={compact} />
        <AlertGroup title="Due today" tasks={alerts.dueToday} tone="today" employees={employees} compact={compact} />
      </div>
    </section>
  )
}
