import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import {
  isWorkspaceRoleReady,
  readCoarsePointer,
  readPortraitOrientation,
  shouldLockManagerLandscape,
  shouldRequireManagerLandscape,
  tryLockLandscapeOrientation,
  tryReleaseLandscapeOrientation,
} from '../../lib/managerLandscape'
import './ManagerLandscapeGate.css'

function readTouchOrientation() {
  return {
    coarsePointer: readCoarsePointer(),
    isPortrait: readPortraitOrientation(),
  }
}

function useTouchOrientation() {
  const [orientation, setOrientation] = useState(readTouchOrientation)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let frameId = 0
    let orientationTimerId = 0

    const update = () => {
      window.cancelAnimationFrame(frameId)
      frameId = window.requestAnimationFrame(() => {
        setOrientation(readTouchOrientation())
      })
    }

    const handleOrientationChange = () => {
      window.clearTimeout(orientationTimerId)
      update()
      orientationTimerId = window.setTimeout(update, 320)
    }

    update()

    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', handleOrientationChange)
    window.visualViewport?.addEventListener('resize', update)

    const coarseQuery = window.matchMedia?.('(pointer: coarse)')
    const portraitQuery = window.matchMedia?.('(orientation: portrait)')
    coarseQuery?.addEventListener?.('change', update)
    portraitQuery?.addEventListener?.('change', update)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(orientationTimerId)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', handleOrientationChange)
      window.visualViewport?.removeEventListener('resize', update)
      coarseQuery?.removeEventListener?.('change', update)
      portraitQuery?.removeEventListener?.('change', update)
    }
  }, [])

  return orientation
}

function useLandscapeLock(shouldLock) {
  useEffect(() => {
    if (!shouldLock || typeof window === 'undefined') return undefined

    let cancelled = false
    let locked = false
    let gestureTried = false

    const attempt = async () => {
      const ok = await tryLockLandscapeOrientation()
      if (cancelled) {
        if (ok) tryReleaseLandscapeOrientation()
        return
      }
      if (ok) locked = true
    }

    attempt()

    const handleGesture = () => {
      if (locked || gestureTried || cancelled) return
      gestureTried = true
      attempt()
    }

    window.addEventListener('pointerup', handleGesture)

    return () => {
      cancelled = true
      window.removeEventListener('pointerup', handleGesture)
      if (locked) tryReleaseLandscapeOrientation()
    }
  }, [shouldLock])
}

function RotateDevicePrompt() {
  const titleId = useId()
  const descriptionId = useId()
  const titleRef = useRef(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  return (
    <div
      className="manager-landscape-gate"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <div className="manager-landscape-gate-card">
        <div className="manager-landscape-gate-icon-wrap">
          <svg className="manager-landscape-gate-icon" viewBox="0 0 72 72" aria-hidden="true">
            <rect x="26" y="8" width="20" height="38" rx="4.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
            <circle cx="36" cy="39" r="1.5" fill="currentColor" />
            <path d="M50 24c7 2.5 12 9 12 16.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            <path d="M46 16.5l8.5 1.2-1.4 8.2" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="manager-landscape-gate-kicker">ONE</p>
        <h1 id={titleId} ref={titleRef} tabIndex={-1} className="manager-landscape-gate-title">
          Rotate your device
        </h1>
        <p id={descriptionId} className="manager-landscape-gate-copy">
          Managers and owners use ONE in landscape. Turn your phone or tablet sideways to continue.
        </p>
      </div>
    </div>
  )
}

export function ManagerLandscapeGate({ children }) {
  const {
    role,
    isLoading,
    isBootstrapping,
    membership,
    session,
    isAuthDisabled,
  } = useAuth()
  const { coarsePointer, isPortrait } = useTouchOrientation()

  const roleKnown = isWorkspaceRoleReady({
    isAuthDisabled,
    isLoading,
    isBootstrapping,
    hasSession: Boolean(session),
    hasMembership: Boolean(membership),
    role,
  })

  const blocked = shouldRequireManagerLandscape({
    role,
    roleKnown,
    coarsePointer,
    isPortrait,
  })

  const shouldLock = shouldLockManagerLandscape({
    role,
    roleKnown,
    coarsePointer,
  })

  useLandscapeLock(shouldLock)

  useEffect(() => {
    if (!blocked || typeof document === 'undefined') return undefined

    const root = document.getElementById('root')
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    root?.setAttribute('inert', '')
    root?.setAttribute('aria-hidden', 'true')

    return () => {
      document.body.style.overflow = previousOverflow
      root?.removeAttribute('inert')
      root?.removeAttribute('aria-hidden')
    }
  }, [blocked])

  const prompt = blocked && typeof document !== 'undefined'
    ? createPortal(<RotateDevicePrompt />, document.body)
    : null

  return (
    <>
      {children}
      {prompt}
    </>
  )
}
