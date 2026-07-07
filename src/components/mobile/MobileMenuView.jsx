import { NAV_ITEMS } from '../../lib/appNavigation'
import { canAccessModule, canEditSchedule, filterNavItemsByRole } from '../../lib/permissions'

export function MobileMenuView({
  role = '',
  roleLabel = '',
  profileName = '',
  venueName = '',
  onNavigateModule,
  onOpenFullSchedule,
  onOpenSettings,
  onSignOut,
}) {
  const visibleModules = filterNavItemsByRole(NAV_ITEMS, role).filter((item) => (
    item.id !== 'today' && item.id !== 'settings'
  ))
  const showFullSchedule = canEditSchedule(role)
  const showSettings = canAccessModule(role, 'settings')

  return (
    <div className="mobile-screen mobile-menu">
      <header className="mobile-screen-header">
        <p className="mobile-screen-eyebrow">{roleLabel || 'Team member'}</p>
        <h1 className="mobile-screen-title">{profileName || 'Account'}</h1>
        {venueName ? <p className="mobile-screen-subtitle">{venueName}</p> : null}
      </header>

      <section className="mobile-menu-section" aria-label="Workspace">
        <h2 className="mobile-menu-section-title">Workspace</h2>
        <div className="mobile-menu-actions">
          {showFullSchedule ? (
            <button type="button" className="mobile-menu-btn" onClick={onOpenFullSchedule}>
              Full team schedule
            </button>
          ) : null}
          {visibleModules.map((item) => (
            <button
              key={item.id}
              type="button"
              className="mobile-menu-btn"
              onClick={() => onNavigateModule?.(item.id)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
          {showSettings ? (
            <button type="button" className="mobile-menu-btn" onClick={onOpenSettings}>
              Settings
            </button>
          ) : null}
        </div>
      </section>

      <section className="mobile-menu-section" aria-label="Account actions">
        <button type="button" className="mobile-menu-btn is-danger" onClick={onSignOut}>
          Sign out
        </button>
      </section>
    </div>
  )
}
