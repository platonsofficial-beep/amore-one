import { useState } from 'react'
import {
  canStaffCompleteTask,
  getOperationsCategoryLabel,
  getOperationsPriorityLabel,
  normalizeOperationsStatus,
  resolveEmployeeName,
} from '../../lib/operationsUtils'
import { formatTime24 } from '../../lib/timeFormatUtils'
import { parseLocalDate } from '../../lib/weekUtils'
import { MobileTaskDetailSheet } from './MobileTaskDetailSheet'

const TASK_TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'pending', label: 'Pending' },
  { id: 'completed', label: 'Completed' },
]

function normalizeTaskDateKey(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function formatTaskDueLabel(task, todayKey = '') {
  const dueDate = normalizeTaskDateKey(task?.dueDate ?? task?.due_date)
  const dueTime = formatTime24(task?.dueTime ?? task?.due_time, '')

  let dateLabel = 'No due date'
  if (dueDate) {
    if (dueDate === todayKey) {
      dateLabel = 'Today'
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

function formatCompletedCardMeta(task) {
  const completedBy = `${task?.completedByName ?? ''}`.trim() || 'Team member'
  const completedAt = task?.completedAt ?? task?.completed_at
  if (!completedAt) return `Completed by ${completedBy}`

  const parsed = new Date(completedAt)
  const timeLabel = Number.isNaN(parsed.getTime())
    ? ''
    : new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(parsed)

  return timeLabel ? `Completed by ${completedBy} · ${timeLabel}` : `Completed by ${completedBy}`
}

function getAssignmentLabel(task, employees = []) {
  const assignedTo = task?.assignedTo ?? task?.assigned_to ?? null
  if (!assignedTo) return 'Unassigned'
  return resolveEmployeeName(assignedTo, employees)
}

export function MobileTasksView({
  taskGroups = { upcoming: [], pending: [], completed: [] },
  employees = [],
  currentEmployeeId = null,
  todayKey = '',
  needsEmployeeLink = false,
  isLoading = false,
  isSaving = false,
  onCompleteTask,
  onOpenTasksWorkspace,
}) {
  const [activeTab, setActiveTab] = useState('pending')
  const [selectedTask, setSelectedTask] = useState(null)
  const visibleTasks = taskGroups[activeTab] ?? []

  const handleCompleteTask = async ({ completionNote = '' } = {}) => {
    if (!selectedTask) return
    await onCompleteTask?.(selectedTask, { completionNote })
    setSelectedTask(null)
  }

  const selectedAssigneeName = selectedTask
    ? getAssignmentLabel(selectedTask, employees)
    : 'Unassigned'

  const selectedCanComplete = selectedTask
    ? canStaffCompleteTask(selectedTask, currentEmployeeId)
    : false

  if (needsEmployeeLink) {
    return (
      <div className="mobile-screen mobile-tasks">
        <header className="mobile-screen-header">
          <p className="mobile-screen-eyebrow">My work</p>
          <h1 className="mobile-screen-title">Tasks</h1>
        </header>

        <section className="mobile-card tone-neutral">
          <h2 className="mobile-card-headline">Employee profile required</h2>
          <p className="mobile-card-detail">Link your employee profile to view and complete your tasks.</p>
        </section>
      </div>
    )
  }

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
          {visibleTasks.map((task) => {
            const priority = `${task?.priority ?? 'normal'}`.trim().toLowerCase()
            const isDone = normalizeOperationsStatus(task?.status) !== 'pending'
            const assignmentLabel = getAssignmentLabel(task, employees)

            return (
              <li key={task.id}>
                <button
                  type="button"
                  className={`mobile-task-card${priority === 'urgent' ? ' is-urgent' : ''}`}
                  onClick={() => setSelectedTask(task)}
                >
                  <div className="mobile-task-card-copy">
                    <div className="mobile-task-card-title-row">
                      <strong>{task.title ?? 'Task'}</strong>
                      <span className={`mobile-task-priority-badge priority-${priority}`}>
                        {getOperationsPriorityLabel(task.priority)}
                      </span>
                    </div>
                    {activeTab === 'completed' ? (
                      <>
                        <span>{formatCompletedCardMeta(task)}</span>
                        {task.completionNote ? (
                          <span className="mobile-task-completion-preview">Note: {task.completionNote}</span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <span>{formatTaskDueLabel(task, todayKey)}</span>
                        <span className="mobile-task-meta-row">
                          <span className="mobile-task-category">{getOperationsCategoryLabel(task.category)}</span>
                          <span aria-hidden="true">·</span>
                          <span className="mobile-task-assignment">{assignmentLabel}</span>
                        </span>
                      </>
                    )}
                    {isDone && activeTab !== 'completed' ? (
                      <span className="mobile-task-status-chip">Done</span>
                    ) : null}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {!isLoading && visibleTasks.length > 0 && onOpenTasksWorkspace ? (
        <button type="button" className="mobile-secondary-btn" onClick={onOpenTasksWorkspace}>
          Open full tasks board
        </button>
      ) : null}

      <MobileTaskDetailSheet
        task={selectedTask}
        assigneeName={selectedAssigneeName}
        todayKey={todayKey}
        canComplete={selectedCanComplete}
        isSaving={isSaving}
        onClose={() => setSelectedTask(null)}
        onComplete={handleCompleteTask}
      />
    </div>
  )
}
