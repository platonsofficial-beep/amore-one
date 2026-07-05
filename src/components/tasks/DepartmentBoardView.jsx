import { getTaskDepartmentByKey } from '../../lib/taskDepartments'
import { groupTasksBySection } from '../../lib/taskUtils'
import TaskCard from './TaskCard'

function TaskSection({
  title,
  tasks,
  checklistItemsByTaskId = {},
  emptyMessage,
  resolveAssigneeName,
  onComplete,
  onReopen,
  onEdit,
  onDelete,
  onToggleChecklistItem,
  isSaving,
}) {
  return (
    <section className="tasks-board-section">
      <header className="tasks-board-section-header">
        <h4 className="tasks-board-section-title">{title}</h4>
        <span className="tasks-board-section-count">{tasks.length}</span>
      </header>

      {tasks.length === 0 ? (
        <div className="tasks-board-empty">{emptyMessage}</div>
      ) : (
        <div className="tasks-board-list">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              assigneeName={resolveAssigneeName(task)}
              checklistItems={checklistItemsByTaskId[String(task.id)] ?? []}
              onComplete={onComplete}
              onReopen={onReopen}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleChecklistItem={onToggleChecklistItem}
              isSaving={isSaving}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default function DepartmentBoardView({
  departmentKey,
  tasks = [],
  checklistItemsByTaskId = {},
  employees = [],
  onBack,
  onNewTask,
  onCompleteTask,
  onReopenTask,
  onEditTask,
  onDeleteTask,
  onToggleChecklistItem,
  isSaving = false,
  isLoading = false,
}) {
  const department = getTaskDepartmentByKey(departmentKey)
  const departmentTasks = tasks.filter((task) => `${task.department ?? ''}`.trim().toLowerCase() === departmentKey)
  const sections = groupTasksBySection(departmentTasks)

  const employeeNameById = new Map(
    employees.map((employee) => [
      String(employee.id),
      employee.full_name || employee.name || `Employee ${employee.id}`,
    ]),
  )

  const resolveAssigneeName = (task) => {
    const employeeId = task?.assignedEmployeeId
    if (!employeeId) return ''
    return employeeNameById.get(String(employeeId)) ?? 'Unknown employee'
  }

  return (
    <section className="tasks-board">
      <header className="tasks-board-header">
        <button type="button" className="ghost-btn tasks-back-btn" onClick={onBack}>
          ← Back
        </button>
        <div className="tasks-board-header-row">
          <div className="tasks-board-title-block">
            <span className="tasks-board-icon" aria-hidden="true">{department?.icon ?? '📋'}</span>
            <h3>{department?.label ?? 'Department'}</h3>
          </div>
          <button type="button" className="primary-btn tasks-new-btn" onClick={onNewTask} disabled={isSaving}>
            + New Task
          </button>
        </div>
      </header>

      {isLoading ? <div className="staff-status-banner">Loading tasks…</div> : null}

      <div className="tasks-board-sections">
        <TaskSection
          title="Today"
          tasks={sections.today}
          checklistItemsByTaskId={checklistItemsByTaskId}
          emptyMessage="No tasks due today for this department."
          resolveAssigneeName={resolveAssigneeName}
          onComplete={onCompleteTask}
          onReopen={onReopenTask}
          onEdit={onEditTask}
          onDelete={onDeleteTask}
          onToggleChecklistItem={onToggleChecklistItem}
          isSaving={isSaving}
        />
        <TaskSection
          title="Upcoming"
          tasks={sections.upcoming}
          checklistItemsByTaskId={checklistItemsByTaskId}
          emptyMessage="No upcoming tasks scheduled for this department."
          resolveAssigneeName={resolveAssigneeName}
          onComplete={onCompleteTask}
          onReopen={onReopenTask}
          onEdit={onEditTask}
          onDelete={onDeleteTask}
          onToggleChecklistItem={onToggleChecklistItem}
          isSaving={isSaving}
        />
        <TaskSection
          title="Completed"
          tasks={sections.completed}
          checklistItemsByTaskId={checklistItemsByTaskId}
          emptyMessage="No completed tasks yet for this department."
          resolveAssigneeName={resolveAssigneeName}
          onComplete={onCompleteTask}
          onReopen={onReopenTask}
          onEdit={onEditTask}
          onDelete={onDeleteTask}
          onToggleChecklistItem={onToggleChecklistItem}
          isSaving={isSaving}
        />
      </div>
    </section>
  )
}
