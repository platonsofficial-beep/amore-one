import { useState } from 'react'
import DepartmentBoardView from './DepartmentBoardView'
import TaskFormModal from './TaskFormModal'
import TasksHomeView from './TasksHomeView'

export default function TasksView({
  tasks = [],
  employees = [],
  isLoading = false,
  isSaving = false,
  errorMessage = '',
  noticeMessage = '',
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onCompleteTask,
  onReopenTask,
}) {
  const [selectedDepartmentKey, setSelectedDepartmentKey] = useState(null)
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [formError, setFormError] = useState('')

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

  const tableUnavailable = `${errorMessage}`.toLowerCase().includes('not ready yet')

  return (
    <section className="staff-page tasks-page">
      <div className="tasks-page-header">
        <div>
          <p className="eyebrow">Tasks</p>
          <h3>Department operations</h3>
          <p className="staff-subtitle">Track daily work by department with clear ownership and due dates.</p>
        </div>
      </div>

      {errorMessage ? (
        <div className={`staff-status-banner${tableUnavailable ? ' tasks-status-unavailable' : ''}`}>
          {errorMessage}
        </div>
      ) : null}

      {noticeMessage ? <div className="staff-status-banner tasks-status-notice">{noticeMessage}</div> : null}

      {selectedDepartmentKey ? (
        <DepartmentBoardView
          departmentKey={selectedDepartmentKey}
          tasks={tasks}
          employees={employees}
          onBack={handleBackToHome}
          onNewTask={handleOpenNewTask}
          onCompleteTask={handleCompleteTask}
          onReopenTask={handleReopenTask}
          onEditTask={handleOpenEditTask}
          onDeleteTask={handleDeleteTask}
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
    </section>
  )
}
