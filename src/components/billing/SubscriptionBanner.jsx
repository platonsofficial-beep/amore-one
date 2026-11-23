import { useEffect, useState } from 'react'
import './subscription.css'
import { t } from '../../i18n/i18n'
import { dismissTrialNotice, isTrialNoticeDismissed } from '../../lib/trialNotice'

export function SubscriptionBanner({ message, action, onAction, onDismiss }) {
  return (
    <div className="trial-today-notice" data-testid="trial-today-notice" role="status">
      <p className="subscription-banner-copy">{message}</p>
      <div className="trial-today-notice-actions">
        <button type="button" className="subscription-banner-action" onClick={onAction}>
          {action}
        </button>
        {onDismiss ? (
          <button type="button" className="trial-today-notice-close" aria-label={t("Close")} onClick={onDismiss}>
            <span aria-hidden="true">×</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function TrialTodayNotice({
  userId = '',
  workspaceId = '',
  dayKey = '',
  message = '',
  action = '',
  onAction,
}) {
  const [dismissed, setDismissed] = useState(() => isTrialNoticeDismissed(userId, workspaceId, dayKey))

  useEffect(() => {
    setDismissed(isTrialNoticeDismissed(userId, workspaceId, dayKey))
  }, [userId, workspaceId, dayKey])

  if (!message || dismissed) return null

  return (
    <SubscriptionBanner
      message={message}
      action={action}
      onAction={onAction}
      onDismiss={() => {
        dismissTrialNotice(userId, workspaceId, dayKey)
        setDismissed(true)
      }}
    />
  )
}
