import { LoadingLines } from '../common/DataPending'
import { t } from '../../i18n/i18n'
import { UserMenu } from '../auth/UserMenu'
import { HelpModeToggle } from '../../help/HelpMode'

export function TodayCommandHeader({
  greeting = '',
  executiveMessage = '',
  businessName = '',
  dateLabel = '',
  workspaceBadge = '',
  chips = [],
  profileChipDisplay,
  employees = [],
  onChipSelect,
  onOpenWorkspaceProfile,
  canOpenWorkspaceProfile = true,
  notificationBell = null,
  onOpenNotifications,
  accountActions = [],
  onAccountAction,
}) {
  return (
    <header className="topbar topbar-command today-command-header" aria-label={t("Today command header")}>
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
                  <span className="today-command-workspace-badge" aria-label={t("Venue")}>
                    {workspaceBadge}
                  </span>
                ) : businessName ? (
                  <p className="today-command-venue">{businessName}</p>
                ) : null}
              </div>
              <p className="today-command-date">{dateLabel}</p>
            </div>

            <div className="today-command-header-aside">
              <HelpModeToggle />
              {notificationBell}
              <UserMenu
                profileChipDisplay={profileChipDisplay}
                employees={employees}
                onOpenWorkspaceProfile={onOpenWorkspaceProfile}
                canOpenWorkspaceProfile={canOpenWorkspaceProfile}
                onOpenNotifications={onOpenNotifications}
                accountActions={accountActions}
                onAccountAction={onAccountAction}
                variant="today-compact"
              />
            </div>
          </div>

          {chips.length > 0 ? (
            <div className="today-command-row today-command-row-chips">
              <div className="today-command-chip-strip" role="list" aria-label={t("Operational status")}>
                {chips.map((chip) => {
                  const status = chip.loadStatus ?? 'ready'
                  const isReady = status === 'ready'
                  const interactive = status === 'error'
                    ? typeof chip.onRetry === 'function'
                    : chip.selectable !== false && typeof onChipSelect === 'function'
                  const Tag = interactive ? 'button' : 'div'
                  return (
                  <Tag
                    key={chip.id}
                    type={interactive ? 'button' : undefined}
                    className={`today-command-chip tone-${isReady ? (chip.tone ?? 'default') : 'default'}${isReady ? '' : ` is-${status}`}${interactive ? '' : ' is-static'}`}
                    role="listitem"
                    aria-busy={status === 'loading' ? 'true' : undefined}
                    onClick={interactive ? () => (status === 'error' ? chip.onRetry?.() : onChipSelect?.(chip.id)) : undefined}
                  >
                    <span className="today-command-chip-icon" aria-hidden="true">{chip.icon}</span>
                    <span className="today-command-chip-copy">
                      <span className="today-command-chip-label">{t(chip.label)}</span>
                      <strong className="today-command-chip-value">
                        {isReady ? chip.value : status === 'error' ? t("Couldn't load") : <LoadingLines label={t('Loading {{name}}', { name: t(chip.label) })} className="is-chip" />}
                      </strong>
                      {isReady && chip.detail ? (
                        <span className="today-command-chip-detail">{chip.detail}</span>
                      ) : null}
                    </span>
                  </Tag>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
