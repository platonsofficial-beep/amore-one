import {
  MOBILE_MANAGER_BOTTOM_TABS,
  MOBILE_STAFF_BOTTOM_TABS,
} from '../../lib/permissions'

export function MobileBottomNav({
  activeTab,
  onTabChange,
  variant = 'staff',
  tabs,
}) {
  const resolvedTabs = tabs ?? (variant === 'manager' ? MOBILE_MANAGER_BOTTOM_TABS : MOBILE_STAFF_BOTTOM_TABS)

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {resolvedTabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`mobile-bottom-nav-item${activeTab === tab.id ? ' is-active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          aria-current={activeTab === tab.id ? 'page' : undefined}
          aria-label={tab.badge ? `${tab.ariaLabel || tab.label}, ${tab.badge} unread` : (tab.ariaLabel || tab.label)}
        >
          <span className="mobile-bottom-nav-icon" aria-hidden="true">{tab.icon}</span>
          {tab.badge ? <span className="mobile-bottom-nav-badge">{Number(tab.badge) > 9 ? '9+' : tab.badge}</span> : null}
          <span className="mobile-bottom-nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
