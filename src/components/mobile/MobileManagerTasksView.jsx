import { useMemo, useState } from 'react'
import {
  buildChecklistProgressRows,
  formatChecklistProgressLabel,
} from '../../lib/operationsChecklistUtils'
import {
  formatOperationsLogCardTime,
  getOperationsLogTypeBadgeLabel,
  getOperationsLogTypeTone,
  getOperationsShiftNoteHeadline,
} from '../../lib/operationsUtils'
import { OperationsTaskFormModal } from '../operations/OperationsTaskFormModal'

const RECENT_NOTES_LIMIT = 2

function sortLogsNewestFirst(logs = []) {
  return [...(logs ?? [])].sort((left, right) => {
    const leftTime = new Date(left?.createdAt ?? 0).getTime()
    const rightTime = new Date(right?.createdAt ?? 0).getTime()
    return rightTime - leftTime
  })
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
  onOpenChecklist,
}) {
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false)

  const {
    completionPercent = 0,
    todayTotal = 0,
    todayCompleted = 0,
  } = taskOverview

  const hasTodayWork = todayTotal > 0

  const checklistRows = useMemo(
    () => buildChecklistProgressRows(checklistTemplates, tasks, todayKey),
    [checklistTemplates, tasks, todayKey],
  )

  const recentNotes = useMemo(
    () => sortLogsNewestFirst(operationsLogs).slice(0, RECENT_NOTES_LIMIT),
    [operationsLogs],
  )

  const handleOpenNewTask = () => {
    if (onCreateTask) {
      setIsTaskFormOpen(true)
      return
    }
  }

  const handleTaskSubmit = async (payload) => {
    await onCreateTask?.(payload)
    setIsTaskFormOpen(false)
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
          ) : (
            <div className="mobile-manager-tasks-empty is-hero" role="status">
              <p className="mobile-manager-tasks-empty-title">Everything is on track</p>
              <p className="mobile-manager-tasks-empty-message">No pending tasks today</p>
            </div>
          )}

          <section className="mobile-manager-tasks-quick-bar is-single" aria-label="Task quick actions">
            <button
              type="button"
              className="mobile-manager-tasks-quick-btn mobile-manager-tasks-quick-btn-primary"
              onClick={handleOpenNewTask}
              disabled={!onCreateTask || isSaving}
            >
              + New task
            </button>
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
    </div>
  )
}
