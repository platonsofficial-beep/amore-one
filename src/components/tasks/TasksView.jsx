import { useEffect, useState } from 'react'
import DepartmentBoardView from './DepartmentBoardView'
import TaskFormModal from './TaskFormModal'
import TaskTemplateModal from './TaskTemplateModal'
import TaskTemplatesView from './TaskTemplatesView'
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
  openCreateOnMount = false,
  onOpenCreateHandled,
}) {
  const [tasksScreen, setTasksScreen] = useState('boards')
  const [selectedDepartmentKey, setSelectedDepartmentKey] = useState(null)
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [formError, setFormError] = useState('')
  const [templateFormError, setTemplateFormError] = useState('')

  useEffect(() => {
    if (!openCreateOnMount) return
    setEditingTask(null)
    setFormError('')
    setIsTaskModalOpen(true)
    onOpenCreateHandled?.()
  }, [openCreateOnMount, onOpenCreateHandled])

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
    await onCompleteTask?.(task.id)
  }

  const handleReopenTask = async (task) => {
    if (!task?.id) return
    await onReopenTask?.(task.id)
  }

  const handleDeleteTask = async (task) => {
    if (!task?.id) return

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
    <section className="staff-page tasks-page">
      <div className="tasks-page-header">
        <div>
          <p className="eyebrow">Tasks</p>
          <h3>{tasksScreen === 'templates' ? 'Daily templates' : 'Department operations'}</h3>
          <p className="staff-subtitle">
            {tasksScreen === 'templates'
              ? 'Build reusable opening, closing, and department routines.'
              : 'Track daily work by department with clear ownership and due dates.'}
          </p>
        </div>
        {tasksScreen === 'boards' && !selectedDepartmentKey ? (
          <button type="button" className="ghost-btn tasks-templates-nav-btn" onClick={handleOpenTemplates}>
            Daily Templates
          </button>
        ) : null}
      </div>

      {tasksScreen === 'boards' && errorMessage ? (
        <div className={`staff-status-banner${tableUnavailable ? ' tasks-status-unavailable' : ''}`}>
          {errorMessage}
        </div>
      ) : null}

      {tasksScreen === 'boards' && noticeMessage ? (
        <div className="staff-status-banner tasks-status-notice">{noticeMessage}</div>
      ) : null}

      {tasksScreen === 'templates' ? (
        <TaskTemplatesView
          templates={taskTemplates}
          templateChecklistItemsByTemplateId={templateChecklistItemsByTemplateId}
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
          tasks={tasks}
          checklistItemsByTaskId={checklistItemsByTaskId}
          employees={employees}
          onBack={handleBackToHome}
          onNewTask={handleOpenNewTask}
          onCompleteTask={handleCompleteTask}
          onReopenTask={handleReopenTask}
          onEditTask={handleOpenEditTask}
          onDeleteTask={handleDeleteTask}
          onToggleChecklistItem={onToggleChecklistItem}
          isSaving={isSaving}
          isLoading={isLoading}
        />
      ) : (
        <TasksHomeView
          tasks={tasks}
          onSelectDepartment={handleSelectDepartment}
          isLoading={isLoading}
        />
      )}

      <TaskFormModal
        isOpen={isTaskModalOpen}
        editingTask={editingTask}
        defaultDepartment={selectedDepartmentKey ?? 'service'}
        employees={employees}
        onClose={handleCloseTaskModal}
        onSubmit={handleSubmitTask}
        isSaving={isSaving}
        errorMessage={formError}
      />

      <TaskTemplateModal
        isOpen={isTemplateModalOpen}
        editingTemplate={editingTemplate}
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
    </section>
  )
}
