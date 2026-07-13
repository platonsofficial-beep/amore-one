import { UserMenu } from '../auth/UserMenu'

export function TodayCommandHeader({
  greeting = '',
  executiveMessage = '',
  businessName = '',
  dateLabel = '',
  workspaceBadge = '',
  chips = [],
  quickActions = [],
  profileChipDisplay,
  employees = [],
  onQuickAction,
  onOpenWorkspaceProfile,
  canOpenWorkspaceProfile = true,
}) {
  const availableQuickActions = (quickActions ?? []).filter((action) => action.available)

  return (
    <header className="topbar topbar-command today-command-header" aria-label="Today command header">
      <div className="today-command-header-shell">
        <div className="today-command-header-body">
          <div className="today-command-row today-command-row-identity">
            <div className="today-command-identity">
              <h2 className="today-command-greeting">{greeting}</h2>
              {executiveMessage?.message ? (
                <p
                  className={`today-executive-message tone-${executiveMessage.tone ?? 'neutral'}`}
                  aria-live="polite"
                >
                  <span className="today-executive-indicator" aria-hidden="true" />
                  <span className="today-executive-copy">{executiveMessage.message}</span>
                </p>
              ) : null}
              <div className="today-command-venue-row">
                {workspaceBadge ? (
                  <span className="today-command-workspace-badge" aria-label="Workspace">
                    {workspaceBadge}
                  </span>
                ) : null}
                {businessName ? (
                  <p className="today-command-venue">{businessName}</p>
                ) : null}
              </div>
              <p className="today-command-date">{dateLabel}</p>
            </div>

            <div className="today-command-header-aside">
              <UserMenu
                profileChipDisplay={profileChipDisplay}
                employees={employees}
                onOpenWorkspaceProfile={onOpenWorkspaceProfile}
                canOpenWorkspaceProfile={canOpenWorkspaceProfile}
                variant="today-compact"
              />
            </div>
          </div>

          {chips.length > 0 ? (
            <div className="today-command-row today-command-row-chips">
              <div className="today-command-chip-strip" role="list" aria-label="Operational status">
                {chips.map((chip) => (
                  <div
                    key={chip.id}
                    className={`today-command-chip tone-${chip.tone ?? 'default'}`}
                    role="listitem"
                  >
                    <span className="today-command-chip-icon" aria-hidden="true">{chip.icon}</span>
                    <span className="today-command-chip-copy">
                      <span className="today-command-chip-label">{chip.label}</span>
                      <strong className="today-command-chip-value">{chip.value}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {availableQuickActions.length > 0 ? (
            <div className="today-command-row today-command-row-actions" aria-label="Quick actions">
              {availableQuickActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="today-command-action-pill"
                  onClick={() => onQuickAction?.(action.id)}
                >
                  <span className="today-command-action-plus" aria-hidden="true">+</span>
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
