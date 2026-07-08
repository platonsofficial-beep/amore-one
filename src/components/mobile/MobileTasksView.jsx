import { useMemo, useState } from 'react'
import {
  canStaffCompleteTask,
  getOperationsCategoryLabel,
  getOperationsPriorityLabel,
  normalizeOperationsStatus,
  resolveEmployeeName,
} from '../../lib/operationsUtils'
import {
  getMobileOperationsStaffOwnershipLabel,
  getMobileOperationsTaskStatusLabel,
  getMobileStaffTaskTabEmptyState,
  groupMobileStaffPendingTasks,
} from '../../lib/mobileStaffUtils'
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

function MobileTaskCard({
  task,
  activeTab,
  todayKey,
  currentEmployeeId,
  employees,
  onSelect,
}) {
  const priority = `${task?.priority ?? 'normal'}`.trim().toLowerCase()
  const isDone = normalizeOperationsStatus(task?.status) !== 'pending'
  const statusLabel = getMobileOperationsTaskStatusLabel(task, todayKey)
  const isOverdue = statusLabel === 'Overdue'
  const ownershipLabel = getMobileOperationsStaffOwnershipLabel(task, currentEmployeeId)
  const assignmentLabel = getAssignmentLabel(task, employees)

  return (
    <li>
      <button
        type="button"
        className={`mobile-task-card${priority === 'urgent' || isOverdue ? ' is-urgent' : ''}${isOverdue ? ' is-overdue' : ''}`}
        onClick={() => onSelect(task)}
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
                <span className={`mobile-task-ownership${ownershipLabel === 'Team task' ? ' is-team' : ' is-mine'}`}>
                  {ownershipLabel}
                </span>
                <span aria-hidden="true">·</span>
                <span className="mobile-task-category">{getOperationsCategoryLabel(task.category)}</span>
                {assignmentLabel !== 'Unassigned' && ownershipLabel === 'Team task' ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="mobile-task-assignment">{assignmentLabel}</span>
                  </>
                ) : null}
              </span>
            </>
          )}
          {activeTab !== 'completed' ? (
            <span className={`mobile-task-status-chip${isOverdue ? ' is-overdue' : ''}${isDone ? ' is-done' : ''}`}>
              {statusLabel}
            </span>
          ) : null}
        </div>
      </button>
    </li>
  )
}

function PendingTaskSections({
  pendingTasks,
  todayKey,
  currentEmployeeId,
  employees,
  onSelect,
}) {
  const { overdue, dueToday } = useMemo(
    () => groupMobileStaffPendingTasks(pendingTasks, todayKey),
    [pendingTasks, todayKey],
  )

  const sections = [
    overdue.length > 0 ? { key: 'overdue', label: 'Overdue', tasks: overdue } : null,
    dueToday.length > 0 ? { key: 'due-today', label: 'Due today', tasks: dueToday } : null,
  ].filter(Boolean)

  if (sections.length <= 1) {
    return (
      <ul className="mobile-task-list">
        {pendingTasks.map((task) => (
          <MobileTaskCard
            key={task.id}
            task={task}
            activeTab="pending"
            todayKey={todayKey}
            currentEmployeeId={currentEmployeeId}
            employees={employees}
            onSelect={onSelect}
          />
        ))}
      </ul>
    )
  }

  return (
    <div className="mobile-task-sections">
      {sections.map((section) => (
        <section key={section.key} className="mobile-task-section" aria-label={section.label}>
          <h2 className="mobile-task-section-label">{section.label}</h2>
          <ul className="mobile-task-list">
            {section.tasks.map((task) => (
              <MobileTaskCard
                key={task.id}
                task={task}
                activeTab="pending"
                todayKey={todayKey}
                currentEmployeeId={currentEmployeeId}
                employees={employees}
                onSelect={onSelect}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
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
  const pendingGroups = useMemo(
    () => groupMobileStaffPendingTasks(taskGroups.pending ?? [], todayKey),
    [taskGroups.pending, todayKey],
  )
  const emptyState = getMobileStaffTaskTabEmptyState(activeTab, taskGroups, todayKey)

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
            className={`mobile-segmented-btn${activeTab === tab.id ? ' is-active' : ''}${tab.id === 'pending' && pendingGroups.overdue.length > 0 ? ' has-alert' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            <span className="mobile-segmented-count">{(taskGroups[tab.id] ?? []).length}</span>
          </button>
        ))}
      </div>

      {activeTab === 'pending' && pendingGroups.overdue.length > 0 ? (
        <p className="mobile-task-workflow-note" role="status">
          {pendingGroups.overdue.length} overdue {pendingGroups.overdue.length === 1 ? 'task needs' : 'tasks need'} attention
        </p>
      ) : null}

      {isLoading ? (
        <p className="mobile-empty-note">Loading tasks…</p>
      ) : visibleTasks.length === 0 ? (
        <section className="mobile-empty-state">
          <p className="mobile-empty-icon" aria-hidden="true">✓</p>
          <h2>{emptyState.title}</h2>
          <p>{emptyState.message}</p>
          {onOpenTasksWorkspace ? (
            <button type="button" className="mobile-primary-btn" onClick={onOpenTasksWorkspace}>
              Open operations dashboard
            </button>
          ) : null}
        </section>
      ) : activeTab === 'pending' ? (
        <PendingTaskSections
          pendingTasks={visibleTasks}
          todayKey={todayKey}
          currentEmployeeId={currentEmployeeId}
          employees={employees}
          onSelect={setSelectedTask}
        />
      ) : (
        <ul className="mobile-task-list">
          {visibleTasks.map((task) => (
            <MobileTaskCard
              key={task.id}
              task={task}
              activeTab={activeTab}
              todayKey={todayKey}
              currentEmployeeId={currentEmployeeId}
              employees={employees}
              onSelect={setSelectedTask}
            />
          ))}
        </ul>
      )}

      {!isLoading && visibleTasks.length > 0 && onOpenTasksWorkspace ? (
        <button type="button" className="mobile-secondary-btn" onClick={onOpenTasksWorkspace}>
          Open operations dashboard
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
