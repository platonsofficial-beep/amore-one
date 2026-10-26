import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildChecklistProgressRows,
  filterStandaloneOperationsTasks,
  formatChecklistProgressLabel,
} from '../../lib/operationsChecklistUtils'
import {
  filterAnnouncementsForUser,
  filterTasksExcludingAnnouncementDuplicates,
  truncateAnnouncementMessage,
} from '../../lib/operationsAnnouncementUtils'
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
  formatOperationsLogCardTime,
  getOperationsCategoryLabel,
  getOperationsLogTypeBadgeLabel,
  getOperationsLogTypeIcon,
  getOperationsLogTypeTone,
  getOperationsPriorityLabel,
  getOperationsPriorityTone,
  getOperationsShiftNoteDetail,
  getOperationsShiftNoteHeadline,
  getTaskAssigneeId,
  normalizeOperationsStatus,
  normalizeOperationsTaskDate,
  resolveEmployeeName,
} from '../../lib/operationsUtils'
import { buildSharedTaskWindow } from '../../lib/sharedTaskWindow'
import DepartmentPerformanceSummary from '../tasks/DepartmentPerformanceSummary'
import { OperationsAnnouncementsSection } from './OperationsAnnouncementsSection'
import { OperationsLogFormModal } from './OperationsLogFormModal'
import { OperationsStartChecklistModal } from './OperationsStartChecklistModal'
import { OperationsTaskCompleteModal } from './OperationsTaskCompleteModal'
import { OperationsTaskFormModal } from './OperationsTaskFormModal'

const MOBILE_COMMUNICATION_LIMIT = 4

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
  isFocused = false,
  onToggleComplete,
  onEdit,
  onDelete,
}) {
  const isDone = normalizeOperationsStatus(task.status) !== 'pending'
  const priorityTone = getOperationsPriorityTone(task.priority)
  const stepCount = Number(task.checklistStepCount ?? task.checklistSteps?.length ?? 0)
  const showSteps = Boolean(task.checklistRun) || stepCount > 0

  return (
    <li
      className={`operations-task-row${isDone ? ' is-done' : ''}${isFocused ? ' is-focused' : ''}`}
      data-operations-task-id={task.id}
    >
      <button
        type="button"
        className={`operations-task-checkbox${isDone ? ' is-checked' : ''}`}
        onClick={() => onToggleComplete(task)}
        disabled={!canComplete && !canManage}
        aria-label={showSteps
          ? `Open ${task.title}, ${task.checklistCompletedCount ?? 0} of ${stepCount} steps`
          : (isDone ? `Reopen ${task.title}` : `Complete ${task.title}`)}
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
          {showSteps ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{task.checklistCompletedCount ?? 0}/{stepCount} steps</span>
            </>
          ) : null}
        </p>
        {task.description ? (
          <p className="operations-task-description">{task.description}</p>
        ) : null}
        {task.completionNote ? (
          <p className="operations-task-completion-note">Note: {task.completionNote}</p>
        ) : null}
      </div>

      {canManage && !task.checklistRun ? (
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

function OperationsLogItem({ log, canManage, onEdit, onDelete, compact = false }) {
  const tone = getOperationsLogTypeTone(log.type)
  const headline = getOperationsShiftNoteHeadline(log)
  const detail = compact ? '' : getOperationsShiftNoteDetail(log)
  const authorName = `${log.createdByName ?? ''}`.trim()
  const authorLabel = authorName && authorName !== 'System' ? authorName : 'Team member'

  return (
    <article className={`operations-shift-note-card panel staff-panel${compact ? ' is-compact' : ''}`}>
      <span className={`operations-shift-note-badge tone-${tone}`}>
        {!compact ? (
          <span className="operations-shift-note-badge-icon" aria-hidden="true">
            {getOperationsLogTypeIcon(log.type)}
          </span>
        ) : null}
        {getOperationsLogTypeBadgeLabel(log.type)}
      </span>

      <p className="operations-shift-note-headline">{headline}</p>
      {detail ? <p className="operations-shift-note-detail">{detail}</p> : null}

      <p className="operations-shift-note-meta">
        {authorLabel} · {formatOperationsLogCardTime(log.createdAt)}
      </p>

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

function OperationsMobileCommunicationItem({ item, canManage, onEditLog, onDeleteLog }) {
  if (item.kind === 'announcement') {
    const announcement = item.data
    return (
      <article className="operations-mobile-comm-card is-announcement">
        <span className="operations-mobile-comm-badge">Announcement</span>
        <p className="operations-mobile-comm-title">{announcement.title}</p>
        <p className="operations-mobile-comm-body">
          {truncateAnnouncementMessage(announcement.message, 90)}
        </p>
      </article>
    )
  }

  return (
    <OperationsLogItem
      log={item.data}
      canManage={canManage}
      compact
      onEdit={onEditLog}
      onDelete={onDeleteLog}
    />
  )
}

export function OperationsDashboardView({
  tasks = [],
  countedTasks = null,
  logs = [],
  announcements = [],
  checklistTemplates = [],
  employees = [],
  departmentPerformance = [],
  todayKey = '',
  isLoading = false,
  noticeMessage = '',
  canManage = false,
  isSaving = false,
  isWorkspaceReady = false,
  workspaceSetupMessage = '',
  searchTerm = '',
  currentEmployeeId = null,
  role = '',
  employeeDepartment = '',
  isMobileLayout = false,
  onCreateTask,
  onUpdateTask,
  onCompleteTask,
  onCompleteWorkspaceTask,
  onReopenTask,
  onReopenWorkspaceTask,
  onDeleteTask,
  onDeleteWorkspaceTask,
  onEditWorkspaceTask,
  onCreateLog,
  onUpdateLog,
  onDeleteLog,
  onCreateAnnouncement,
  onUpdateAnnouncement,
  onHideAnnouncement,
  onPublishAnnouncement,
  canManageAnnouncements = false,
  onStartChecklist,
  onOpenChecklistRun,
  onOpenTaskSteps,
  focusTaskId = null,
  onFocusTaskHandled,
  boardOverdueCount = 0,
  onOpenTaskBoards,
}) {
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [completingTask, setCompletingTask] = useState(null)
  const [isLogFormOpen, setIsLogFormOpen] = useState(false)
  const [editingLog, setEditingLog] = useState(null)
  const [logTypeFilter, setLogTypeFilter] = useState('all')
  const [isStartChecklistOpen, setIsStartChecklistOpen] = useState(false)
  const [activeFocusTaskId, setActiveFocusTaskId] = useState(null)
  const focusHandledRef = useRef(false)

  const assigneeNameById = useMemo(() => (employeeId) => (
    resolveEmployeeName(employeeId, employees)
  ), [employees])

  const standaloneTasks = useMemo(
    () => filterTasksExcludingAnnouncementDuplicates(
      filterStandaloneOperationsTasks(tasks),
      announcements,
    ),
    [tasks, announcements],
  )

  const staffScopedStandaloneTasks = useMemo(() => {
    if (canManage) return standaloneTasks
    return standaloneTasks.filter((task) => canStaffCompleteTask(task, currentEmployeeId))
  }, [canManage, standaloneTasks, currentEmployeeId])

  const todayStandaloneTasks = useMemo(() => {
    const normalizedToday = normalizeOperationsTaskDate(todayKey)
    return staffScopedStandaloneTasks.filter(
      (task) => normalizeOperationsTaskDate(task.dueDate) === normalizedToday,
    )
  }, [staffScopedStandaloneTasks, todayKey])

  const summary = useMemo(
    () => buildOperationsDashboardSummary(staffScopedStandaloneTasks, logs, todayKey),
    [staffScopedStandaloneTasks, logs, todayKey],
  )

  const scopedCountedTasks = useMemo(() => {
    const source = countedTasks ?? staffScopedStandaloneTasks
    if (canManage) return source
    return source.filter((task) => canStaffCompleteTask(task, currentEmployeeId))
  }, [countedTasks, staffScopedStandaloneTasks, canManage, currentEmployeeId])

  const sharedWindow = useMemo(
    () => buildSharedTaskWindow(scopedCountedTasks, todayKey),
    [scopedCountedTasks, todayKey],
  )

  const taskSummary = countedTasks
    ? {
      ...summary,
      openTasks: sharedWindow.openCount,
      overdueTasks: sharedWindow.pastDueCount,
      completedToday: sharedWindow.completedToday,
    }
    : summary

  const checklistProgressRows = useMemo(
    () => buildChecklistProgressRows(checklistTemplates, tasks, todayKey)
      .filter((row) => !row.started),
    [checklistTemplates, tasks, todayKey],
  )

  const mobileMetrics = useMemo(() => ({
    openTasks: taskSummary.openTasks,
    overdueTasks: taskSummary.overdueTasks,
    issues: taskSummary.urgentIssues,
    notes: logs.length,
    checklists: checklistTemplates.filter((template) => template.active !== false).length,
  }), [taskSummary.openTasks, taskSummary.overdueTasks, taskSummary.urgentIssues, logs.length, checklistTemplates])

  const visibleTasks = useMemo(() => {
    const listSource = countedTasks ? sharedWindow.listTasks : todayStandaloneTasks
    const filtered = filterOperationsTasks(listSource, {
      searchTerm,
      assigneeNameById,
    })
    const sorted = sortOperationsTasks(filtered)
    const normalizedFocusTaskId = `${focusTaskId ?? ''}`.trim()
    if (!normalizedFocusTaskId) return sorted
    if (sorted.some((task) => `${task.id}` === normalizedFocusTaskId)) return sorted

    const focusPool = countedTasks ? scopedCountedTasks : staffScopedStandaloneTasks
    const focusedTask = focusPool.find(
      (task) => `${task.id}` === normalizedFocusTaskId,
    )
    if (!focusedTask) return sorted

    return sortOperationsTasks([...sorted, focusedTask])
  }, [countedTasks, sharedWindow.listTasks, todayStandaloneTasks, searchTerm, assigneeNameById, focusTaskId, staffScopedStandaloneTasks, scopedCountedTasks])

  const focusedTask = useMemo(() => {
    const normalizedFocusTaskId = `${focusTaskId ?? ''}`.trim()
    if (!normalizedFocusTaskId) return null
    const focusPool = countedTasks ? scopedCountedTasks : staffScopedStandaloneTasks
    return focusPool.find(
      (task) => `${task.id}` === normalizedFocusTaskId,
    ) ?? null
  }, [focusTaskId, countedTasks, scopedCountedTasks, staffScopedStandaloneTasks])

  useEffect(() => {
    focusHandledRef.current = false
    setActiveFocusTaskId(null)
  }, [focusTaskId])

  useEffect(() => {
    const normalizedFocusTaskId = `${focusTaskId ?? ''}`.trim()
    if (!normalizedFocusTaskId || isLoading || focusHandledRef.current) return undefined

    const focusPool = countedTasks ? scopedCountedTasks : staffScopedStandaloneTasks
    const focused = focusPool.find(
      (task) => `${task.id}` === normalizedFocusTaskId,
    )
    if (focused?.checklistRun) {
      focusHandledRef.current = true
      onOpenChecklistRun?.(focused.checklistTemplateId)
      onFocusTaskHandled?.()
      return undefined
    }
    const taskExists = Boolean(focused)
    if (!taskExists) {
      focusHandledRef.current = true
      onFocusTaskHandled?.()
      return undefined
    }

    let clearFocusTimer = null
    const frameId = window.requestAnimationFrame(() => {
      const taskNode = document.querySelector(`[data-operations-task-id="${normalizedFocusTaskId}"]`)
      if (!taskNode) return

      taskNode.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setActiveFocusTaskId(normalizedFocusTaskId)
      focusHandledRef.current = true

      clearFocusTimer = window.setTimeout(() => {
        setActiveFocusTaskId(null)
        onFocusTaskHandled?.()
      }, 2200)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
      if (clearFocusTimer) window.clearTimeout(clearFocusTimer)
    }
  }, [
    focusTaskId,
    isLoading,
    countedTasks,
    scopedCountedTasks,
    staffScopedStandaloneTasks,
    visibleTasks,
    onFocusTaskHandled,
    onOpenChecklistRun,
  ])

  const visibleLogs = useMemo(() => {
    return filterOperationsLogs(logs, { searchTerm, typeFilter: logTypeFilter })
  }, [logs, searchTerm, logTypeFilter])

  const mobileCommunicationItems = useMemo(() => {
    const visibleAnnouncements = filterAnnouncementsForUser(announcements, {
      role,
      employeeDepartment,
      includeInactive: canManageAnnouncements,
    })

    const announcementItems = visibleAnnouncements.map((announcement) => ({
      kind: 'announcement',
      data: announcement,
      createdAt: announcement.createdAt ?? announcement.updatedAt ?? '',
    }))

    const logItems = (logs ?? []).map((log) => ({
      kind: 'log',
      data: log,
      createdAt: log.createdAt ?? '',
    }))

    return [...announcementItems, ...logItems]
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
      .slice(0, MOBILE_COMMUNICATION_LIMIT)
  }, [announcements, logs, role, employeeDepartment, canManageAnnouncements])

  const handleEditTask = (task) => {
    if (task?.checklistRun) {
      onOpenChecklistRun?.(task.checklistTemplateId)
      return
    }
    if (task?.taskSource === 'workspace') {
      onEditWorkspaceTask?.(task)
      return
    }
    setEditingTask(task)
    setIsTaskFormOpen(true)
  }

  const handleDeleteTask = (task) => {
    if (task?.taskSource === 'workspace') {
      onDeleteWorkspaceTask?.(task)
      return
    }
    onDeleteTask?.(task)
  }

  const handleToggleComplete = (task) => {
    if (task?.checklistRun) {
      onOpenChecklistRun?.(task.checklistTemplateId)
      return
    }
    if ((task?.checklistSteps?.length ?? 0) > 0 && onOpenTaskSteps) {
      onOpenTaskSteps(task.id)
      return
    }
    const isWorkspaceTask = task?.taskSource === 'workspace'
    const isDone = isWorkspaceTask
      ? `${task?.status ?? ''}`.trim().toLowerCase() === 'completed'
      : normalizeOperationsStatus(task.status) !== 'pending'

    if (isDone) {
      if (isWorkspaceTask) onReopenWorkspaceTask?.(task)
      else onReopenTask?.(task)
      return
    }

    if (canManage) {
      if (isWorkspaceTask) onCompleteWorkspaceTask?.(task)
      else onCompleteTask?.(task, { completionNote: '' })
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

  const openCreateTask = () => {
    setEditingTask(null)
    setIsTaskFormOpen(true)
  }

  const openCreateLog = () => {
    setEditingLog(null)
    setIsLogFormOpen(true)
  }

  if (isMobileLayout) {
    return (
      <section className="operations-dashboard-page is-mobile-layout" aria-label="Operational control">
        {noticeMessage ? <div className="staff-status-banner">{noticeMessage}</div> : null}
        {!isWorkspaceReady && workspaceSetupMessage ? (
          <div className="staff-status-banner">{workspaceSetupMessage}</div>
        ) : null}
        {isLoading ? <div className="staff-status-banner">Loading operations…</div> : null}

        <header className="operations-mobile-command-header">
          <h3 className="operations-mobile-command-title">Operational control</h3>
        </header>

        <div className="operations-summary-grid operations-mobile-metrics" aria-label="Operations metrics">
          <OperationsSummaryCard label="Open tasks" value={mobileMetrics.openTasks} tone="warning" />
          <OperationsSummaryCard
            label="Past due"
            value={mobileMetrics.overdueTasks}
            tone={mobileMetrics.overdueTasks > 0 ? 'danger' : 'default'}
          />
          <OperationsSummaryCard label="Issues" value={mobileMetrics.issues} tone="danger" />
          <OperationsSummaryCard label="Notes" value={mobileMetrics.notes} tone="gold" />
          <OperationsSummaryCard label="Checklists" value={mobileMetrics.checklists} />
        </div>

        {canManage ? (
          <div className="operations-mobile-actions" aria-label="Operations actions">
            <button
              type="button"
              className="primary-btn operations-mobile-action"
              onClick={openCreateTask}
              disabled={!isWorkspaceReady || isSaving}
            >
              Create task
            </button>
            <button
              type="button"
              className="ghost-btn operations-mobile-action"
              onClick={openCreateLog}
              disabled={!isWorkspaceReady || isSaving}
            >
              Add note
            </button>
            <button
              type="button"
              className="ghost-btn operations-mobile-action"
              onClick={() => setIsStartChecklistOpen(true)}
              disabled={!isWorkspaceReady || isSaving}
            >
              Start checklist
            </button>
          </div>
        ) : null}

        {focusedTask ? (
          <section className="operations-mobile-section" aria-label="Focused task">
            <header className="operations-mobile-section-header">
              <h4>Task</h4>
            </header>
            <ul className="operations-task-list">
              <OperationsTaskRow
                task={focusedTask}
                assigneeName={assigneeNameById(getTaskAssigneeId(focusedTask))}
                canManage={canManage}
                canComplete={canManage || canStaffCompleteTask(focusedTask, currentEmployeeId)}
                isFocused={`${activeFocusTaskId ?? ''}` === `${focusedTask.id}`}
                onToggleComplete={handleToggleComplete}
                onEdit={handleEditTask}
                onDelete={handleDeleteTask}
              />
            </ul>
          </section>
        ) : null}

        <section className="operations-mobile-section" aria-label="Team communication">
          <header className="operations-mobile-section-header">
            <h4>Team communication</h4>
          </header>
          {mobileCommunicationItems.length === 0 && !isLoading ? (
            <p className="operations-mobile-inline-empty">No announcements or notes yet</p>
          ) : (
            <div className="operations-mobile-comm-list">
              {mobileCommunicationItems.map((item) => (
                <OperationsMobileCommunicationItem
                  key={`${item.kind}-${item.data.id}`}
                  item={item}
                  canManage={canManage}
                  onEditLog={(logItem) => {
                    setEditingLog(logItem)
                    setIsLogFormOpen(true)
                  }}
                  onDeleteLog={onDeleteLog}
                />
              ))}
            </div>
          )}
        </section>

        <section className="operations-mobile-section" aria-label="Department overview">
          <DepartmentPerformanceSummary
            summaries={departmentPerformance}
            compact
            title="Department overview"
          />
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
              onClick={openCreateLog}
              disabled={!isWorkspaceReady || isSaving}
            >
              Add note
            </button>
            <button
              type="button"
              className="primary-btn operations-dashboard-action"
              onClick={openCreateTask}
              disabled={!isWorkspaceReady || isSaving}
            >
              Create task
            </button>
          </div>
        ) : null}
      </div>

      <div className="operations-summary-grid" aria-label="Today at a glance">
        <OperationsSummaryCard label="Open tasks" value={taskSummary.openTasks} tone="warning" />
        <OperationsSummaryCard
          label="Past due"
          value={taskSummary.overdueTasks}
          tone={taskSummary.overdueTasks > 0 ? 'danger' : 'default'}
        />
        <OperationsSummaryCard label="Completed today" value={taskSummary.completedToday} tone="success" />
        <OperationsSummaryCard label="Urgent issues" value={summary.urgentIssues} tone="danger" />
        <OperationsSummaryCard label="Team notes" value={summary.teamNotes} tone="gold" />
        <OperationsSummaryCard
          label="Board tasks overdue"
          value={boardOverdueCount}
          tone={boardOverdueCount > 0 ? 'danger' : 'default'}
        />
      </div>
      {onOpenTaskBoards ? (
        <div className="operations-dashboard-actions">
          <button
            type="button"
            className="ghost-btn operations-dashboard-action"
            onClick={onOpenTaskBoards}
          >
            Open task boards{boardOverdueCount > 0 ? ` · ${boardOverdueCount} overdue` : ''}
          </button>
        </div>
      ) : null}

      <div className="operations-dashboard-sections">
      <OperationsAnnouncementsSection
        announcements={announcements}
        canManageAnnouncements={canManageAnnouncements}
        isSaving={isSaving}
        isLoading={isLoading}
        role={role}
        employeeDepartment={employeeDepartment}
        onCreate={onCreateAnnouncement}
        onUpdate={onUpdateAnnouncement}
        onHide={onHideAnnouncement}
        onPublish={onPublishAnnouncement}
      />

      {checklistProgressRows.length > 0 ? (
        <section className="operations-section panel staff-panel" aria-label="Checklist progress">
          <header className="operations-section-header">
            <div>
              <p className="eyebrow">Checklists</p>
              <h3>Start a checklist</h3>
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

      <section className="operations-section panel staff-panel" aria-label="Open tasks">
        <header className="operations-section-header">
          <div>
            <p className="eyebrow">Tasks</p>
            <h3>Open tasks</h3>
          </div>
          <p className="operations-section-count">{visibleTasks.length} task{visibleTasks.length === 1 ? '' : 's'}</p>
        </header>

        {visibleTasks.length === 0 && !isLoading ? (
          <div className="operations-empty-state">
            <h4>No open tasks</h4>
            <p>{canManage ? 'Create a task to get the team started.' : 'Check back when tasks are assigned.'}</p>
          </div>
        ) : (
          <ul className="operations-task-list">
            {visibleTasks.map((task) => (
              <OperationsTaskRow
                key={task.id}
                task={task}
                assigneeName={assigneeNameById(getTaskAssigneeId(task))}
                canManage={canManage}
                canComplete={canManage || canStaffCompleteTask(task, currentEmployeeId)}
                isFocused={`${activeFocusTaskId ?? ''}` === `${task.id}`}
                onToggleComplete={handleToggleComplete}
                onEdit={handleEditTask}
                onDelete={handleDeleteTask}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="operations-section panel staff-panel" aria-label="Shift Notes">
        <header className="operations-section-header">
          <div>
            <p className="eyebrow">Shift Notes</p>
            <h3>Team communication</h3>
          </div>
        </header>

        <div className="operations-log-filters" role="tablist" aria-label="Note types">
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
            <h4>No notes yet</h4>
            <p>Leave updates for the next shift.</p>
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
      </div>

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
