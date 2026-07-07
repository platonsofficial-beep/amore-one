const STAFF_TABS = [
  { id: 'home', label: 'Home', icon: '◈' },
  { id: 'schedule', label: 'Schedule', icon: '◷' },
  { id: 'tasks', label: 'Tasks', icon: '✓' },
  { id: 'menu', label: 'Menu', icon: '≡' },
]

const MANAGER_TABS = [
  { id: 'today', label: 'Today', icon: '◈' },
  { id: 'stock', label: 'Stock', icon: '📦' },
  { id: 'tasks', label: 'Tasks', icon: '✓' },
  { id: 'menu', label: 'Menu', icon: '≡' },
]

export function MobileBottomNav({ activeTab, onTabChange, variant = 'staff' }) {
  const tabs = variant === 'manager' ? MANAGER_TABS : STAFF_TABS

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`mobile-bottom-nav-item${activeTab === tab.id ? ' is-active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          aria-current={activeTab === tab.id ? 'page' : undefined}
        >
          <span className="mobile-bottom-nav-icon" aria-hidden="true">{tab.icon}</span>
          <span className="mobile-bottom-nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  )
}
