import { NAV_ITEMS } from '../../lib/appNavigation'
import {
  canAccessMobileExpandedModule,
  canOpenMobileFullSchedule,
  filterMobileMenuNavItems,
} from '../../lib/permissions'

export function MobileMenuView({
  role = '',
  roleLabel = '',
  profileName = '',
  venueName = '',
  onOpenProfile,
  onNavigateModule,
  onOpenFullSchedule,
  onOpenSettings,
  onSignOut,
}) {
  const visibleModules = filterMobileMenuNavItems(NAV_ITEMS, role)
  const showFullSchedule = canOpenMobileFullSchedule(role)
  const showSettings = canAccessMobileExpandedModule(role, 'settings')
  const showWorkspaceSection = showFullSchedule || visibleModules.length > 0 || showSettings

  return (
    <div className="mobile-screen mobile-menu">
      <header className="mobile-screen-header">
        <p className="mobile-screen-eyebrow">{roleLabel || 'Team member'}</p>
        <h1 className="mobile-screen-title">{profileName || 'Account'}</h1>
        {venueName ? <p className="mobile-screen-subtitle">{venueName}</p> : null}
      </header>

      {showWorkspaceSection ? (
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
      ) : null}

      <section className="mobile-menu-section" aria-label="Account">
        <h2 className="mobile-menu-section-title">Account</h2>
        <div className="mobile-menu-actions">
          <button type="button" className="mobile-menu-btn" onClick={onOpenProfile}>
            Profile
          </button>
          <button type="button" className="mobile-menu-btn is-danger" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </section>
    </div>
  )
}
