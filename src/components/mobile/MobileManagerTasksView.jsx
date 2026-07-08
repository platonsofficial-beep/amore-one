import { useMemo } from 'react'
import {
  buildManagerMobileTeamProgress,
  pickManagerMobileAttentionTasks,
} from '../../lib/mobileManagerTodayUtils'
import { resolveEmployeeName } from '../../lib/operationsUtils'
import { formatTime24 } from '../../lib/timeFormatUtils'

const ATTENTION_PREVIEW_LIMIT = 3

function formatAttentionStatusLabel(attentionKind) {
  if (attentionKind === 'overdue') return 'Overdue'
  if (attentionKind === 'due-soon') return 'Due today'
  return 'Open'
}

function formatAttentionDueLabel(task, attentionKind) {
  const dueTime = formatTime24(task?.dueTime ?? task?.due_time, '')
  if (attentionKind === 'overdue') {
    return dueTime ? `Overdue · ${dueTime}` : 'Overdue'
  }
  if (dueTime) return `Due ${dueTime}`
  return attentionKind === 'due-soon' ? 'Due today' : 'No due time'
}

function ManagerAttentionTaskCard({ task, attentionKind, employees = [] }) {
  const assigneeId = task?.assignedTo ?? task?.assigned_to
  const ownerName = assigneeId
    ? resolveEmployeeName(assigneeId, employees)
    : ''

  return (
    <li className="mobile-manager-task-attention-item">
      <article className={`mobile-manager-task-attention-card tone-${attentionKind}`}>
        <div className="mobile-manager-task-attention-header">
          <h3 className="mobile-manager-task-attention-title">{task.title ?? 'Task'}</h3>
          <span className={`mobile-manager-task-attention-badge tone-${attentionKind}`}>
            {formatAttentionStatusLabel(attentionKind)}
          </span>
        </div>
        {ownerName ? (
          <p className="mobile-manager-task-attention-owner">{ownerName}</p>
        ) : null}
        <p className="mobile-manager-task-attention-due">
          {formatAttentionDueLabel(task, attentionKind)}
        </p>
      </article>
    </li>
  )
}

function ManagerTeamProgressRow({ name, done, total }) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <li className="mobile-manager-team-progress-item">
      <div className="mobile-manager-team-progress-row">
        <span className="mobile-manager-team-progress-name">{name}</span>
        <span className="mobile-manager-team-progress-count">{done}/{total} done</span>
      </div>
      <div className="mobile-manager-team-progress-track" aria-hidden="true">
        <span
          className="mobile-manager-team-progress-fill"
          style={{ width: `${percent}%` }}
        />
      </div>
    </li>
  )
}

export function MobileManagerTasksView({
  tasks = [],
  taskOverview = {},
  employees = [],
  todayKey = '',
  isLoading = false,
  onNewTask,
}) {
  const {
    completionPercent = 0,
    todayTotal = 0,
    todayCompleted = 0,
  } = taskOverview

  const hasTodayWork = todayTotal > 0

  const attentionTasks = useMemo(
    () => pickManagerMobileAttentionTasks(tasks, todayKey, ATTENTION_PREVIEW_LIMIT),
    [tasks, todayKey],
  )

  const teamProgress = useMemo(
    () => buildManagerMobileTeamProgress(tasks, employees, todayKey),
    [tasks, employees, todayKey],
  )

  const hasAttentionTasks = attentionTasks.length > 0

  return (
    <div className="mobile-screen mobile-manager-tasks mobile-manager-tasks-workflow">
      <header className="mobile-manager-tasks-header" aria-label="Tasks overview">
        <h1 className="mobile-manager-tasks-title">Tasks</h1>
      </header>

      {isLoading ? (
        <p className="mobile-manager-tasks-loading">Loading tasks…</p>
      ) : (
        <>
          {hasTodayWork ? (
            <section className="mobile-manager-tasks-command" aria-label="Today progress">
              <p className="mobile-manager-tasks-block-label">Today</p>
              <div className="mobile-manager-tasks-command-body">
                <p className="mobile-manager-tasks-command-summary">
                  <strong>{todayCompleted}</strong> of <strong>{todayTotal}</strong> complete
                </p>
                <span className="mobile-manager-tasks-command-percent">{completionPercent}%</span>
              </div>
              <div
                className="mobile-manager-tasks-progress-track"
                role="progressbar"
                aria-valuenow={completionPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${completionPercent}% of today's tasks complete`}
              >
                <span
                  className="mobile-manager-tasks-progress-fill"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
            </section>
          ) : (
            <div className="mobile-manager-tasks-empty is-hero" role="status">
              <p className="mobile-manager-tasks-empty-title">Everything is on track</p>
              <p className="mobile-manager-tasks-empty-message">No tasks scheduled today</p>
            </div>
          )}

          <section className="mobile-manager-tasks-section" aria-label="Needs attention">
            <p className="mobile-manager-tasks-block-label">Needs attention</p>
            {hasAttentionTasks ? (
              <ul className="mobile-manager-task-attention-list">
                {attentionTasks.map(({ task, attentionKind }) => (
                  <ManagerAttentionTaskCard
                    key={task.id}
                    task={task}
                    attentionKind={attentionKind}
                    employees={employees}
                  />
                ))}
              </ul>
            ) : hasTodayWork ? (
              <div className="mobile-manager-tasks-empty is-subtle" role="status">
                <p className="mobile-manager-tasks-empty-title">All clear for now</p>
                <p className="mobile-manager-tasks-empty-message">No overdue or due-soon tasks</p>
              </div>
            ) : null}
          </section>

          {teamProgress.length > 0 ? (
            <section className="mobile-manager-tasks-section" aria-label="Team progress">
              <p className="mobile-manager-tasks-block-label">Team progress</p>
              <ul className="mobile-manager-team-progress-list">
                {teamProgress.map((entry) => (
                  <ManagerTeamProgressRow
                    key={entry.employeeId}
                    name={entry.name}
                    done={entry.done}
                    total={entry.total}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mobile-manager-tasks-quick-bar is-single" aria-label="Task quick actions">
            <button
              type="button"
              className="mobile-manager-tasks-quick-btn mobile-manager-tasks-quick-btn-primary"
              onClick={onNewTask}
              disabled={!onNewTask}
            >
              + New task
            </button>
          </section>
        </>
      )}
    </div>
  )
}
