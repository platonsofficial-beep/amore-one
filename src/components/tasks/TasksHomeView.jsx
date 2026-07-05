import { TASK_DEPARTMENTS } from '../../lib/taskDepartments'
import { calculateDepartmentStats } from '../../lib/taskUtils'
import DepartmentPerformanceSummary from './DepartmentPerformanceSummary'
import TaskAlertsSection from './TaskAlertsSection'

export default function TasksHomeView({
  tasks = [],
  taskAlerts,
  departmentPerformance = [],
  onSelectDepartment,
  isLoading = false,
  todayKey,
}) {
  return (
    <section className="tasks-home">
      <TaskAlertsSection alerts={taskAlerts} />

      <DepartmentPerformanceSummary summaries={departmentPerformance} />

      <header className="tasks-home-header">
        <div>
          <p className="eyebrow">Departments</p>
          <h3>Task boards</h3>
          <p className="staff-subtitle">
            Choose a department to review today&apos;s work, upcoming tasks, and completion progress.
          </p>
        </div>
      </header>

      {isLoading ? (
        <div className="staff-status-banner">Loading tasks…</div>
      ) : null}

      <div className="tasks-department-grid">
        {TASK_DEPARTMENTS.map((department) => {
          const departmentTasks = (tasks ?? []).filter((task) => (
            `${task?.department ?? ''}`.trim().toLowerCase() === department.key
          ))
          const hasTasks = departmentTasks.length > 0
          const stats = calculateDepartmentStats(tasks, department.key, todayKey)

          return (
            <button
              key={department.key}
              type="button"
              className={`tasks-department-card${hasTasks ? '' : ' is-empty'}`}
              onClick={() => onSelectDepartment?.(department.key)}
            >
              <div className="tasks-department-sticker-top">
                <span className="tasks-department-icon" aria-hidden="true">{department.icon}</span>
                <h4 className="tasks-department-name">{department.label}</h4>
              </div>

              {hasTasks ? (
                <>
                  <div className="tasks-department-metrics">
                    <p className="tasks-department-metric">
                      <strong>{stats.active}</strong> Active
                    </p>
                    <p className={`tasks-department-metric${stats.overdue > 0 ? ' is-alert' : ''}`}>
                      <strong>{stats.overdue}</strong> Overdue
                    </p>
                    <p className="tasks-department-metric">
                      <strong>{stats.completedToday}</strong> Completed today
                    </p>
                  </div>

                  <div className="tasks-department-completion">
                    <span className="tasks-department-completion-value">{stats.completionPercent}%</span>
                    <div className="tasks-department-progress" aria-hidden="true">
                      <span
                        className="tasks-department-progress-fill"
                        style={{ width: `${Math.max(0, Math.min(stats.completionPercent, 100))}%` }}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="tasks-department-empty">
                  <p className="tasks-department-empty-line">No active tasks</p>
                  <p className="tasks-department-empty-subline">Ready for today</p>
                </div>
              )}
            </button>
          )
        })}
      </div>
    </section>
  )
}
