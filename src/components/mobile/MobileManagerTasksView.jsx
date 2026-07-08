import { useMemo, useState } from 'react'
import { buildManagerMobileTodayTaskList } from '../../lib/mobileManagerTodayUtils'
import {
  buildChecklistProgressRows,
  formatChecklistProgressLabel,
} from '../../lib/operationsChecklistUtils'
import {
  formatOperationsLogCardTime,
  getOperationsCategoryLabel,
  getOperationsLogTypeBadgeLabel,
  getOperationsLogTypeTone,
  getOperationsPriorityLabel,
  getOperationsShiftNoteHeadline,
  normalizeOperationsStatus,
  resolveEmployeeName,
} from '../../lib/operationsUtils'
import { formatTime24 } from '../../lib/timeFormatUtils'
import { OperationsTaskFormModal } from '../operations/OperationsTaskFormModal'
import { MobileTaskDetailSheet } from './MobileTaskDetailSheet'

const RECENT_NOTES_LIMIT = 2

function sortLogsNewestFirst(logs = []) {
  return [...(logs ?? [])].sort((left, right) => {
    const leftTime = new Date(left?.createdAt ?? 0).getTime()
    const rightTime = new Date(right?.createdAt ?? 0).getTime()
    return rightTime - leftTime
  })
}

function normalizeTaskDateKey(value) {
  if (!value) return ''
  const raw = `${value}`.trim()
  if (!raw) return ''
  if (raw.includes('T')) return raw.split('T')[0]
  return raw.slice(0, 10)
}

function formatTaskDueTimeLabel(task) {
  const dueTime = formatTime24(task?.dueTime ?? task?.due_time, '')
  return dueTime ? `Due ${dueTime}` : ''
}

function getTaskStatusLabel(task, todayKey = '') {
  const isDone = normalizeOperationsStatus(task?.status) !== 'pending'
  if (isDone) return 'Completed'

  const dueDate = normalizeTaskDateKey(task?.dueDate ?? task?.due_date)
  if (dueDate && dueDate < todayKey) return 'Overdue'
  return 'Pending'
}

function getAssignmentLabel(task, employees = []) {
  const assignedTo = task?.assignedTo ?? task?.assigned_to ?? null
  if (!assignedTo) return ''
  return resolveEmployeeName(assignedTo, employees)
}

function ChecklistRow({ row, onOpen }) {
  const tone = row.status === 'complete'
    ? 'success'
    : row.started
      ? 'warning'
      : 'default'

  return (
    <li className="mobile-manager-tasks-checklist-item">
      <button
        type="button"
        className={`mobile-manager-tasks-checklist-card tone-${tone}`}
        onClick={() => onOpen?.(row)}
        disabled={!onOpen}
      >
        <span className="mobile-manager-tasks-checklist-name">{row.templateName}</span>
        <span className="mobile-manager-tasks-checklist-status">
          {formatChecklistProgressLabel(row)}
        </span>
      </button>
    </li>
  )
}

function ManagerTodayTaskCard({ task, employees = [], todayKey = '', onSelect }) {
  const priority = `${task?.priority ?? 'normal'}`.trim().toLowerCase()
  const isDone = normalizeOperationsStatus(task?.status) !== 'pending'
  const assigneeName = getAssignmentLabel(task, employees)
  const statusLabel = getTaskStatusLabel(task, todayKey)
  const isOverdue = statusLabel === 'Overdue'
  const dueTimeLabel = formatTaskDueTimeLabel(task)

  return (
    <li className="mobile-manager-today-task-item">
      <button
        type="button"
        className={`mobile-manager-today-task-card${isOverdue ? ' is-overdue' : ''}${isDone ? ' is-done' : ''}`}
        onClick={() => onSelect?.(task)}
      >
        <div className="mobile-manager-today-task-header">
          <h3 className="mobile-manager-today-task-title">{task.title ?? 'Task'}</h3>
          <span className={`mobile-manager-today-task-priority priority-${priority}`}>
            {getOperationsPriorityLabel(task.priority)}
          </span>
        </div>
        <p className="mobile-manager-today-task-department">
          {getOperationsCategoryLabel(task.category)}
        </p>
        {assigneeName ? (
          <p className="mobile-manager-today-task-owner">{assigneeName}</p>
        ) : null}
        <div className="mobile-manager-today-task-footer">
          {dueTimeLabel ? (
            <span className="mobile-manager-today-task-due">{dueTimeLabel}</span>
          ) : (
            <span className="mobile-manager-today-task-due" aria-hidden="true" />
          )}
          <span className={`mobile-manager-today-task-status${isDone ? ' is-done' : ''}${isOverdue ? ' is-overdue' : ''}`}>
            {statusLabel}
          </span>
        </div>
      </button>
    </li>
  )
}

function RecentNoteCard({ log }) {
  const tone = getOperationsLogTypeTone(log.type)
  const headline = getOperationsShiftNoteHeadline(log)
  const authorName = `${log.createdByName ?? ''}`.trim()
  const authorLabel = authorName && authorName !== 'System' ? authorName : 'Team member'

  return (
    <li className="mobile-manager-tasks-note-item">
      <article className={`mobile-manager-tasks-note-card tone-${tone}`}>
        <span className="mobile-manager-tasks-note-badge">
          {getOperationsLogTypeBadgeLabel(log.type)}
        </span>
        <p className="mobile-manager-tasks-note-headline">{headline}</p>
        <p className="mobile-manager-tasks-note-meta">
          {authorLabel} · {formatOperationsLogCardTime(log.createdAt)}
        </p>
      </article>
    </li>
  )
}

export function MobileManagerTasksView({
  tasks = [],
  taskOverview = {},
  employees = [],
  checklistTemplates = [],
  operationsLogs = [],
  todayKey = '',
  isLoading = false,
  isSaving = false,
  onCreateTask,
  onCompleteTask,
  onOpenChecklist,
}) {
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)

  const {
    completionPercent = 0,
    todayTotal = 0,
    todayCompleted = 0,
  } = taskOverview

  const hasTodayWork = todayTotal > 0

  const todayTasks = useMemo(
    () => buildManagerMobileTodayTaskList(tasks, todayKey),
    [tasks, todayKey],
  )

  const checklistRows = useMemo(
    () => buildChecklistProgressRows(checklistTemplates, tasks, todayKey),
    [checklistTemplates, tasks, todayKey],
  )

  const recentNotes = useMemo(
    () => sortLogsNewestFirst(operationsLogs).slice(0, RECENT_NOTES_LIMIT),
    [operationsLogs],
  )

  const selectedAssigneeName = selectedTask
    ? getAssignmentLabel(selectedTask, employees) || 'Unassigned'
    : 'Unassigned'

  const handleOpenNewTask = () => {
    if (onCreateTask) {
      setIsTaskFormOpen(true)
    }
  }

  const handleTaskSubmit = async (payload) => {
    await onCreateTask?.(payload)
    setIsTaskFormOpen(false)
  }

  const handleCompleteTask = async ({ completionNote = '' } = {}) => {
    if (!selectedTask) return
    await onCompleteTask?.(selectedTask, { completionNote })
    setSelectedTask(null)
  }

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
          ) : null}

          <section className="mobile-manager-tasks-section" aria-label="Today's tasks">
            <div className="mobile-manager-tasks-section-header">
              <p className="mobile-manager-tasks-block-label">Today&apos;s tasks</p>
              <button
                type="button"
                className="mobile-manager-tasks-inline-new-btn"
                onClick={handleOpenNewTask}
                disabled={!onCreateTask || isSaving}
              >
                + New
              </button>
            </div>
            {hasTodayWork ? (
              <ul className="mobile-manager-today-task-list">
                {todayTasks.map((task) => (
                  <ManagerTodayTaskCard
                    key={task.id}
                    task={task}
                    employees={employees}
                    todayKey={todayKey}
                    onSelect={setSelectedTask}
                  />
                ))}
              </ul>
            ) : (
              <div className="mobile-manager-tasks-empty is-hero" role="status">
                <p className="mobile-manager-tasks-empty-title">Everything is on track</p>
                <p className="mobile-manager-tasks-empty-message">No pending tasks today</p>
              </div>
            )}
          </section>

          <section className="mobile-manager-tasks-section" aria-label="Today's checklist">
            <p className="mobile-manager-tasks-block-label">Today&apos;s checklist</p>
            {checklistRows.length > 0 ? (
              <ul className="mobile-manager-tasks-checklist-list">
                {checklistRows.map((row) => (
                  <ChecklistRow key={row.templateId} row={row} onOpen={onOpenChecklist} />
                ))}
              </ul>
            ) : (
              <p className="mobile-manager-tasks-inline-empty">No checklists scheduled</p>
            )}
          </section>

          <section className="mobile-manager-tasks-section" aria-label="Recent team notes">
            <p className="mobile-manager-tasks-block-label">Recent team notes</p>
            {recentNotes.length > 0 ? (
              <ul className="mobile-manager-tasks-note-list">
                {recentNotes.map((log) => (
                  <RecentNoteCard key={log.id} log={log} />
                ))}
              </ul>
            ) : (
              <p className="mobile-manager-tasks-inline-empty">No notes yet today</p>
            )}
          </section>
        </>
      )}

      {isTaskFormOpen ? (
        <OperationsTaskFormModal
          isOpen={isTaskFormOpen}
          task={null}
          todayKey={todayKey}
          employees={employees}
          isSaving={isSaving}
          onClose={() => {
            if (isSaving) return
            setIsTaskFormOpen(false)
          }}
          onSubmit={handleTaskSubmit}
        />
      ) : null}

      <MobileTaskDetailSheet
        task={selectedTask}
        assigneeName={selectedAssigneeName}
        todayKey={todayKey}
        canComplete={Boolean(onCompleteTask)}
        isSaving={isSaving}
        onClose={() => setSelectedTask(null)}
        onComplete={handleCompleteTask}
      />
    </div>
  )
}
