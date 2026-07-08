import { useEffect, useMemo, useState } from 'react'
import { buildCustomDepartmentBoardKey, loadCustomDepartmentIcons, persistCustomDepartmentIcons, TASK_PRESET_DEPARTMENTS, UNASSIGNED_CUSTOM_DEPARTMENT_NAME } from '../../lib/taskDepartments'
import { canStaffCompleteTask } from '../../lib/operationsUtils'
import {
  buildTaskAlerts,
  buildVisibleDepartmentBoards,
  calculateDepartmentPerformanceSummaries,
  calculateTaskOverview,
  collectCustomDepartmentNames,
  filterTasksByAssignment,
} from '../../lib/taskUtils'
import CreateDepartmentModal from './CreateDepartmentModal'
import DeleteDepartmentModal from './DeleteDepartmentModal'
import DepartmentBoardView from './DepartmentBoardView'
import TaskFormModal from './TaskFormModal'
import TaskTemplateModal from './TaskTemplateModal'
import TaskTemplatesView from './TaskTemplatesView'
import TasksAssignmentFilter from './TasksAssignmentFilter'
import TasksHomeView from './TasksHomeView'

export default function TasksView({
  tasks = [],
  taskTemplates = [],
  templateChecklistItemsByTemplateId = {},
  checklistItemsByTaskId = {},
  employees = [],
  isLoading = false,
  isTemplatesLoading = false,
  isSaving = false,
  isSavingTemplate = false,
  isGeneratingTasks = false,
  errorMessage = '',
  templatesErrorMessage = '',
  noticeMessage = '',
  templatesNoticeMessage = '',
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onCompleteTask,
  onReopenTask,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onGenerateToday,
  onToggleChecklistItem,
  onDeleteCustomDepartment,
  currentEmployeeId = null,
  currentEmployeeName = '',
  todayKey,
  openCreateOnMount = false,
  onOpenCreateHandled,
  isMobileLayout = false,
  canManage = false,
}) {
  const CUSTOM_DEPARTMENTS_STORAGE_KEY = 'amore-task-custom-departments'

  const [tasksScreen, setTasksScreen] = useState('boards')
  const [selectedDepartmentKey, setSelectedDepartmentKey] = useState(null)
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [isCreateDepartmentModalOpen, setIsCreateDepartmentModalOpen] = useState(false)
  const [departmentPendingDelete, setDepartmentPendingDelete] = useState(null)
  const [isDeletingDepartment, setIsDeletingDepartment] = useState(false)
  const [savedCustomDepartments, setSavedCustomDepartments] = useState(() => {
    try {
      const stored = window.localStorage.getItem(CUSTOM_DEPARTMENTS_STORAGE_KEY)
      const parsed = stored ? JSON.parse(stored) : []
      return Array.isArray(parsed) ? parsed.filter(Boolean) : []
    } catch {
      return []
    }
  })
  const [customDepartmentIcons, setCustomDepartmentIcons] = useState(() => loadCustomDepartmentIcons())
  const [editingTask, setEditingTask] = useState(null)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [formError, setFormError] = useState('')
  const [templateFormError, setTemplateFormError] = useState('')
  const [assignmentFilter, setAssignmentFilter] = useState('all')

  const filteredTasks = useMemo(
    () => filterTasksByAssignment(tasks, {
      mode: assignmentFilter,
      currentEmployeeId,
    }),
    [tasks, assignmentFilter, currentEmployeeId],
  )

  const taskAlerts = useMemo(
    () => buildTaskAlerts(filteredTasks, todayKey),
    [filteredTasks, todayKey],
  )

  const taskOverview = useMemo(
    () => calculateTaskOverview(filteredTasks, todayKey),
    [filteredTasks, todayKey],
  )

  const departmentPerformance = useMemo(
    () => calculateDepartmentPerformanceSummaries(filteredTasks, todayKey, customDepartmentIcons),
    [filteredTasks, todayKey, customDepartmentIcons],
  )

  const hasCurrentEmployee = Boolean(currentEmployeeId)

  const customDepartments = useMemo(() => {
    const merged = new Set([
      ...savedCustomDepartments,
      ...collectCustomDepartmentNames(tasks, taskTemplates),
    ])
    return Array.from(merged).sort((left, right) => left.localeCompare(right))
  }, [savedCustomDepartments, tasks, taskTemplates])

  const departmentBoards = useMemo(
    () => buildVisibleDepartmentBoards(
      tasks,
      taskTemplates,
      savedCustomDepartments,
      customDepartmentIcons,
    ),
    [tasks, taskTemplates, savedCustomDepartments, customDepartmentIcons],
  )

  const persistCustomDepartments = (names) => {
    setSavedCustomDepartments(names)
    try {
      window.localStorage.setItem(CUSTOM_DEPARTMENTS_STORAGE_KEY, JSON.stringify(names))
    } catch {
      // Ignore storage failures in private browsing.
    }
  }

  const saveCustomDepartmentIcon = (departmentName, icon) => {
    setCustomDepartmentIcons((current) => {
      const next = {
        ...current,
        [departmentName]: icon,
      }
      persistCustomDepartmentIcons(next)
      return next
    })
  }

  const handleCreateDepartment = ({ name, icon }) => {
    const trimmed = `${name ?? ''}`.trim()
    if (!trimmed) return

    const nextNames = Array.from(new Set([...savedCustomDepartments, trimmed]))
      .sort((left, right) => left.localeCompare(right))
    persistCustomDepartments(nextNames)
    saveCustomDepartmentIcon(trimmed, icon)
    setIsCreateDepartmentModalOpen(false)
    setSelectedDepartmentKey(buildCustomDepartmentBoardKey(trimmed))
  }

  const handleOpenCreateDepartment = () => {
    setIsCreateDepartmentModalOpen(true)
  }

  const removeCustomDepartmentLocal = (departmentName) => {
    const trimmed = `${departmentName ?? ''}`.trim()
    if (!trimmed) return

    setSavedCustomDepartments((current) => {
      const next = current.filter((name) => name !== trimmed)
      try {
        window.localStorage.setItem(CUSTOM_DEPARTMENTS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Ignore storage failures in private browsing.
      }
      return next
    })

    setCustomDepartmentIcons((current) => {
      const next = { ...current }
      delete next[trimmed]
      persistCustomDepartmentIcons(next)
      return next
    })
  }

  const handleRequestDeleteDepartment = (board) => {
    if (!board?.isCustomBoard || !board?.label) return
    setDepartmentPendingDelete(board)
  }

  const handleCloseDeleteDepartmentModal = () => {
    if (isDeletingDepartment) return
    setDepartmentPendingDelete(null)
  }

  const handleConfirmDeleteDepartment = async () => {
    if (!departmentPendingDelete?.label) return

    const departmentName = departmentPendingDelete.label
    const deletedBoardKey = departmentPendingDelete.boardKey

    setIsDeletingDepartment(true)

    try {
      await onDeleteCustomDepartment?.(departmentName)
      removeCustomDepartmentLocal(departmentName)

      if (selectedDepartmentKey === deletedBoardKey) {
        setSelectedDepartmentKey(null)
      }

      setDepartmentPendingDelete(null)
    } catch {
      // Parent surfaces the error notice.
    } finally {
      setIsDeletingDepartment(false)
    }
  }

  useEffect(() => {
    if (!openCreateOnMount || !canManage) return
    setEditingTask(null)
    setFormError('')
    setIsTaskModalOpen(true)
    onOpenCreateHandled?.()
  }, [openCreateOnMount, onOpenCreateHandled, canManage])

  const handleSelectDepartment = (departmentKey) => {
    setSelectedDepartmentKey(departmentKey)
  }

  const handleBackToHome = () => {
    setSelectedDepartmentKey(null)
  }

  const handleOpenNewTask = () => {
    setEditingTask(null)
    setFormError('')
    setIsTaskModalOpen(true)
  }

  const handleOpenEditTask = (task) => {
    setEditingTask(task)
    setFormError('')
    setIsTaskModalOpen(true)
  }

  const handleCloseTaskModal = () => {
    if (isSaving) return
    setIsTaskModalOpen(false)
    setEditingTask(null)
    setFormError('')
  }

  const handleSubmitTask = async (formValues) => {
    setFormError('')

    try {
      if (editingTask?.id) {
        await onUpdateTask?.(editingTask.id, formValues)
      } else {
        await onCreateTask?.(formValues)
      }

      setIsTaskModalOpen(false)
      setEditingTask(null)
    } catch (error) {
      setFormError(error?.message || 'Unable to save task right now.')
    }
  }

  const handleCompleteTask = async (task) => {
    if (!task?.id) return
    if (!canManage && !canStaffCompleteTask(task, currentEmployeeId)) return
    await onCompleteTask?.(task.id)
  }

  const handleReopenTask = async (task) => {
    if (!task?.id || !canManage) return
    await onReopenTask?.(task.id)
  }

  const handleDeleteTask = async (task) => {
    if (!task?.id || !canManage) return

    const confirmed = window.confirm(`Delete "${task.title || 'this task'}"?`)
    if (!confirmed) return

    await onDeleteTask?.(task.id)
  }

  const handleOpenTemplates = () => {
    setSelectedDepartmentKey(null)
    setTasksScreen('templates')
  }

  const handleBackToBoards = () => {
    setTasksScreen('boards')
  }

  const handleOpenNewTemplate = () => {
    setEditingTemplate(null)
    setTemplateFormError('')
    setIsTemplateModalOpen(true)
  }

  const handleOpenEditTemplate = (template) => {
    setEditingTemplate(template)
    setTemplateFormError('')
    setIsTemplateModalOpen(true)
  }

  const handleCloseTemplateModal = () => {
    if (isSavingTemplate) return
    setIsTemplateModalOpen(false)
    setEditingTemplate(null)
    setTemplateFormError('')
  }

  const handleSubmitTemplate = async (formValues) => {
    setTemplateFormError('')

    try {
      if (editingTemplate?.id) {
        await onUpdateTemplate?.(editingTemplate.id, formValues)
      } else {
        await onCreateTemplate?.(formValues)
      }

      setIsTemplateModalOpen(false)
      setEditingTemplate(null)
    } catch (error) {
      setTemplateFormError(error?.message || 'Unable to save template right now.')
    }
  }

  const handleDeleteTemplate = async (template) => {
    if (!template?.id) return

    const confirmed = window.confirm(`Delete "${template.title || 'this template'}"?`)
    if (!confirmed) return

    await onDeleteTemplate?.(template.id)
  }

  const tableUnavailable = `${errorMessage}`.toLowerCase().includes('not ready yet')

  return (
    <section className={`staff-page tasks-page${isMobileLayout ? ' is-mobile-layout' : ''}`}>
      <div className="tasks-page-header">
        <div>
          <p className="eyebrow">Tasks</p>
          <h3>{tasksScreen === 'templates' ? 'Daily templates' : 'Operations'}</h3>
          {!isMobileLayout ? (
            <p className="staff-subtitle">
              {tasksScreen === 'templates'
                ? 'Build reusable opening, closing, and department routines.'
                : 'Track daily work by department with clear ownership and due dates.'}
            </p>
          ) : null}
        </div>
        {tasksScreen === 'boards' && !selectedDepartmentKey && !isMobileLayout && canManage ? (
          <button type="button" className="ghost-btn tasks-templates-nav-btn" onClick={handleOpenTemplates}>
            Daily Templates
          </button>
        ) : null}
      </div>

      {isMobileLayout && tasksScreen === 'boards' && !selectedDepartmentKey ? (
        <section className="tasks-mobile-command-metrics" aria-label="Today task metrics">
          <p className="tasks-mobile-metrics-label">Today</p>
          <div className="tasks-mobile-metrics-grid">
            <article className="tasks-mobile-metric">
              <strong>{taskOverview.active}</strong>
              <span>Active tasks</span>
            </article>
            <article className={`tasks-mobile-metric${taskOverview.overdue > 0 ? ' is-alert' : ''}`}>
              <strong>{taskOverview.overdue}</strong>
              <span>Overdue</span>
            </article>
            <article className="tasks-mobile-metric">
              <strong>{taskOverview.completionPercent}%</strong>
              <span>Completed</span>
            </article>
          </div>
        </section>
      ) : null}

      {tasksScreen === 'boards' && errorMessage ? (
        <div className={`staff-status-banner${tableUnavailable ? ' tasks-status-unavailable' : ''}`}>
          {errorMessage}
        </div>
      ) : null}

      {tasksScreen === 'boards' && noticeMessage ? (
        <div className="staff-status-banner tasks-status-notice">{noticeMessage}</div>
      ) : null}

      {tasksScreen === 'boards' && !selectedDepartmentKey ? (
        <TasksAssignmentFilter
          value={assignmentFilter}
          onChange={setAssignmentFilter}
          currentEmployeeName={currentEmployeeName}
          hasCurrentEmployee={hasCurrentEmployee}
        />
      ) : null}

      {tasksScreen === 'templates' && canManage ? (
        <TaskTemplatesView
          templates={taskTemplates}
          templateChecklistItemsByTemplateId={templateChecklistItemsByTemplateId}
          customDepartmentIcons={customDepartmentIcons}
          isLoading={isTemplatesLoading}
          isSaving={isSavingTemplate}
          isGenerating={isGeneratingTasks}
          errorMessage={templatesErrorMessage}
          noticeMessage={templatesNoticeMessage}
          onBack={handleBackToBoards}
          onOpenNewTemplate={handleOpenNewTemplate}
          onEditTemplate={handleOpenEditTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          onGenerateToday={onGenerateToday}
        />
      ) : selectedDepartmentKey ? (
        <DepartmentBoardView
          departmentKey={selectedDepartmentKey}
          tasks={filteredTasks}
          customDepartmentIcons={customDepartmentIcons}
          checklistItemsByTaskId={checklistItemsByTaskId}
          employees={employees}
          onBack={handleBackToHome}
          onNewTask={handleOpenNewTask}
          onCompleteTask={handleCompleteTask}
          onReopenTask={handleReopenTask}
          onEditTask={handleOpenEditTask}
          onDeleteTask={handleDeleteTask}
          onToggleChecklistItem={canManage ? onToggleChecklistItem : (itemId, isCompleted) => {
            const parentTask = filteredTasks.find((task) => (
              (checklistItemsByTaskId[String(task.id)] ?? []).some((item) => `${item.id}` === `${itemId}`)
            ))
            if (!parentTask || !canStaffCompleteTask(parentTask, currentEmployeeId)) return
            return onToggleChecklistItem?.(itemId, isCompleted)
          }}
          isSaving={isSaving}
          isLoading={isLoading}
          canManage={canManage}
          currentEmployeeId={currentEmployeeId}
        />
      ) : (
        <TasksHomeView
          tasks={filteredTasks}
          departmentBoards={departmentBoards}
          taskAlerts={taskAlerts}
          departmentPerformance={departmentPerformance}
          employees={employees}
          onSelectDepartment={handleSelectDepartment}
          onCreateDepartment={handleOpenCreateDepartment}
          onDeleteDepartment={handleRequestDeleteDepartment}
          isDeletingDepartment={isDeletingDepartment}
          isLoading={isLoading}
          todayKey={todayKey}
          isMobileLayout={isMobileLayout}
          onOpenTemplates={handleOpenTemplates}
          templateCount={taskTemplates.length}
          canManage={canManage}
        />
      )}

      {canManage && isTaskModalOpen ? (
        <TaskFormModal
          isOpen={isTaskModalOpen}
          editingTask={editingTask}
          defaultDepartment={selectedDepartmentKey ?? 'service'}
          customDepartments={customDepartments}
          customDepartmentIcons={customDepartmentIcons}
          employees={employees}
          onClose={handleCloseTaskModal}
          onSubmit={handleSubmitTask}
          isSaving={isSaving}
          errorMessage={formError}
        />
      ) : null}

      {canManage && isTemplateModalOpen ? (
        <TaskTemplateModal
          isOpen={isTemplateModalOpen}
          editingTemplate={editingTemplate}
          customDepartments={customDepartments}
          customDepartmentIcons={customDepartmentIcons}
          initialChecklistItems={
            editingTemplate?.id
              ? (templateChecklistItemsByTemplateId[String(editingTemplate.id)] ?? [])
              : []
          }
          onClose={handleCloseTemplateModal}
          onSubmit={handleSubmitTemplate}
          isSaving={isSavingTemplate}
          errorMessage={templateFormError}
        />
      ) : null}

      {canManage ? (
        <>
          <CreateDepartmentModal
            isOpen={isCreateDepartmentModalOpen}
            onClose={() => setIsCreateDepartmentModalOpen(false)}
            onSubmit={handleCreateDepartment}
            existingNames={[
              ...customDepartments,
              UNASSIGNED_CUSTOM_DEPARTMENT_NAME,
              ...TASK_PRESET_DEPARTMENTS.map((department) => department.label),
            ]}
          />

          <DeleteDepartmentModal
            isOpen={Boolean(departmentPendingDelete)}
            departmentName={departmentPendingDelete?.label ?? ''}
            onClose={handleCloseDeleteDepartmentModal}
            onConfirm={handleConfirmDeleteDepartment}
            isDeleting={isDeletingDepartment}
          />
        </>
      ) : null}
    </section>
  )
}
