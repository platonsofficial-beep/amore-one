import {
  HOST_LOAD_FAILED_COPY,
  HOST_LOAD_RETRY_LABEL,
  formatHostLoadError,
  isHostLoadFailureMessage,
} from '../../lib/hostLoadNotice'
import { t } from '../../i18n/i18n'

export function HostLoadNotice({
  message = '',
  onRetry,
  className = '',
}) {
  const raw = `${message ?? ''}`.trim()
  if (!raw) return null

  const failed = isHostLoadFailureMessage(raw)
  const text = failed ? (formatHostLoadError(raw) || HOST_LOAD_FAILED_COPY) : raw

  return (
    <div
      className={`host-load-notice${failed ? ' is-failure' : ''}${className ? ` ${className}` : ''}`}
      role={failed ? 'alert' : 'status'}
      data-testid={failed ? 'host-load-notice' : undefined}
    >
      <p>{text}</p>
      {failed && typeof onRetry === 'function' ? (
        <button type="button" className="host-load-notice-retry" onClick={onRetry}>
          {t(HOST_LOAD_RETRY_LABEL)}
        </button>
      ) : null}
    </div>
  )
}
