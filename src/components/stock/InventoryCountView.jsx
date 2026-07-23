import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  cancelInventoryCountSession,
  listInventoryCountHomeSessions,
  postInventoryCountFinish,
  previewInventoryCountFinish,
} from '../../services/inventoryCountService'
import { InventoryCountWizard } from './InventoryCountWizard'
import { InventoryCountSessionWorkspace } from './InventoryCountSessionWorkspace'

const OPENABLE_STATUSES = new Set(['in_progress', 'paused', 'counting_complete'])

function formatSessionDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatProgress(session) {
  const total = Number(session?.totalLocations) || 0
  const completed = Number(session?.completedLocations) || 0
  if (total <= 0) return 'No locations'
  return `${completed} / ${total} locations`
}

function formatLocations(session) {
  const keys = Array.isArray(session?.locations) ? session.locations.filter(Boolean) : []
  if (keys.length === 0) return '—'
  if (keys.length <= 3) return keys.join(', ')
  return `${keys.slice(0, 3).join(', ')} +${keys.length - 3}`
}

function InventoryCountSessionCardMeta({ session }) {
  const lastUpdate = session.updatedAt || session.postedAt || session.pausedAt || session.startedAt
  const operator = `${session.operatorName ?? ''}`.trim() || '—'

  return (
    <>
      <div className="inventory-count-session-card-top">
        <strong className="inventory-count-session-card-title">{session.countTypeLabel}</strong>
        <span className="inventory-count-session-pill is-status">
          {session.statusLabel}
        </span>
      </div>
      <dl className="inventory-count-session-card-meta">
        <div>
          <dt>Started</dt>
          <dd>{formatSessionDate(session.startedAt)}</dd>
        </div>
        <div>
          <dt>Operator</dt>
          <dd>{operator}</dd>
        </div>
        <div>
          <dt>Locations</dt>
          <dd>{formatLocations(session)}</dd>
        </div>
        <div>
          <dt>Progress</dt>
          <dd>{formatProgress(session)}</dd>
        </div>
        <div>
          <dt>Last update</dt>
          <dd>{formatSessionDate(lastUpdate)}</dd>
        </div>
      </dl>
    </>
  )
}

function InventoryCountSessionCard({
  session,
  onOpen,
  onReview,
  onPost,
  onCancel,
  busyAction,
  actionError,
}) {
  const isCountingComplete = session.status === 'counting_complete'
  const canOpen = OPENABLE_STATUSES.has(session.status) && !isCountingComplete
  const isBusy = Boolean(busyAction)

  if (isCountingComplete) {
    return (
      <div
        className={`inventory-count-session-card is-${session.status} has-actions`}
        aria-label={`${session.countTypeLabel}, ${session.statusLabel}`}
      >
        <InventoryCountSessionCardMeta session={session} />
        <div className="inventory-count-session-card-actions">
          <button
            type="button"
            className="ghost-btn inventory-count-home-action-btn"
            onClick={() => onReview?.(session)}
            disabled={isBusy}
          >
            Review
          </button>
          <button
            type="button"
            className="primary-btn inventory-count-home-action-btn"
            onClick={() => onPost?.(session)}
            disabled={isBusy}
          >
            {busyAction === 'post' ? 'Posting…' : 'Post Count'}
          </button>
          <button
            type="button"
            className="ghost-btn danger-text inventory-count-home-action-btn"
            onClick={() => onCancel?.(session)}
            disabled={isBusy}
          >
            {busyAction === 'cancel' ? 'Cancelling…' : 'Cancel Count'}
          </button>
        </div>
        {actionError ? (
          <p className="inventory-count-session-card-error" role="alert">{actionError}</p>
        ) : null}
      </div>
    )
  }

  return (
    <button
      type="button"
      className={`inventory-count-session-card is-${session.status}${canOpen ? '' : ' is-readonly'}`}
      onClick={() => {
        if (canOpen) onOpen?.(session)
      }}
      disabled={!canOpen}
      aria-label={`${session.countTypeLabel}, ${session.statusLabel}`}
    >
      <InventoryCountSessionCardMeta session={session} />
    </button>
  )
}

function InventoryCountSessionPanel({
  title,
  sessions,
  emptyTitle,
  emptyCopy,
  isLoading,
  onOpenSession,
  onReviewSession,
  onPostSession,
  onCancelSession,
  busySessionId,
  busyAction,
  actionErrors,
}) {
  const hasSessions = sessions.length > 0

  return (
    <article className="panel staff-panel inventory-count-panel">
      <h3 className="inventory-count-panel-title">{title}</h3>
      {isLoading ? (
        <p className="inventory-count-panel-loading" role="status">Loading…</p>
      ) : hasSessions ? (
        <div className="inventory-count-session-list" role="list">
          {sessions.map((session) => (
            <div key={session.id} role="listitem">
              <InventoryCountSessionCard
                session={session}
                onOpen={onOpenSession}
                onReview={onReviewSession}
                onPost={onPostSession}
                onCancel={onCancelSession}
                busyAction={busySessionId === session.id ? busyAction : ''}
                actionError={actionErrors?.[session.id] || ''}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="stock-empty-state">
          <h4>{emptyTitle}</h4>
          {emptyCopy ? <p>{emptyCopy}</p> : null}
        </div>
      )}
    </article>
  )
}

export function InventoryCountView() {
  const { workspace } = useAuth()
  const workspaceId = `${workspace?.id ?? ''}`.trim()

  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [isSessionOpen, setIsSessionOpen] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState('')
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('')
  const [pageNotice, setPageNotice] = useState('')
  const [isLoadingSessions, setIsLoadingSessions] = useState(Boolean(workspaceId))
  const [loadError, setLoadError] = useState('')
  const [activeSessions, setActiveSessions] = useState([])
  const [pausedSessions, setPausedSessions] = useState([])
  const [recentSessions, setRecentSessions] = useState([])
  const [busySessionId, setBusySessionId] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [actionErrors, setActionErrors] = useState({})

  const loadHomeSessions = useCallback(async () => {
    if (!workspaceId) {
      setActiveSessions([])
      setPausedSessions([])
      setRecentSessions([])
      setIsLoadingSessions(false)
      setLoadError('')
      return
    }

    setIsLoadingSessions(true)
    setLoadError('')
    try {
      const next = await listInventoryCountHomeSessions({ workspaceId })
      setActiveSessions(next.active ?? [])
      setPausedSessions(next.paused ?? [])
      setRecentSessions(next.recent ?? [])
    } catch (error) {
      setActiveSessions([])
      setPausedSessions([])
      setRecentSessions([])
      setLoadError(error?.message || 'Unable to load inventory count sessions right now.')
    } finally {
      setIsLoadingSessions(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void loadHomeSessions()
  }, [loadHomeSessions])

  const clearActionError = (sessionId) => {
    setActionErrors((current) => {
      if (!current[sessionId]) return current
      const next = { ...current }
      delete next[sessionId]
      return next
    })
  }

  const setActionError = (sessionId, message) => {
    setActionErrors((current) => ({
      ...current,
      [sessionId]: message,
    }))
  }

  const openSession = (session) => {
    const sessionId = `${session?.id ?? ''}`.trim()
    const nextWorkspaceId = `${session?.workspaceId ?? workspaceId}`.trim()
    if (!sessionId || !nextWorkspaceId) return
    if (!OPENABLE_STATUSES.has(session.status)) return

    setPageNotice('')
    clearActionError(sessionId)
    setActiveSessionId(sessionId)
    setActiveWorkspaceId(nextWorkspaceId)
    setIsSessionOpen(true)
  }

  const handleExitSession = () => {
    setIsSessionOpen(false)
    setActiveSessionId('')
    setActiveWorkspaceId('')
    void loadHomeSessions()
  }

  const handleSessionPosted = ({ message } = {}) => {
    handleExitSession()
    setPageNotice(`${message || 'Inventory count posted successfully.'}`.trim()
      || 'Inventory count posted successfully.')
  }

  const handlePostSession = async (session) => {
    const sessionId = `${session?.id ?? ''}`.trim()
    const nextWorkspaceId = `${session?.workspaceId ?? workspaceId}`.trim()
    if (!sessionId || !nextWorkspaceId || busySessionId) return

    setBusySessionId(sessionId)
    setBusyAction('post')
    clearActionError(sessionId)
    setPageNotice('')

    try {
      const preview = await previewInventoryCountFinish({
        workspaceId: nextWorkspaceId,
        sessionId,
      })
      if (!preview?.canPost) {
        throw new Error(
          'This count has blocking issues. Open Review to resolve them before posting.',
        )
      }

      const result = await postInventoryCountFinish({
        workspaceId: nextWorkspaceId,
        sessionId,
      })

      setPageNotice(`${result?.message || 'Inventory count posted successfully.'}`.trim()
        || 'Inventory count posted successfully.')
      await loadHomeSessions()
    } catch (error) {
      setActionError(sessionId, error?.message || 'Unable to post inventory count right now.')
    } finally {
      setBusySessionId('')
      setBusyAction('')
    }
  }

  const handleCancelSession = async (session) => {
    const sessionId = `${session?.id ?? ''}`.trim()
    const nextWorkspaceId = `${session?.workspaceId ?? workspaceId}`.trim()
    if (!sessionId || !nextWorkspaceId || busySessionId) return

    const confirmed = window.confirm(
      'Cancel this inventory count? Counted values will be discarded and the session will close without posting.',
    )
    if (!confirmed) return

    setBusySessionId(sessionId)
    setBusyAction('cancel')
    clearActionError(sessionId)
    setPageNotice('')

    try {
      await cancelInventoryCountSession({
        workspaceId: nextWorkspaceId,
        sessionId,
      })
      setPageNotice('Inventory count cancelled.')
      await loadHomeSessions()
    } catch (error) {
      setActionError(sessionId, error?.message || 'Unable to cancel inventory count right now.')
    } finally {
      setBusySessionId('')
      setBusyAction('')
    }
  }

  if (isSessionOpen) {
    return (
      <InventoryCountSessionWorkspace
        sessionId={activeSessionId}
        workspaceId={activeWorkspaceId}
        onExit={handleExitSession}
        onPosted={handleSessionPosted}
      />
    )
  }

  return (
    <section className="inventory-count-page" aria-label="Inventory Count">
      <header className="inventory-count-header">
        <div className="inventory-count-header-copy">
          <h2 className="inventory-count-title">Inventory Count</h2>
          <p className="inventory-count-subtitle">
            Count inventory by location, review variances, and post verified stock levels.
          </p>
        </div>
        <button
          type="button"
          className="primary-btn inventory-count-start-btn"
          onClick={() => setIsWizardOpen(true)}
        >
          Start new count
        </button>
      </header>

      {pageNotice ? (
        <div className="staff-status-banner auth-banner-success" role="status">
          {pageNotice}
        </div>
      ) : null}

      {loadError ? (
        <div className="staff-status-banner auth-banner-error" role="alert">
          {loadError}
        </div>
      ) : null}

      <div className="inventory-count-foundation-grid" aria-label="Inventory count status">
        <InventoryCountSessionPanel
          title="Active counts"
          sessions={activeSessions}
          emptyTitle="No active counts."
          emptyCopy=""
          isLoading={isLoadingSessions}
          onOpenSession={openSession}
          onReviewSession={openSession}
          onPostSession={handlePostSession}
          onCancelSession={handleCancelSession}
          busySessionId={busySessionId}
          busyAction={busyAction}
          actionErrors={actionErrors}
        />
        <InventoryCountSessionPanel
          title="Paused counts"
          sessions={pausedSessions}
          emptyTitle="No paused counts."
          emptyCopy=""
          isLoading={isLoadingSessions}
          onOpenSession={openSession}
        />
        <InventoryCountSessionPanel
          title="Recent counts"
          sessions={recentSessions}
          emptyTitle="No completed counts yet."
          emptyCopy=""
          isLoading={isLoadingSessions}
          onOpenSession={openSession}
        />
      </div>

      <aside className="panel staff-panel inventory-count-howto" aria-label="How Inventory Count will work">
        <h3 className="inventory-count-panel-title">How Inventory Count will work</h3>
        <ol className="inventory-count-howto-steps">
          <li>Choose locations or items</li>
          <li>Count and review variances</li>
          <li>Post verified stock levels</li>
        </ol>
      </aside>

      <InventoryCountWizard
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        onStartSession={(result) => {
          const sessionId = `${result?.sessionId ?? result?.session?.id ?? ''}`.trim()
          const nextWorkspaceId = `${result?.workspaceId ?? result?.session?.workspaceId ?? ''}`.trim()
          setPageNotice('')
          setActiveSessionId(sessionId)
          setActiveWorkspaceId(nextWorkspaceId)
          setIsWizardOpen(false)
          setIsSessionOpen(true)
        }}
      />
    </section>
  )
}
