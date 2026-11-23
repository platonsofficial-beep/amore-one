import { t } from '../../i18n/i18n'

export function ChatHeaderButton({ unread = 0, onOpen }) {
  const count = Number(unread) || 0
  const label = count > 0
    ? `${t('Chat')}, ${count > 9 ? '9+' : count} ${t('unread')}`
    : t('Chat')
  return (
    <button
      type="button"
      className="icon-btn chat-header-btn"
      aria-label={label}
      onClick={onOpen}
    >
      <span aria-hidden="true">{'💬'}</span>
      {count > 0 ? (
        <span className="notification-bell-badge">{count > 9 ? '9+' : count}</span>
      ) : null}
    </button>
  )
}
