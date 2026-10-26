import { useMemo } from 'react'
import {
  formatChecklistCompletionMeta,
  getChecklistStepsForTask,
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
    <li className="operations-checklist-exec-item">
      <button
        type="button"
        className={`operations-checklist-exec-step${isDone ? ' is-done' : ''}`}
        onClick={() => onToggleComplete(task)}
        disabled={!canComplete}
        aria-label={isDone ? `Reopen ${task.title}` : `Complete ${task.title}`}
        aria-pressed={isDone}
      >
        <span className={`operations-checklist-exec-mark${isDone ? ' is-checked' : ''}`} aria-hidden="true">
          {isDone ? '✓' : ''}
        </span>
        <span className="operations-checklist-exec-copy">
          <span className="operations-checklist-exec-title">{task.title}</span>
          {completionMeta ? (
            <span className="operations-checklist-exec-meta">{completionMeta}</span>
          ) : null}
        </span>
      </button>
    </li>
  )
}

export function OperationsChecklistExecutionView({
  template = null,
  title = '',
  taskId = '',
  tasks = [],
  todayKey = '',
  canComplete = true,
  isSaving = false,
  onBack,
  onToggleComplete,
}) {
  const heading = template?.name || title || 'Checklist'
  const checklistTasks = useMemo(() => (
    taskId
      ? getChecklistStepsForTask(tasks, taskId)
      : getChecklistTasksForTemplate(tasks, template?.id, todayKey)
  ), [taskId, tasks, template?.id, todayKey])

  const completedCount = checklistTasks.filter(
    (task) => normalizeOperationsStatus(task.status) === 'completed',
  ).length
  const totalCount = checklistTasks.length
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0

  return (
    <section className="operations-checklist-exec-page" aria-label={`${heading} execution`}>
      <header className="operations-checklist-exec-header">
        <button type="button" className="ghost-btn operations-checklist-exec-back" onClick={onBack}>
          ← Back
        </button>
        <div className="operations-checklist-exec-heading">
          <h3>{heading}</h3>
          <p className="operations-checklist-exec-progress-label">
            {completedCount}/{totalCount} done
          </p>
        </div>
      </header>

      <div
        className="operations-checklist-exec-progress-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progressPercent}
        aria-label={`${heading} progress`}
      >
        <span className="operations-checklist-exec-progress-fill" style={{ width: `${progressPercent}%` }} />
      </div>

      {checklistTasks.length === 0 ? (
        <div className="operations-empty-state">
          <h4>Checklist not started</h4>
          <p>Start this checklist from the dashboard.</p>
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
