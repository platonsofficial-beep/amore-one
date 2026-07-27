import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import {
  cancelInventoryCountSession,
  deleteInventoryCountSession,
  getInventoryCountSession,
  listInventoryCountHomeSessions,
  postInventoryCountFinish,
  previewInventoryCountFinish,
} from '../../services/inventoryCountService'
import { InventoryCountWizard } from './InventoryCountWizard'
import { InventoryCountSessionWorkspace } from './InventoryCountSessionWorkspace'
import { InventoryCountPostedReview } from './InventoryCountPostedReview'
import { InventoryCountCorrectionReview } from './InventoryCountCorrectionReview'

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
  if (session?.progressLabel) return session.progressLabel
  // Fallback for older payloads
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

function InventoryCountSessionCardMeta({ session, onDelete, deleteDisabled = false }) {
  const lastUpdate = session.updatedAt || session.postedAt || session.pausedAt || session.startedAt
  const operator = `${session.operatorName ?? ''}`.trim() || '—'

  return (
    <>
      <div className="inventory-count-session-card-top">
        <strong className="inventory-count-session-card-title">{session.countTypeLabel}</strong>
        <div className="inventory-count-session-card-top-end">
          <span className="inventory-count-session-pill is-status">
            {session.statusLabel}
          </span>
          <button
            type="button"
            className="inventory-count-session-delete-btn"
            aria-label={`Delete ${session.countTypeLabel} inventory count`}
            title="Delete inventory count"
            disabled={deleteDisabled}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onDelete?.(session)
            }}
          >
            ×
          </button>
        </div>
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

function InventoryCountDeleteDialog({
  session,
  isDeleting,
  error,
  onCancel,
  onConfirm,
}) {
  if (!session) return null

  return (
    <div
      className="employee-modal-backdrop inventory-count-delete-dialog-overlay"
      role="presentation"
      onClick={() => {
        if (!isDeleting) onCancel?.()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-count-delete-title"
        aria-describedby="inventory-count-delete-body"
        className="inventory-count-delete-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="inventory-count-delete-title" className="inventory-count-delete-dialog-title">
          Delete Inventory Count?
        </h2>
        <div id="inventory-count-delete-body" className="inventory-count-delete-dialog-body">
          <p>Are you sure you want to permanently delete this inventory count?</p>
          <p>This action cannot be undone.</p>
        </div>
        {error ? (
          <p className="inventory-count-session-card-error" role="alert">{error}</p>
        ) : null}
        <div className="inventory-count-delete-dialog-actions">
          <button
            type="button"
            className="ghost-btn"
            disabled={isDeleting}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-btn inventory-count-delete-confirm-btn"
            disabled={isDeleting}
            onClick={onConfirm}
          >
            {isDeleting ? 'Deleting…' : 'Delete Count'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InventoryCountSessionCard({
  session,
  onOpen,
  onReview,
  onPost,
  onCancel,
  onDelete,
  busyAction,
  actionError,
}) {
  const isCountingComplete = session.status === 'counting_complete'
  const isPosted = session.status === 'posted'
  const canOpenActive = OPENABLE_STATUSES.has(session.status) && !isCountingComplete
  const canOpen = canOpenActive || isPosted
  const isBusy = Boolean(busyAction)

  if (isCountingComplete) {
    return (
      <div
        className={`inventory-count-session-card is-${session.status} has-actions`}
        aria-label={`${session.countTypeLabel}, ${session.statusLabel}`}
      >
        <InventoryCountSessionCardMeta
          session={session}
          onDelete={onDelete}
          deleteDisabled={isBusy}
        />
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
    <div
      className={`inventory-count-session-card is-${session.status}${canOpen ? '' : ' is-readonly'}`}
      role={canOpen ? 'button' : undefined}
      tabIndex={canOpen && !isBusy ? 0 : undefined}
      aria-disabled={canOpen ? undefined : true}
      aria-label={`${session.countTypeLabel}, ${session.statusLabel}`}
      data-inventory-count-card-openable={canOpen ? 'true' : 'false'}
      onClick={() => {
        if (canOpen && !isBusy) onOpen?.(session)
      }}
      onKeyDown={(event) => {
        if (!canOpen || isBusy) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onOpen?.(session)
        }
      }}
    >
      <InventoryCountSessionCardMeta
        session={session}
        onDelete={onDelete}
        deleteDisabled={isBusy}
      />
      {actionError ? (
        <p className="inventory-count-session-card-error" role="alert">{actionError}</p>
      ) : null}
    </div>
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
  onDeleteSession,
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
                onDelete={onDeleteSession}
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

export function InventoryCountView({
  initialOpenSessionId = null,
  onInitialOpenSessionApplied,
} = {}) {
  const { workspace } = useAuth()
  const workspaceId = `${workspace?.id ?? ''}`.trim()

  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [isSessionOpen, setIsSessionOpen] = useState(false)
  const [isPostedReviewOpen, setIsPostedReviewOpen] = useState(false)
  const [isCorrectionReviewOpen, setIsCorrectionReviewOpen] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState('')
  const [activeWorkspaceId, setActiveWorkspaceId] = useState('')
  const [postedReviewSessionId, setPostedReviewSessionId] = useState('')
  const [postedReviewWorkspaceId, setPostedReviewWorkspaceId] = useState('')
  const [pageNotice, setPageNotice] = useState('')
  const [isLoadingSessions, setIsLoadingSessions] = useState(Boolean(workspaceId))
  const [loadError, setLoadError] = useState('')
  const [activeSessions, setActiveSessions] = useState([])
  const [pausedSessions, setPausedSessions] = useState([])
  const [recentSessions, setRecentSessions] = useState([])
  const [busySessionId, setBusySessionId] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [actionErrors, setActionErrors] = useState({})
  const [pendingDeleteSession, setPendingDeleteSession] = useState(null)
  const [deleteDialogError, setDeleteDialogError] = useState('')
  const pendingOpenSessionIdRef = useRef('')

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

  useEffect(() => {
    const fromProp = `${initialOpenSessionId ?? ''}`.trim()
    if (fromProp) {
      pendingOpenSessionIdRef.current = fromProp
      onInitialOpenSessionApplied?.()
    }

    const sessionId = pendingOpenSessionIdRef.current
    if (!sessionId) return undefined

    if (!workspaceId) {
      pendingOpenSessionIdRef.current = ''
      setPageNotice('That inventory count could not be opened right now.')
      return undefined
    }

    let cancelled = false

    const openLinkedSession = async () => {
      try {
        const session = await getInventoryCountSession({
          workspaceId,
          sessionId,
        })
        if (cancelled) return

        if (session.status === 'posted') {
          pendingOpenSessionIdRef.current = ''
          setIsSessionOpen(false)
          setActiveSessionId('')
          setActiveWorkspaceId('')
          setPostedReviewSessionId(session.id)
          setPostedReviewWorkspaceId(`${session.workspaceId || workspaceId}`)
          setIsPostedReviewOpen(true)
          setIsCorrectionReviewOpen(false)
          setPageNotice('')
          return
        }

        if (!OPENABLE_STATUSES.has(session.status)) {
          pendingOpenSessionIdRef.current = ''
          setIsSessionOpen(false)
          setActiveSessionId('')
          setActiveWorkspaceId('')
          setIsPostedReviewOpen(false)
          setIsCorrectionReviewOpen(false)
          setPostedReviewSessionId('')
          setPostedReviewWorkspaceId('')
          setPageNotice('That inventory count is no longer open.')
          void loadHomeSessions()
          return
        }

        pendingOpenSessionIdRef.current = ''
        setPageNotice('')
        setIsPostedReviewOpen(false)
        setIsCorrectionReviewOpen(false)
        setPostedReviewSessionId('')
        setPostedReviewWorkspaceId('')
        setActiveSessionId(session.id)
        setActiveWorkspaceId(`${session.workspaceId || workspaceId}`)
        setIsSessionOpen(true)
      } catch {
        if (cancelled) return
        pendingOpenSessionIdRef.current = ''
        setIsSessionOpen(false)
        setActiveSessionId('')
        setActiveWorkspaceId('')
        setPageNotice('That inventory count could not be found. It may already be closed.')
        void loadHomeSessions()
      }
    }

    void openLinkedSession()
    return () => {
      cancelled = true
    }
  }, [
    initialOpenSessionId,
    workspaceId,
    loadHomeSessions,
    onInitialOpenSessionApplied,
  ])

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
    setIsPostedReviewOpen(false)
    setIsCorrectionReviewOpen(false)
    setPostedReviewSessionId('')
    setPostedReviewWorkspaceId('')
    setActiveSessionId(sessionId)
    setActiveWorkspaceId(nextWorkspaceId)
    setIsSessionOpen(true)
  }

  const openPostedReview = (session) => {
    const sessionId = `${session?.id ?? ''}`.trim()
    const nextWorkspaceId = `${session?.workspaceId ?? workspaceId}`.trim()
    if (!sessionId || !nextWorkspaceId) return
    if (session.status !== 'posted') return

    setPageNotice('')
    clearActionError(sessionId)
    setIsSessionOpen(false)
    setActiveSessionId('')
    setActiveWorkspaceId('')
    setPostedReviewSessionId(sessionId)
    setPostedReviewWorkspaceId(nextWorkspaceId)
    setIsCorrectionReviewOpen(false)
    setIsPostedReviewOpen(true)
  }

  const handleOpenHomeCard = (session) => {
    if (session?.status === 'posted') {
      openPostedReview(session)
      return
    }
    openSession(session)
  }

  const handleExitSession = () => {
    setIsSessionOpen(false)
    setActiveSessionId('')
    setActiveWorkspaceId('')
    void loadHomeSessions()
  }

  const handleExitPostedReview = () => {
    setIsPostedReviewOpen(false)
    setIsCorrectionReviewOpen(false)
    setPostedReviewSessionId('')
    setPostedReviewWorkspaceId('')
    void loadHomeSessions()
  }

  const handleOpenCorrectionReview = () => {
    if (!postedReviewSessionId) return
    setIsCorrectionReviewOpen(true)
  }

  const handleCancelCorrectionReview = () => {
    setIsCorrectionReviewOpen(false)
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

  const handleRequestDeleteSession = (session) => {
    const sessionId = `${session?.id ?? ''}`.trim()
    if (!sessionId || busySessionId) return
    clearActionError(sessionId)
    setDeleteDialogError('')
    setPendingDeleteSession(session)
  }

  const handleCloseDeleteDialog = () => {
    if (busyAction === 'delete') return
    setPendingDeleteSession(null)
    setDeleteDialogError('')
  }

  const handleConfirmDeleteSession = async () => {
    const session = pendingDeleteSession
    const sessionId = `${session?.id ?? ''}`.trim()
    const nextWorkspaceId = `${session?.workspaceId ?? workspaceId}`.trim()
    if (!sessionId || !nextWorkspaceId || (busySessionId && busySessionId !== sessionId)) return

    setBusySessionId(sessionId)
    setBusyAction('delete')
    setDeleteDialogError('')
    setPageNotice('')

    try {
      await deleteInventoryCountSession({
        workspaceId: nextWorkspaceId,
        sessionId,
      })
      setPendingDeleteSession(null)
      setPageNotice('Inventory count deleted.')
      await loadHomeSessions()
    } catch (error) {
      setDeleteDialogError(error?.message || 'Unable to delete inventory count right now.')
    } finally {
      setBusySessionId('')
      setBusyAction('')
    }
  }

  if (isCorrectionReviewOpen) {
    return (
      <InventoryCountCorrectionReview
        sessionId={postedReviewSessionId}
        workspaceId={postedReviewWorkspaceId || workspaceId}
        onCancel={handleCancelCorrectionReview}
      />
    )
  }

  if (isPostedReviewOpen) {
    return (
      <InventoryCountPostedReview
        sessionId={postedReviewSessionId}
        workspaceId={postedReviewWorkspaceId || workspaceId}
        onClose={handleExitPostedReview}
        onSuggestCorrection={handleOpenCorrectionReview}
      />
    )
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
          onDeleteSession={handleRequestDeleteSession}
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
          onDeleteSession={handleRequestDeleteSession}
          busySessionId={busySessionId}
          busyAction={busyAction}
          actionErrors={actionErrors}
        />
        <InventoryCountSessionPanel
          title="Recent counts"
          sessions={recentSessions}
          emptyTitle="No completed counts yet."
          emptyCopy=""
          isLoading={isLoadingSessions}
          onOpenSession={handleOpenHomeCard}
          onDeleteSession={handleRequestDeleteSession}
          busySessionId={busySessionId}
          busyAction={busyAction}
          actionErrors={actionErrors}
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

      <InventoryCountDeleteDialog
        session={pendingDeleteSession}
        isDeleting={busyAction === 'delete' && busySessionId === pendingDeleteSession?.id}
        error={deleteDialogError}
        onCancel={handleCloseDeleteDialog}
        onConfirm={() => {
          void handleConfirmDeleteSession()
        }}
      />
    </section>
  )
}
