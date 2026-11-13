import { t } from '../../i18n/i18n'
import './dataPending.css'

/**
 * Neutral placeholders for cards whose data has not arrived yet, so a card
 * never claims "all good" / zero before the fetch resolves.
 */
export function LoadingLines({ lines = 1, label = 'Loading', className = '' }) {
  const count = Math.max(1, Number(lines) || 1)
  return (
    <span className={`data-pending-lines ${className}`.trim()} role="status" aria-live="polite" aria-busy="true">
      <span className="data-pending-sr">{label}…</span>
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="data-pending-line" aria-hidden="true" style={{ width: `${index % 2 ? 58 : 82}%` }} />
      ))}
    </span>
  )
}

export function LoadFailed({ onRetry, message = "Couldn't load", insideButton = false, className = '' }) {
  return (
    <span className={`data-pending-failed ${className}`.trim()} role="alert">
      <span className="data-pending-failed-text">{message}</span>
      {insideButton ? <span className="data-pending-retry is-label">{t("Tap to retry")}</span> : null}
      {!insideButton && typeof onRetry === 'function' ? (
        <button
          type="button"
          className="data-pending-retry"
          onClick={(event) => { event.stopPropagation(); onRetry() }}
        >
          {t("Retry")}
        </button>
      ) : null}
    </span>
  )
}

/**
 * Renders loading / failed placeholders, or the children once status is 'ready'.
 * insideButton: the surrounding card is the button (its click retries), so no
 * nested <button> is rendered.
 */
export function PendingValue({ status = 'ready', onRetry, lines = 1, insideButton = false, children }) {
  if (status === 'error') return <LoadFailed onRetry={onRetry} insideButton={insideButton} />
  if (status !== 'ready') return <LoadingLines lines={lines} />
  return children
}
