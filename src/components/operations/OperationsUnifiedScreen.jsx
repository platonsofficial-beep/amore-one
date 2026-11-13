import { t } from '../../i18n/i18n'
export function OperationsUnifiedScreen({
  sections = [],
  section = 'dashboard',
  onSectionChange,
  today = null,
  boards = null,
  checklists = null,
  execution = null,
}) {
  const active = execution ? '' : section || 'dashboard'

  return (
    <div className="operations-unified-screen">
      {!execution && sections.length > 1 ? (
        <div className="operations-unified-tabs" role="tablist" aria-label={t("Operations")}>
          {sections.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active === entry.id}
              className={`operations-unified-tab${active === entry.id ? ' is-active' : ''}`}
              onClick={() => onSectionChange?.(entry.id)}
            >
              {t(entry.label)}
            </button>
          ))}
        </div>
      ) : null}
      {execution || (active === 'tasks' ? boards : active === 'checklists' ? checklists : today)}
    </div>
  )
}
