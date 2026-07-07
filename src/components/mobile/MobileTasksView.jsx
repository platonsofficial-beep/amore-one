import { useState } from 'react'

const TASK_TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
]

function formatTaskDueLabel(task) {
  const dueDate = `${task?.dueDate ?? task?.due_date ?? ''}`.trim()
  const dueTime = `${task?.dueTime ?? task?.due_time ?? ''}`.trim()
  if (dueDate && dueTime) return `${dueDate} · ${dueTime}`
  if (dueDate) return dueDate
  return 'No due date'
}

export function MobileTasksView({
  taskGroups = { upcoming: [], pending: [], completed: [] },
  isLoading = false,
  onOpenTasksWorkspace,
}) {
  const [activeTab, setActiveTab] = useState('pending')
  const visibleTasks = taskGroups[activeTab] ?? []

  return (
    <div className="mobile-screen mobile-tasks">
      <header className="mobile-screen-header">
        <p className="mobile-screen-eyebrow">My work</p>
        <h1 className="mobile-screen-title">Tasks</h1>
      </header>

      <div className="mobile-segmented-control" role="tablist" aria-label="Task filters">
        {TASK_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`mobile-segmented-btn${activeTab === tab.id ? ' is-active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            <span className="mobile-segmented-count">{(taskGroups[tab.id] ?? []).length}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="mobile-empty-note">Loading tasks…</p>
      ) : visibleTasks.length === 0 ? (
        <section className="mobile-empty-state">
          <p className="mobile-empty-icon" aria-hidden="true">✓</p>
          <h2>No {activeTab} tasks</h2>
          <p>You are clear in this list for now.</p>
          {onOpenTasksWorkspace ? (
            <button type="button" className="mobile-primary-btn" onClick={onOpenTasksWorkspace}>
              Open tasks workspace
            </button>
          ) : null}
        </section>
      ) : (
        <ul className="mobile-task-list">
          {visibleTasks.map((task) => (
            <li key={task.id} className={`mobile-task-card${task?.priority === 'urgent' ? ' is-urgent' : ''}`}>
              <div className="mobile-task-card-copy">
                <strong>{task.title ?? task.name ?? 'Task'}</strong>
                <span>{formatTaskDueLabel(task)}</span>
                {task.department ? <span className="mobile-task-department">{task.department}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && visibleTasks.length > 0 && onOpenTasksWorkspace ? (
        <button type="button" className="mobile-secondary-btn" onClick={onOpenTasksWorkspace}>
          Open full tasks board
        </button>
      ) : null}
    </div>
  )
}
