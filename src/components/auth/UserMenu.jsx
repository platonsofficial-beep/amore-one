import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'

export function UserMenu({
  profileChipDisplay,
  onOpenWorkspaceProfile,
  variant = 'default',
}) {
  const { user, isAuthDisabled, signOut } = useAuth()
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

  const chipClassName = variant === 'command'
    ? `profile-chip profile-chip-command user-menu-trigger${profileChipDisplay.isConfigured ? '' : ' profile-chip-unconfigured'}`
    : `profile-chip user-menu-trigger${profileChipDisplay.isConfigured ? '' : ' profile-chip-unconfigured'}`

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

  const accountLabel = isAuthDisabled
    ? 'Development mode'
    : `${user?.email ?? ''}`.trim() || 'Signed in'

  return (
    <div className="user-menu" ref={containerRef}>
      <button
        type="button"
        className={chipClassName}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <div className="profile-avatar">{profileChipDisplay.initials}</div>
        {variant === 'command' ? (
          <div className="profile-chip-copy">
            <strong>{profileChipDisplay.name}</strong>
            <p>{profileChipDisplay.role}</p>
          </div>
        ) : (
          <div>
            <strong>{profileChipDisplay.name}</strong>
            <p>{profileChipDisplay.role}</p>
          </div>
        )}
      </button>

      {isOpen ? (
        <div className="user-menu-panel" role="menu" aria-label="User menu">
          <p className="user-menu-email">{accountLabel}</p>
          <button
            type="button"
            className="user-menu-item"
            role="menuitem"
            onClick={handleOpenWorkspaceProfile}
          >
            Open Workspace Profile
          </button>
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
