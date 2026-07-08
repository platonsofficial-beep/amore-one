import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getProfileInitials } from '../../lib/workspaceProfileUtils'
import { getWorkspaceRoleLabel } from '../../lib/membershipRoles'
import { resolveUserDisplayName } from '../../lib/userDisplayName'

export function UserMenu({
  profileChipDisplay,
  employees = [],
  onOpenWorkspaceProfile,
  canOpenWorkspaceProfile = true,
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
  const containerRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return undefined

    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const memberDisplayName = resolveUserDisplayName({ membership, employees, user })
    || `${profileChipDisplay?.name ?? ''}`.trim()
    || 'Profile not set'
  const memberEmail = `${membership?.email ?? user?.email ?? ''}`.trim()
    || (isAuthDisabled ? 'Development mode' : 'Signed in')
  const chipInitials = getProfileInitials(memberDisplayName)

  const chipClassName = variant === 'command'
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
        type="button"
        className={chipClassName}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <div className="profile-avatar">{chipInitials}</div>
        {variant === 'command' ? (
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

      {isOpen ? (
        <div className="user-menu-panel" role="menu" aria-label="User menu">
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
        </div>
      ) : null}
    </div>
  )
}
