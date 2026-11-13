import { t } from '../../i18n/i18n'
export default function DepartmentPerformanceSummary({
  summaries = [],
  compact = false,
  title = t("Department performance"),
}) {
  if (summaries.length === 0) {
    return (
      <section className={`tasks-dept-performance${compact ? ' is-compact' : ''}`} aria-label={title}>
        <header className="tasks-dept-performance-header">
          {!compact ? <p className="eyebrow">{t("Manager view")}</p> : null}
          <h3>{title}</h3>
        </header>
        <div className="tasks-dept-performance-empty">
          {t("No department workload scheduled for today yet.")}
        </div>
      </section>
    )
  }

  return (
    <section className={`tasks-dept-performance${compact ? ' is-compact' : ''}`} aria-label={title}>
      <header className="tasks-dept-performance-header">
        {!compact ? <p className="eyebrow">{t("Manager view")}</p> : null}
        <h3>{title}</h3>
        {!compact ? (
          <p className="staff-subtitle">{t("Today's completion by department.")}</p>
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
              {t('{{done}}/{{total}} completed', { done: summary.completedToday, total: summary.totalToday })}
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
