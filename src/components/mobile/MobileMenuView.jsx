import { useMemo } from 'react'
import { NAV_ITEMS } from '../../lib/appNavigation'
import {
  canAccessMobileExpandedModule,
  canOpenMobileFullSchedule,
  filterManagerMobileMenuNavItems,
  filterMobileMenuNavItems,
} from '../../lib/permissions'

const MANAGER_WORKSPACE_ORDER = [
  'reservations',
  'team',
  'operations',
  'insights',
  'settings',
]

const MANAGER_WORKSPACE_SUBTITLES = {
  reservations: 'Bookings and guest management',
  team: 'Staff, shifts and roles',
  operations: 'Tasks, checklists and handovers',
  insights: 'Reports and performance',
  settings: 'Workspace preferences',
}

function ManagerNavCard({
  icon,
  title,
  subtitle = '',
  onClick,
  disabled = false,
}) {
  return (
    <button
      type="button"
      className="mobile-manager-menu-nav-card"
      onClick={onClick}
      disabled={disabled || !onClick}
    >
      <span className="mobile-manager-menu-nav-icon" aria-hidden="true">{icon}</span>
      <span className="mobile-manager-menu-nav-copy">
        <strong className="mobile-manager-menu-nav-title">{title}</strong>
        {subtitle ? (
          <span className="mobile-manager-menu-nav-subtitle">{subtitle}</span>
        ) : null}
      </span>
      <span className="mobile-manager-menu-nav-chevron" aria-hidden="true">›</span>
    </button>
  )
}

export function MobileMenuView({
  role = '',
  roleLabel = '',
  profileName = '',
  venueName = '',
  menuVariant = 'staff',
  canRequestLeave = false,
  canViewLeaveInbox = false,
  onOpenProfile,
  onNavigateModule,
  onOpenFullSchedule,
  onOpenSettings,
  onOpenRequestLeave,
  onOpenLeaveInbox,
  onSignOut,
}) {
  const visibleModules = menuVariant === 'manager'
    ? filterManagerMobileMenuNavItems(NAV_ITEMS, role)
    : filterMobileMenuNavItems(NAV_ITEMS, role)
  const showFullSchedule = canOpenMobileFullSchedule(role)
  const showSettings = canAccessMobileExpandedModule(role, 'settings')
  const isHostMenu = menuVariant === 'host'
  const allowedModuleIds = useMemo(
    () => new Set(visibleModules.map((item) => item.id)),
    [visibleModules],
  )

  const managerWorkspaceItems = useMemo(() => (
    MANAGER_WORKSPACE_ORDER
      .filter((moduleId) => (
        moduleId === 'settings' ? showSettings : allowedModuleIds.has(moduleId)
      ))
      .map((moduleId) => {
        const navItem = NAV_ITEMS.find((item) => item.id === moduleId)
        return {
          id: moduleId,
          icon: navItem?.icon ?? '⚙️',
          title: navItem?.label ?? 'Settings',
          subtitle: MANAGER_WORKSPACE_SUBTITLES[moduleId] ?? '',
          onClick: moduleId === 'settings'
            ? onOpenSettings
            : () => onNavigateModule?.(moduleId),
        }
      })
  ), [allowedModuleIds, showSettings, onOpenSettings, onNavigateModule])

  if (isHostMenu) {
    return (
      <div className="mobile-screen mobile-menu mobile-host-menu">
        <header className="mobile-screen-header">
          <p className="mobile-screen-eyebrow">{roleLabel || 'Host station'}</p>
          <h1 className="mobile-screen-title">{profileName || 'Account'}</h1>
          {venueName ? <p className="mobile-screen-subtitle">{venueName}</p> : null}
        </header>

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

  const showWorkspaceSection = showFullSchedule
    || (menuVariant === 'manager'
      ? managerWorkspaceItems.length > 0 || canViewLeaveInbox
      : visibleModules.length > 0 || showSettings)
  const identityStatusLine = venueName ? 'Workspace ready' : 'Workspace profile loading'

  if (menuVariant === 'manager') {
    return (
      <div className="mobile-screen mobile-menu mobile-manager-menu">
        <article className="mobile-manager-menu-identity" aria-label="Account overview">
          <div className="mobile-manager-menu-identity-top">
            <h1 className="mobile-manager-menu-identity-name">{profileName || 'Account'}</h1>
            {roleLabel ? (
              <span className="mobile-manager-menu-role-badge">{roleLabel}</span>
            ) : null}
          </div>
          {venueName ? (
            <p className="mobile-manager-menu-workspace-name">{venueName}</p>
          ) : null}
          <p className="mobile-manager-menu-status-line">{identityStatusLine}</p>
        </article>

        {showWorkspaceSection ? (
          <section className="mobile-manager-menu-section" aria-label="Workspace">
            <h2 className="mobile-manager-menu-section-title">Workspace</h2>
            <div className="mobile-manager-menu-nav-list">
              {showFullSchedule ? (
                <ManagerNavCard
                  icon="📅"
                  title="Full team schedule"
                  subtitle="Weekly shift planning"
                  onClick={onOpenFullSchedule}
                />
              ) : null}
              {canViewLeaveInbox ? (
                <ManagerNavCard
                  icon="◷"
                  title="Leave inbox"
                  subtitle="Pending leave requests"
                  onClick={onOpenLeaveInbox}
                />
              ) : null}
              {managerWorkspaceItems.map((item) => (
                <ManagerNavCard
                  key={item.id}
                  icon={item.icon}
                  title={item.title}
                  subtitle={item.subtitle}
                  onClick={item.onClick}
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mobile-manager-menu-section" aria-label="Account">
          <h2 className="mobile-manager-menu-section-title">Account</h2>
          <div className="mobile-manager-menu-nav-list">
            <ManagerNavCard
              icon="👤"
              title="Profile"
              subtitle="Personal details and account"
              onClick={onOpenProfile}
            />
          </div>
          <div className="mobile-manager-menu-signout-wrap">
            <button
              type="button"
              className="mobile-manager-menu-signout-btn"
              onClick={onSignOut}
            >
              Sign out
            </button>
          </div>
        </section>
      </div>
    )
  }

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
            {showSettings && !allowedModuleIds.has('settings') ? (
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
          {canRequestLeave ? (
            <button
              type="button"
              className="mobile-menu-btn"
              onClick={() => onOpenRequestLeave?.()}
              aria-haspopup="dialog"
            >
              Request Leave
            </button>
          ) : null}
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
