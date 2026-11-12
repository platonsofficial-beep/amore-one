import {
  LOAD_RETRY_LABEL,
  formatUserFacingLoadError,
  isTechnicalErrorText,
} from '../../lib/userFacingLoadError'

export function LoadFailureBanner({
  message = '',
  subject = 'this',
  onRetry,
  className = '',
}) {
  const raw = `${message ?? ''}`.trim()
  if (!raw) return null

  const technical = isTechnicalErrorText(raw)
  const text = technical ? formatUserFacingLoadError(subject) : raw

  return (
    <div className={`staff-status-banner load-failure-banner${className ? ` ${className}` : ''}`} role="alert">
      <p>{text}</p>
      {typeof onRetry === 'function' ? (
        <button type="button" className="ghost-btn load-failure-retry" onClick={onRetry}>
          {LOAD_RETRY_LABEL}
        </button>
      ) : null}
    </div>
  )
}
