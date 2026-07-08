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
  compact = false,
  canManage = false,
}) {
  const departmentTasks = (tasks ?? []).filter((task) => taskMatchesDepartmentBoard(task, board.boardKey))
  const hasTasks = departmentTasks.length > 0
  const stats = calculateDepartmentStats(tasks, board.boardKey, todayKey)
  const canDelete = canManage && board.isCustomBoard && isDeletableCustomDepartmentName(board.label)

  return (
    <article className={`tasks-department-card${hasTasks ? '' : ' is-empty'}${board.isCustomBoard ? ' is-custom' : ''}${compact ? ' is-compact' : ''}`}>
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
            {!compact ? (
              <p className="tasks-department-empty-subline">Ready for today</p>
            ) : null}
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
  employees = [],
  onSelectDepartment,
  onCreateDepartment,
  onDeleteDepartment,
  isDeletingDepartment = false,
  isLoading = false,
  todayKey,
  isMobileLayout = false,
  onOpenTemplates,
  templateCount = 0,
  canManage = false,
}) {
  return (
    <section className={`tasks-home${isMobileLayout ? ' is-mobile-layout' : ''}`}>
      <TaskAlertsSection
        alerts={taskAlerts}
        employees={employees}
        compact={isMobileLayout}
        title="Needs attention"
        emptyMessage="No tasks need attention right now."
      />

      <DepartmentPerformanceSummary
        summaries={departmentPerformance}
        compact={isMobileLayout}
      />

      {isMobileLayout && canManage ? (
        <section className="tasks-mobile-templates-section" aria-label="Daily templates">
          <header className="tasks-mobile-templates-header">
            <h3>Daily templates</h3>
          </header>
          <button
            type="button"
            className="tasks-mobile-templates-btn"
            onClick={onOpenTemplates}
          >
            <span className="tasks-mobile-templates-btn-label">Open daily templates</span>
            <span className="tasks-mobile-templates-btn-meta">
              {templateCount > 0 ? `${templateCount} saved` : 'Set up routines'}
            </span>
          </button>
        </section>
      ) : null}

      <header className="tasks-home-header">
        <div>
          {!isMobileLayout ? <p className="eyebrow">Departments</p> : null}
          <h3>{isMobileLayout ? 'Departments' : 'Task boards'}</h3>
          {!isMobileLayout ? (
            <p className="staff-subtitle">
              Choose a department to review today&apos;s work, upcoming tasks, and completion progress.
            </p>
          ) : null}
        </div>
      </header>

      {isLoading ? (
        <div className="staff-status-banner">Loading tasks…</div>
      ) : null}

      <div className={`tasks-department-grid${isMobileLayout ? ' is-mobile-layout' : ''}`}>
        {departmentBoards.map((board) => (
          <DepartmentBoardCard
            key={board.boardKey}
            board={board}
            tasks={tasks}
            todayKey={todayKey}
            onSelectDepartment={onSelectDepartment}
            onDeleteDepartment={onDeleteDepartment}
            isDeletingDepartment={isDeletingDepartment}
            compact={isMobileLayout}
            canManage={canManage}
          />
        ))}

        {canManage ? (
        <button
          type="button"
          className={`tasks-department-card is-create-action${isMobileLayout ? ' is-compact' : ''}`}
          onClick={onCreateDepartment}
          disabled={isDeletingDepartment}
        >
          <div className="tasks-department-sticker-top">
            <span className="tasks-department-icon" aria-hidden="true">+</span>
            <h4 className="tasks-department-name">Create Department</h4>
          </div>
          {!isMobileLayout ? (
            <div className="tasks-department-empty">
              <p className="tasks-department-empty-line">Add Kitchen, Cleaning, Delivery, or any custom team.</p>
            </div>
          ) : null}
        </button>
        ) : null}
      </div>
    </section>
  )
}
