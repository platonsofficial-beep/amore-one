import { useMemo, useState } from 'react'
import {
  buildChecklistProgressRows,
  filterStandaloneOperationsTasks,
  formatChecklistProgressLabel,
} from '../../lib/operationsChecklistUtils'
import {
  filterOperationsLogs,
  filterOperationsTasks,
  OPERATIONS_LOG_FILTERS,
  sortOperationsTasks,
} from '../../lib/operationsBrowse'
import {
  buildOperationsDashboardSummary,
  canStaffCompleteTask,
  formatOperationsDueTime,
  formatOperationsLogTimestamp,
  getOperationsCategoryLabel,
  getOperationsLogTypeLabel,
  getOperationsLogTypeTone,
  getOperationsPriorityLabel,
  getOperationsPriorityTone,
  normalizeOperationsStatus,
  resolveEmployeeName,
} from '../../lib/operationsUtils'
import { OperationsLogFormModal } from './OperationsLogFormModal'
import { OperationsStartChecklistModal } from './OperationsStartChecklistModal'
import { OperationsTaskCompleteModal } from './OperationsTaskCompleteModal'
import { OperationsTaskFormModal } from './OperationsTaskFormModal'

function OperationsChecklistProgressCard({ row, canManage, onOpen }) {
  const tone = row.status === 'complete'
    ? 'success'
    : row.started
      ? 'warning'
      : 'default'

  const isDisabled = (!row.started && !canManage) || row.itemCount === 0

  return (
    <button
      type="button"
      className={`operations-checklist-progress-card tone-${tone}`}
      onClick={() => onOpen?.(row)}
      disabled={isDisabled}
    >
      <span className="operations-checklist-progress-name">{row.templateName}</span>
      <span className="operations-checklist-progress-value">{formatChecklistProgressLabel(row)}</span>
    </button>
  )
}

function OperationsSummaryCard({ label, value, tone = 'default' }) {
  return (
    <article className={`operations-summary-card tone-${tone}`}>
      <p className="operations-summary-label">{label}</p>
      <p className="operations-summary-value">{value}</p>
    </article>
  )
}

function OperationsTaskRow({
  task,
  assigneeName,
  canManage,
  canComplete,
  onToggleComplete,
  onEdit,
  onDelete,
}) {
  const isDone = normalizeOperationsStatus(task.status) !== 'pending'
  const priorityTone = getOperationsPriorityTone(task.priority)

  return (
    <li className={`operations-task-row${isDone ? ' is-done' : ''}`}>
      <button
        type="button"
        className={`operations-task-checkbox${isDone ? ' is-checked' : ''}`}
        onClick={() => onToggleComplete(task)}
        disabled={!canComplete && !canManage}
        aria-label={isDone ? `Reopen ${task.title}` : `Complete ${task.title}`}
        aria-pressed={isDone}
      >
        {isDone ? '✓' : ''}
      </button>

      <div className="operations-task-copy">
        <div className="operations-task-title-row">
          <strong className="operations-task-title">{task.title}</strong>
          <span className={`operations-priority-badge tone-${priorityTone}`}>
            {getOperationsPriorityLabel(task.priority)}
          </span>
        </div>
        <p className="operations-task-meta">
          <span>{getOperationsCategoryLabel(task.category)}</span>
          <span aria-hidden="true">·</span>
          <span>{assigneeName}</span>
          <span aria-hidden="true">·</span>
          <span>{formatOperationsDueTime(task.dueTime)}</span>
        </p>
        {task.description ? (
          <p className="operations-task-description">{task.description}</p>
        ) : null}
        {task.completionNote ? (
          <p className="operations-task-completion-note">Note: {task.completionNote}</p>
        ) : null}
      </div>

      {canManage ? (
        <div className="operations-task-actions">
          <button type="button" className="ghost-btn operations-task-action" onClick={() => onEdit(task)}>
            Edit
          </button>
          <button type="button" className="ghost-btn operations-task-action operations-task-delete" onClick={() => onDelete(task)}>
            Delete
          </button>
        </div>
      ) : null}
    </li>
  )
}

function OperationsLogItem({ log, canManage, onEdit, onDelete }) {
  const tone = getOperationsLogTypeTone(log.type)

  return (
    <article className="operations-log-item panel staff-panel">
      <div className="operations-log-item-top">
        <span className={`operations-log-type-badge tone-${tone}`}>
          {getOperationsLogTypeLabel(log.type)}
        </span>
        <time className="operations-log-time">{formatOperationsLogTimestamp(log.createdAt)}</time>
      </div>
      <h4 className="operations-log-title">{log.title}</h4>
      <p className="operations-log-message">{log.message}</p>
      <p className="operations-log-author">{log.createdByName || 'System'}</p>
      {canManage ? (
        <div className="operations-log-actions">
          <button type="button" className="ghost-btn operations-log-action" onClick={() => onEdit(log)}>
            Edit
          </button>
          <button type="button" className="ghost-btn operations-log-action operations-log-delete" onClick={() => onDelete(log)}>
            Delete
          </button>
        </div>
      ) : null}
    </article>
  )
}

export function OperationsDashboardView({
  tasks = [],
  logs = [],
  checklistTemplates = [],
  employees = [],
  todayKey = '',
  isLoading = false,
  noticeMessage = '',
  canManage = false,
  isSaving = false,
  isWorkspaceReady = false,
  workspaceSetupMessage = '',
  searchTerm = '',
  currentEmployeeId = null,
  onCreateTask,
  onUpdateTask,
  onCompleteTask,
  onReopenTask,
  onDeleteTask,
  onCreateLog,
  onUpdateLog,
  onDeleteLog,
  onStartChecklist,
  onOpenChecklistRun,
}) {
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [completingTask, setCompletingTask] = useState(null)
  const [isLogFormOpen, setIsLogFormOpen] = useState(false)
  const [editingLog, setEditingLog] = useState(null)
  const [logTypeFilter, setLogTypeFilter] = useState('all')
  const [isStartChecklistOpen, setIsStartChecklistOpen] = useState(false)

  const assigneeNameById = useMemo(() => (employeeId) => (
    resolveEmployeeName(employeeId, employees)
  ), [employees])

  const standaloneTasks = useMemo(
    () => filterStandaloneOperationsTasks(tasks),
    [tasks],
  )

  const summary = useMemo(
    () => buildOperationsDashboardSummary(standaloneTasks, logs, todayKey),
    [standaloneTasks, logs, todayKey],
  )

  const checklistProgressRows = useMemo(
    () => buildChecklistProgressRows(checklistTemplates, tasks, todayKey),
    [checklistTemplates, tasks, todayKey],
  )

  const visibleTasks = useMemo(() => {
    const filtered = filterOperationsTasks(standaloneTasks, {
      searchTerm,
      assigneeNameById,
    })
    return sortOperationsTasks(filtered)
  }, [standaloneTasks, searchTerm, assigneeNameById])

  const visibleLogs = useMemo(() => {
    return filterOperationsLogs(logs, { searchTerm, typeFilter: logTypeFilter })
  }, [logs, searchTerm, logTypeFilter])

  const handleToggleComplete = (task) => {
    const isDone = normalizeOperationsStatus(task.status) !== 'pending'

    if (isDone) {
      onReopenTask?.(task)
      return
    }

    if (canManage) {
      onCompleteTask?.(task, { completionNote: '' })
      return
    }

    if (canStaffCompleteTask(task, currentEmployeeId)) {
      setCompletingTask(task)
    }
  }

  const handleCompleteSubmit = async ({ completionNote }) => {
    if (!completingTask) return
    await onCompleteTask?.(completingTask, { completionNote })
    setCompletingTask(null)
  }

  const handleTaskSubmit = async (payload) => {
    if (editingTask) {
      await onUpdateTask?.(editingTask.id, payload)
    } else {
      await onCreateTask?.(payload)
    }
    setEditingTask(null)
    setIsTaskFormOpen(false)
  }

  const handleLogSubmit = async (payload) => {
    if (editingLog) {
      await onUpdateLog?.(editingLog.id, payload)
    } else {
      await onCreateLog?.(payload)
    }
    setEditingLog(null)
    setIsLogFormOpen(false)
  }

  const handleStartChecklist = async (template) => {
    await onStartChecklist?.(template)
    setIsStartChecklistOpen(false)
  }

  const handleOpenChecklistProgress = (row) => {
    if (row.started) {
      onOpenChecklistRun?.(row.templateId)
      return
    }
    if (canManage) {
      setIsStartChecklistOpen(true)
    }
  }

  return (
    <section className="operations-dashboard-page" aria-label="Operations dashboard">
      {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
      {!isWorkspaceReady && workspaceSetupMessage ? (
        <div className="staff-status-banner">{workspaceSetupMessage}</div>
      ) : null}
      {isLoading ? <div className="staff-status-banner">Loading operations…</div> : null}

      <div className="operations-dashboard-toolbar">
        <div>
          <p className="operations-dashboard-eyebrow">Today</p>
          <h3 className="operations-dashboard-heading">Operational control center</h3>
          <p className="operations-dashboard-copy">
            Track daily tasks, urgent issues, and shift communication.
          </p>
        </div>
        {canManage ? (
          <div className="operations-dashboard-actions">
            <button
              type="button"
              className="ghost-btn operations-dashboard-action"
              onClick={() => setIsStartChecklistOpen(true)}
              disabled={!isWorkspaceReady || isSaving}
            >
              Start checklist
            </button>
            <button
              type="button"
              className="ghost-btn operations-dashboard-action"
              onClick={() => {
                setEditingLog(null)
                setIsLogFormOpen(true)
              }}
              disabled={!isWorkspaceReady || isSaving}
            >
              Add log entry
            </button>
            <button
              type="button"
              className="primary-btn operations-dashboard-action"
              onClick={() => {
                setEditingTask(null)
                setIsTaskFormOpen(true)
              }}
              disabled={!isWorkspaceReady || isSaving}
            >
              Create task
            </button>
          </div>
        ) : null}
      </div>

      <div className="operations-summary-grid">
        <OperationsSummaryCard label="Open tasks" value={summary.openTasks} tone="warning" />
        <OperationsSummaryCard label="Completed today" value={summary.completedToday} tone="success" />
        <OperationsSummaryCard label="Urgent issues" value={summary.urgentIssues} tone="danger" />
        <OperationsSummaryCard label="Team notes" value={summary.teamNotes} tone="gold" />
      </div>

      {checklistProgressRows.length > 0 ? (
        <section className="operations-section panel staff-panel" aria-label="Checklist progress">
          <header className="operations-section-header">
            <div>
              <p className="eyebrow">Checklists</p>
              <h3>Today&apos;s progress</h3>
            </div>
          </header>
          <div className="operations-checklist-progress-grid">
            {checklistProgressRows.map((row) => (
              <OperationsChecklistProgressCard
                key={row.templateId}
                row={row}
                canManage={canManage}
                onOpen={handleOpenChecklistProgress}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="operations-section panel staff-panel" aria-label="Today's tasks">
        <header className="operations-section-header">
          <div>
            <p className="eyebrow">Tasks</p>
            <h3>Today&apos;s task list</h3>
          </div>
          <p className="operations-section-count">{visibleTasks.length} task{visibleTasks.length === 1 ? '' : 's'}</p>
        </header>

        {visibleTasks.length === 0 && !isLoading ? (
          <div className="operations-empty-state">
            <h4>No tasks for today</h4>
            <p>{canManage ? 'Create a task to get the team started.' : 'Check back when tasks are assigned.'}</p>
          </div>
        ) : (
          <ul className="operations-task-list">
            {visibleTasks.map((task) => (
              <OperationsTaskRow
                key={task.id}
                task={task}
                assigneeName={assigneeNameById(task.assignedTo)}
                canManage={canManage}
                canComplete={canManage || canStaffCompleteTask(task, currentEmployeeId)}
                onToggleComplete={handleToggleComplete}
                onEdit={(item) => {
                  setEditingTask(item)
                  setIsTaskFormOpen(true)
                }}
                onDelete={onDeleteTask}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="operations-section panel staff-panel" aria-label="Manager logbook">
        <header className="operations-section-header">
          <div>
            <p className="eyebrow">Logbook</p>
            <h3>Shift communication</h3>
            <p className="operations-section-subtitle">Daily notes, incidents, and handovers.</p>
          </div>
        </header>

        <div className="operations-log-filters" role="tablist" aria-label="Log types">
          {OPERATIONS_LOG_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={logTypeFilter === filter.id}
              className={`operations-log-filter${logTypeFilter === filter.id ? ' active' : ''}`}
              onClick={() => setLogTypeFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {visibleLogs.length === 0 && !isLoading ? (
          <div className="operations-empty-state">
            <h4>No log entries yet</h4>
            <p>{canManage ? 'Add handovers, incidents, and team notes for the shift.' : 'Manager notes will appear here.'}</p>
          </div>
        ) : (
          <div className="operations-log-list">
            {visibleLogs.map((log) => (
              <OperationsLogItem
                key={log.id}
                log={log}
                canManage={canManage}
                onEdit={(item) => {
                  setEditingLog(item)
                  setIsLogFormOpen(true)
                }}
                onDelete={onDeleteLog}
              />
            ))}
          </div>
        )}
      </section>

      {isTaskFormOpen ? (
        <OperationsTaskFormModal
          key={editingTask?.id ?? 'new'}
          isOpen={isTaskFormOpen}
          task={editingTask}
          todayKey={todayKey}
          employees={employees}
          isSaving={isSaving}
          onClose={() => {
            if (isSaving) return
            setIsTaskFormOpen(false)
            setEditingTask(null)
          }}
          onSubmit={handleTaskSubmit}
        />
      ) : null}

      {completingTask ? (
        <OperationsTaskCompleteModal
          task={completingTask}
          isSaving={isSaving}
          onClose={() => {
            if (isSaving) return
            setCompletingTask(null)
          }}
          onSubmit={handleCompleteSubmit}
        />
      ) : null}

      {isLogFormOpen ? (
        <OperationsLogFormModal
          key={editingLog?.id ?? 'new'}
          isOpen={isLogFormOpen}
          log={editingLog}
          isSaving={isSaving}
          onClose={() => {
            if (isSaving) return
            setIsLogFormOpen(false)
            setEditingLog(null)
          }}
          onSubmit={handleLogSubmit}
        />
      ) : null}

      {isStartChecklistOpen ? (
        <OperationsStartChecklistModal
          isOpen={isStartChecklistOpen}
          templates={checklistTemplates}
          isSaving={isSaving}
          onClose={() => {
            if (isSaving) return
            setIsStartChecklistOpen(false)
          }}
          onStart={handleStartChecklist}
        />
      ) : null}
    </section>
  )
}
