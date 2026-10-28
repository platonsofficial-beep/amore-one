import { useEffect, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { HourMinuteField } from '../HourMinuteField'
import {
  deniedNotificationHelp,
  deviceLabelFromAgent,
  formatNotificationTimeAgo,
  isGroupPushEnabled,
  normalizeClockTime,
  notificationIcon,
  readQuietHours,
  visibleNotificationGroups,
} from '../../lib/pushNotifications'

export function NotificationBell({
  items = [],
  onMarkRead,
  onMarkAll,
  onOpen,
}) {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const unread = items.filter((item) => !item.read_at)
  const unreadCount = unread.length
  const label = unreadCount > 0
    ? `Notifications, ${unreadCount} unread`
    : 'Notifications'

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const handleOpenItem = (item) => {
    setOpen(false)
    onOpen?.(item)
    if (!item.read_at) onMarkRead?.([item.id])
  }

  const sheet = open ? (
    <>
      <button
        type="button"
        className="notification-drawer-backdrop"
        aria-label="Close notifications"
        onClick={() => setOpen(false)}
      />
      <section className="notification-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="notification-drawer-header">
          <h2 id={titleId}>Notifications</h2>
          <button
            type="button"
            className="notification-text-btn"
            onClick={() => onMarkAll?.()}
            disabled={unreadCount === 0}
          >
            Mark all read
          </button>
        </header>
        {items.length === 0 ? (
          <p className="notification-drawer-empty">You're all caught up.</p>
        ) : (
          <ul className="notification-list">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`notification-list-item${item.read_at ? '' : ' is-unread'}`}
                  onClick={() => handleOpenItem(item)}
                >
                  <span className="notification-list-icon" aria-hidden="true">{notificationIcon(item.type)}</span>
                  <span className="notification-list-copy">
                    <strong>{item.title || 'Notification'}</strong>
                    {item.body ? <span>{item.body}</span> : null}
                    <time dateTime={item.created_at}>{formatNotificationTimeAgo(item.created_at)}</time>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  ) : null

  return (
    <div className={`notification-bell${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="icon-btn notification-bell-btn"
        data-help="header.notifications"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 ? (
          <span className="notification-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        ) : null}
      </button>
      {sheet && typeof document !== 'undefined' ? createPortal(sheet, document.body) : null}
    </div>
  )
}

function QuietTimeField({ label, value, disabled, onChange }) {
  return (
    <label className="notification-quiet-time">
      <span>{label}</span>
      <HourMinuteField
        value={normalizeClockTime(value)}
        ariaLabel={label}
        disabled={disabled}
        allowEmpty={false}
        onChange={(next) => {
          if (next) onChange(next)
        }}
      />
    </label>
  )
}

function ToggleRow({ icon, label, detail, checked, disabled, onChange }) {
  return (
    <label className={`notification-toggle${disabled ? ' is-disabled' : ''}`}>
      <span className="notification-toggle-icon" aria-hidden="true">{icon}</span>
      <span className="notification-toggle-copy">
        <strong>{label}</strong>
        {detail ? <span>{detail}</span> : null}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  )
}

export function NotificationSettingsPanel({
  canManageAttendance = false,
  preferences = [],
  permission = 'default',
  devices = [],
  thisDeviceEndpoint = '',
  thisDeviceOn = false,
  busy = false,
  message = '',
  onToggleGroup,
  onToggleMaster,
  onQuietChange,
  onToggleThisDevice,
  onDisableDevice,
}) {
  const quiet = readQuietHours(preferences)
  const groups = visibleNotificationGroups(canManageAttendance)
  const otherDevices = devices.filter((device) => (
    device?.endpoint
    && device.endpoint !== thisDeviceEndpoint
    && !device.disabled_at
  ))
  const blocked = permission === 'denied'

  return (
    <div className="notification-settings">
      <header className="workspace-section-header">
        <div>
          <p className="eyebrow">Account</p>
          <h3 className="workspace-section-heading">
            <span className="workspace-section-icon" aria-hidden="true">🔔</span>
            Notifications
          </h3>
          <p className="workspace-section-subtitle">
            Choose what reaches your phone. The bell always keeps a copy.
          </p>
        </div>
      </header>

      {blocked ? <p className="notification-blocked-note">{deniedNotificationHelp()}</p> : null}
      {message ? <p className="notification-settings-message" role="status">{message}</p> : null}

      <section className="panel staff-panel notification-settings-panel" aria-label="Push and quiet hours">
        <ToggleRow
          icon="🔔"
          label="Push notifications"
          detail="Turn this off to stop pushes on every device."
          checked={quiet.pushEnabled}
          disabled={busy}
          onChange={onToggleMaster}
        />
        <ToggleRow
          icon="🌙"
          label="Quiet hours"
          detail="Schedule and task alerts wait. Clock-in reminders still come through."
          checked={quiet.quietEnabled}
          disabled={busy}
          onChange={(enabled) => onQuietChange?.({ ...quiet, quietEnabled: enabled })}
        />
        <div className="notification-quiet-times">
          <QuietTimeField
            label="From"
            value={quiet.quietStart}
            disabled={busy || !quiet.quietEnabled}
            onChange={(quietStart) => onQuietChange?.({ ...quiet, quietStart })}
          />
          <QuietTimeField
            label="Until"
            value={quiet.quietEnd}
            disabled={busy || !quiet.quietEnabled}
            onChange={(quietEnd) => onQuietChange?.({ ...quiet, quietEnd })}
          />
        </div>
      </section>

      <section className="panel staff-panel notification-settings-panel" aria-label="Notification types">
        {groups.map((group) => (
          <ToggleRow
            key={group.id}
            icon={group.icon}
            label={group.label}
            detail={group.detail}
            checked={quiet.pushEnabled && isGroupPushEnabled(preferences, group.types)}
            disabled={busy || !quiet.pushEnabled}
            onChange={(enabled) => onToggleGroup?.(group, enabled)}
          />
        ))}
      </section>

      <section className="panel staff-panel notification-settings-panel" aria-label="This device">
        <ToggleRow
          icon="📱"
          label="This device"
          detail={thisDeviceOn ? 'Reminders are on for this phone or browser.' : 'Reminders are off for this phone or browser.'}
          checked={thisDeviceOn}
          disabled={busy || (blocked && !thisDeviceOn)}
          onChange={onToggleThisDevice}
        />
        {otherDevices.length > 0 ? (
          <ul className="notification-device-list">
            {otherDevices.map((device) => (
              <li key={device.id || device.endpoint}>
                <span>{deviceLabelFromAgent(device.user_agent, device.device_label)}</span>
                <button
                  type="button"
                  className="notification-text-btn"
                  disabled={busy}
                  onClick={() => onDisableDevice?.(device.endpoint)}
                >
                  Turn off
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  )
}
