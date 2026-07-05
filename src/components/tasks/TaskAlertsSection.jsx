import { getTaskDepartmentLabel } from '../../lib/taskUtils'

function AlertGroup({ title, tasks, tone = 'default' }) {
  if (tasks.length === 0) return null

  return (
    <section className={`tasks-alert-group tone-${tone}`}>
      <header className="tasks-alert-group-header">
        <h4>{title}</h4>
        <span className="tasks-alert-group-count">{tasks.length}</span>
      </header>
      <ul className="tasks-alert-list">
        {tasks.map((task) => (
          <li key={task.id} className="tasks-alert-item">
            <div className="tasks-alert-item-main">
              <p className="tasks-alert-item-title">{task.title}</p>
              <p className="tasks-alert-item-meta">{getTaskDepartmentLabel(task)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function TaskAlertsSection({ alerts }) {
  if (!alerts?.hasAlerts) {
    return (
      <section className="tasks-alerts" aria-label="Task alerts">
        <header className="tasks-alerts-header">
          <p className="eyebrow">Manager view</p>
          <h3>Task alerts</h3>
        </header>
        <div className="tasks-alerts-empty">
          No task alerts. Operations are clear.
        </div>
      </section>
    )
  }

  return (
    <section className="tasks-alerts" aria-label="Task alerts">
      <header className="tasks-alerts-header">
        <p className="eyebrow">Manager view</p>
        <h3>Task alerts</h3>
      </header>

      <div className="tasks-alerts-groups">
        <AlertGroup title="Overdue" tasks={alerts.overdue} tone="overdue" />
        <AlertGroup title="Urgent active" tasks={alerts.urgent} tone="urgent" />
        <AlertGroup title="Due today" tasks={alerts.dueToday} tone="today" />
      </div>
    </section>
  )
}
