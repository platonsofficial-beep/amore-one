export default function DepartmentPerformanceSummary({
  summaries = [],
  compact = false,
  title = 'Department performance',
}) {
  if (summaries.length === 0) {
    return (
      <section className={`tasks-dept-performance${compact ? ' is-compact' : ''}`} aria-label={title}>
        <header className="tasks-dept-performance-header">
          {!compact ? <p className="eyebrow">Manager view</p> : null}
          <h3>{title}</h3>
        </header>
        <div className="tasks-dept-performance-empty">
          No department workload scheduled for today yet.
        </div>
      </section>
    )
  }

  return (
    <section className={`tasks-dept-performance${compact ? ' is-compact' : ''}`} aria-label={title}>
      <header className="tasks-dept-performance-header">
        {!compact ? <p className="eyebrow">Manager view</p> : null}
        <h3>{title}</h3>
        {!compact ? (
          <p className="staff-subtitle">Today&apos;s completion by department.</p>
        ) : null}
      </header>

      <div className="tasks-dept-performance-list">
        {summaries.map((summary) => (
          <article key={summary.departmentKey} className="tasks-dept-performance-card">
            <div className="tasks-dept-performance-top">
              <div className="tasks-dept-performance-title">
                <span className="tasks-dept-performance-icon" aria-hidden="true">{summary.departmentIcon}</span>
                <h4>{summary.departmentLabel}</h4>
              </div>
              <span className="tasks-dept-performance-percent">{summary.completionPercent}%</span>
            </div>

            <p className="tasks-dept-performance-ratio">
              {summary.completedToday}/{summary.totalToday} completed
            </p>

            <div className="tasks-dept-performance-progress" aria-hidden="true">
              <span
                className="tasks-dept-performance-progress-fill"
                style={{ width: `${Math.max(0, Math.min(summary.completionPercent, 100))}%` }}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
