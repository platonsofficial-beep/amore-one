import { t } from '../../i18n/i18n'
export default function TasksAssignmentFilter({
  value = 'all',
  onChange,
  currentEmployeeName = '',
  hasCurrentEmployee = false,
}) {
  return (
    <div className="tasks-assignment-filter">
      <span className="tasks-assignment-filter-label">{t("View")}</span>
      <div className="tasks-assignment-filter-options" role="tablist" aria-label={t("Task assignment filter")}>
        <button
          type="button"
          role="tab"
          className={`tasks-assignment-filter-btn${value === 'all' ? ' is-active' : ''}`}
          aria-selected={value === 'all'}
          onClick={() => onChange?.('all')}
        >
          {t("All Tasks")}
        </button>
        <button
          type="button"
          role="tab"
          className={`tasks-assignment-filter-btn${value === 'mine' ? ' is-active' : ''}`}
          aria-selected={value === 'mine'}
          onClick={() => onChange?.('mine')}
        >
          {t("Assigned to me")}
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
