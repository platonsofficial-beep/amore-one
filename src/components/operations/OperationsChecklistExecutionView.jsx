import { useMemo } from 'react'
import {
  formatChecklistCompletionMeta,
  getChecklistTasksForTemplate,
} from '../../lib/operationsChecklistUtils'
import { normalizeOperationsStatus } from '../../lib/operationsUtils'

function ChecklistExecutionItem({
  task,
  canComplete,
  onToggleComplete,
}) {
  const isDone = normalizeOperationsStatus(task.status) === 'completed'
  const completionMeta = formatChecklistCompletionMeta(task)

  return (
    <li className={`operations-checklist-exec-item${isDone ? ' is-done' : ''}`}>
      <button
        type="button"
        className={`operations-checklist-exec-checkbox${isDone ? ' is-checked' : ''}`}
        onClick={() => onToggleComplete(task)}
        disabled={!canComplete}
        aria-label={isDone ? `Reopen ${task.title}` : `Complete ${task.title}`}
        aria-pressed={isDone}
      >
        {isDone ? '✓' : ''}
      </button>

      <div className="operations-checklist-exec-copy">
        <strong className="operations-checklist-exec-title">{task.title}</strong>
        {task.description ? (
          <p className="operations-checklist-exec-description">{task.description}</p>
        ) : null}
        {completionMeta ? (
          <p className="operations-checklist-exec-meta">{completionMeta}</p>
        ) : null}
      </div>
    </li>
  )
}

export function OperationsChecklistExecutionView({
  template = null,
  tasks = [],
  todayKey = '',
  canComplete = true,
  isSaving = false,
  onBack,
  onToggleComplete,
}) {
  const checklistTasks = useMemo(
    () => getChecklistTasksForTemplate(tasks, template?.id, todayKey),
    [tasks, template?.id, todayKey],
  )

  const completedCount = checklistTasks.filter(
    (task) => normalizeOperationsStatus(task.status) === 'completed',
  ).length
  const totalCount = checklistTasks.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <section className="operations-checklist-exec-page" aria-label={`${template?.name ?? 'Checklist'} execution`}>
      <header className="operations-checklist-exec-header">
        <button type="button" className="ghost-btn operations-checklist-exec-back" onClick={onBack}>
          ← Back
        </button>
        <div className="operations-checklist-exec-heading">
          <p className="operations-dashboard-eyebrow">Checklist</p>
          <h3>{template?.name ?? 'Checklist'}</h3>
          <p className="operations-checklist-exec-progress-label">
            {completedCount}/{totalCount} completed
          </p>
        </div>
      </header>

      <div className="operations-checklist-exec-progress">
        <div
          className="operations-checklist-exec-progress-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPercent}
          aria-label={`${template?.name ?? 'Checklist'} progress`}
        >
          <span className="operations-checklist-exec-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <span className="operations-checklist-exec-progress-value">{progressPercent}%</span>
      </div>

      {checklistTasks.length === 0 ? (
        <div className="operations-empty-state">
          <h4>Checklist not started</h4>
          <p>Start this checklist from the dashboard to generate today&apos;s tasks.</p>
        </div>
      ) : (
        <ul className="operations-checklist-exec-list">
          {checklistTasks.map((task) => (
            <ChecklistExecutionItem
              key={task.id}
              task={task}
              canComplete={canComplete && !isSaving}
              onToggleComplete={onToggleComplete}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
