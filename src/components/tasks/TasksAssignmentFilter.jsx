export default function TasksAssignmentFilter({
  value = 'all',
  onChange,
  currentEmployeeName = '',
  hasCurrentEmployee = false,
}) {
  return (
    <div className="tasks-assignment-filter">
      <span className="tasks-assignment-filter-label">View</span>
      <div className="tasks-assignment-filter-options" role="tablist" aria-label="Task assignment filter">
        <button
          type="button"
          role="tab"
          className={`tasks-assignment-filter-btn${value === 'all' ? ' is-active' : ''}`}
          aria-selected={value === 'all'}
          onClick={() => onChange?.('all')}
        >
          All Tasks
        </button>
        <button
          type="button"
          role="tab"
          className={`tasks-assignment-filter-btn${value === 'mine' ? ' is-active' : ''}`}
          aria-selected={value === 'mine'}
          onClick={() => onChange?.('mine')}
        >
          Assigned to me
        </button>
      </div>
      {value === 'mine' && !hasCurrentEmployee ? (
        <p className="tasks-assignment-filter-note">
          Match your workspace manager name ({currentEmployeeName || 'not set'}) to an employee record to use this filter.
        </p>
      ) : null}
    </div>
  )
}
