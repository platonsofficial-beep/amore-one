import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { PersonAvatar } from '../identity/PersonAvatar'
import { getProfileInitials } from '../../lib/workspaceProfileUtils'
import { getWorkspaceRoleLabel } from '../../lib/membershipRoles'
import { resolveUserDisplayName } from '../../lib/userDisplayName'
import { placeUserMenuPanel } from '../../lib/userMenuPlacement'

function readSafeAreaInsets() {
  if (typeof document === 'undefined') return { safeTop: 0, safeBottom: 0 }
  const probe = document.createElement('div')
  probe.style.position = 'absolute'
  probe.style.visibility = 'hidden'
  probe.style.paddingTop = 'env(safe-area-inset-top)'
  probe.style.paddingBottom = 'env(safe-area-inset-bottom)'
  document.body.appendChild(probe)
  const styles = getComputedStyle(probe)
  const safeTop = Number.parseFloat(styles.paddingTop) || 0
  const safeBottom = Number.parseFloat(styles.paddingBottom) || 0
  probe.remove()
  return { safeTop, safeBottom }
}

export function UserMenu({
  profileChipDisplay,
  employees = [],
  onOpenWorkspaceProfile,
  canOpenWorkspaceProfile = true,
  onOpenNotifications,
  accountActions = [],
  onAccountAction,
  variant = 'default',
}) {
  const {
    user,
    membership,
    role,
    roleLabel,
    isAuthDisabled,
    signOut,
  } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [placement, setPlacement] = useState(null)
  const containerRef = useRef(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)

  useLayoutEffect(() => {
    if (!isOpen) return undefined

    const updatePlacement = (event) => {
      if (event?.target && panelRef.current?.contains(event.target)) return
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const safeArea = readSafeAreaInsets()
      setPlacement(placeUserMenuPanel(rect, {
        width: window.innerWidth,
        height: window.innerHeight,
        ...safeArea,
      }))
    }

    updatePlacement()
    window.addEventListener('resize', updatePlacement)
    window.addEventListener('scroll', updatePlacement, true)
    return () => {
      window.removeEventListener('resize', updatePlacement)
      window.removeEventListener('scroll', updatePlacement, true)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined

    const handlePointerDown = (event) => {
      const target = event.target
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setIsOpen(false)
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const memberDisplayName = resolveUserDisplayName({ membership, employees, user })
    || `${profileChipDisplay?.name ?? ''}`.trim()
    || 'Profile not set'
  const memberEmail = `${membership?.email ?? user?.email ?? ''}`.trim()
    || (isAuthDisabled ? 'Development mode' : 'Signed in')
  const chipInitials = getProfileInitials(memberDisplayName)

  const chipClassName = variant === 'today-compact'
    ? `profile-chip profile-chip-today-compact user-menu-trigger${profileChipDisplay.isConfigured || memberDisplayName ? '' : ' profile-chip-unconfigured'}`
    : variant === 'command'
    ? `profile-chip profile-chip-command user-menu-trigger${profileChipDisplay.isConfigured || memberDisplayName ? '' : ' profile-chip-unconfigured'}`
    : `profile-chip user-menu-trigger${profileChipDisplay.isConfigured || memberDisplayName ? '' : ' profile-chip-unconfigured'}`

  const handleOpenWorkspaceProfile = () => {
    setIsOpen(false)
    onOpenWorkspaceProfile?.()
  }

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      await signOut()
      setIsOpen(false)
    } finally {
      setIsSigningOut(false)
    }
  }

  const resolvedRoleLabel = roleLabel || getWorkspaceRoleLabel(membership?.role ?? role)

  return (
    <div className="user-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className={chipClassName}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Your menu"
        data-help="header.profile"
        onClick={() => setIsOpen((current) => !current)}
      >
        <div className="profile-avatar">
          <PersonAvatar
            authUserId={user?.id || membership?.authUserId}
            memberId={membership?.id}
            employeeId={membership?.employeeId}
            name={memberDisplayName}
            fallback={chipInitials}
          />
        </div>
        {variant === 'command' || variant === 'today-compact' ? (
          <div className="profile-chip-copy">
            <strong>{memberDisplayName}</strong>
            <p className="user-menu-chip-meta">
              <span className="user-menu-role-badge">{resolvedRoleLabel}</span>
            </p>
          </div>
        ) : (
          <div>
            <strong>{memberDisplayName}</strong>
            <p className="user-menu-chip-meta">
              <span className="user-menu-role-badge">{resolvedRoleLabel}</span>
            </p>
          </div>
        )}
      </button>

      {isOpen && typeof document !== 'undefined' ? createPortal(
        <div
          ref={panelRef}
          className="user-menu-panel user-menu-panel-portaled"
          role="menu"
          aria-label="User menu"
          style={placement ? {
            top: `${placement.top}px`,
            left: `${placement.left}px`,
            width: `${placement.width}px`,
            maxHeight: `${placement.maxHeight}px`,
          } : undefined}
        >
          <div className="user-menu-panel-header">
            <p className="user-menu-name">{memberDisplayName}</p>
            <span className="user-menu-role-badge user-menu-role-badge-panel">{resolvedRoleLabel}</span>
          </div>
          <p className="user-menu-email">{memberEmail}</p>
          {canOpenWorkspaceProfile ? (
            <button
              type="button"
              className="user-menu-item"
              role="menuitem"
              onClick={handleOpenWorkspaceProfile}
            >
              Open Workspace Profile
            </button>
          ) : null}
          {onOpenNotifications ? (
            <button
              type="button"
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setIsOpen(false)
                onOpenNotifications()
              }}
            >
              Notifications
            </button>
          ) : null}
          {accountActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setIsOpen(false)
                onAccountAction?.(action.id)
              }}
            >
              {action.label}
            </button>
          ))}
          {!isAuthDisabled ? (
            <button
              type="button"
              className="user-menu-item user-menu-item-danger"
              role="menuitem"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? 'Signing out…' : 'Logout'}
            </button>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </div>
  )
}
