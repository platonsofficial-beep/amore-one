import { isDeletableCustomDepartmentName } from '../../lib/taskDepartments'
import { calculateDepartmentStats, taskMatchesDepartmentBoard } from '../../lib/taskUtils'
import DepartmentPerformanceSummary from './DepartmentPerformanceSummary'
import TaskAlertsSection from './TaskAlertsSection'

function DepartmentBoardCard({
  board,
  tasks,
  todayKey,
  onSelectDepartment,
  onDeleteDepartment,
  isDeletingDepartment = false,
}) {
  const departmentTasks = (tasks ?? []).filter((task) => taskMatchesDepartmentBoard(task, board.boardKey))
  const hasTasks = departmentTasks.length > 0
  const stats = calculateDepartmentStats(tasks, board.boardKey, todayKey)
  const canDelete = board.isCustomBoard && isDeletableCustomDepartmentName(board.label)

  return (
    <article className={`tasks-department-card${hasTasks ? '' : ' is-empty'}${board.isCustomBoard ? ' is-custom' : ''}`}>
      {canDelete ? (
        <button
          type="button"
          className="ghost-btn tasks-department-delete-btn"
          onClick={() => onDeleteDepartment?.(board)}
          disabled={isDeletingDepartment}
          aria-label={`Delete ${board.label} department`}
        >
          Delete
        </button>
      ) : null}

      <button
        type="button"
        className="tasks-department-card-open"
        onClick={() => onSelectDepartment?.(board.boardKey)}
        disabled={isDeletingDepartment}
      >
        <div className="tasks-department-sticker-top">
          <span className="tasks-department-icon" aria-hidden="true">{board.icon}</span>
          <h4 className="tasks-department-name">{board.label}</h4>
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
    </article>
  )
}

export default function TasksHomeView({
  tasks = [],
  departmentBoards = [],
  taskAlerts,
  departmentPerformance = [],
  onSelectDepartment,
  onCreateDepartment,
  onDeleteDepartment,
  isDeletingDepartment = false,
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
        {departmentBoards.map((board) => (
          <DepartmentBoardCard
            key={board.boardKey}
            board={board}
            tasks={tasks}
            todayKey={todayKey}
            onSelectDepartment={onSelectDepartment}
            onDeleteDepartment={onDeleteDepartment}
            isDeletingDepartment={isDeletingDepartment}
          />
        ))}

        <button
          type="button"
          className="tasks-department-card is-create-action"
          onClick={onCreateDepartment}
          disabled={isDeletingDepartment}
        >
          <div className="tasks-department-sticker-top">
            <span className="tasks-department-icon" aria-hidden="true">+</span>
            <h4 className="tasks-department-name">Create Department</h4>
          </div>
          <div className="tasks-department-empty">
            <p className="tasks-department-empty-line">Add Kitchen, Cleaning, Delivery, or any custom team.</p>
          </div>
        </button>
      </div>
    </section>
  )
}
