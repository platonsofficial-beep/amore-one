import { useEffect, useState } from 'react'
import { formatVenueDateTime } from '../../lib/timeFormatUtils'
import {
  checkInventoryImportUndoEligibility as checkInventoryImportUndoEligibilityDefault,
  formatInventoryImportWizardError,
  isInventoryImportFunctionMissing,
  undoInventoryImportSession as undoInventoryImportSessionDefault,
} from '../../services/inventoryImportService'
import { listRecentInventoryImportSessions as listRecentInventoryImportSessionsDefault } from '../../services/inventoryImportHistoryService'
import { InventoryImportUndoConfirm } from './InventoryImportUndoConfirm'

export function InventoryImportHistoryList({
  workspaceId = '',
  timeZone = '',
  refreshKey = 0,
  listRecentInventoryImportSessions = listRecentInventoryImportSessionsDefault,
  checkInventoryImportUndoEligibility = checkInventoryImportUndoEligibilityDefault,
  undoInventoryImportSession = undoInventoryImportSessionDefault,
}) {
  const [sessions, setSessions] = useState([])
  const [eligibilityById, setEligibilityById] = useState({})
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [confirmSessionId, setConfirmSessionId] = useState('')
  const [undoError, setUndoError] = useState('')
  const [isUndoing, setIsUndoing] = useState(false)

  useEffect(() => {
    const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
    if (!normalizedWorkspaceId) {
      setSessions([])
      setEligibilityById({})
      setLoadError('')
      setIsLoading(false)
      return undefined
    }

    let cancelled = false
    setIsLoading(true)
    setLoadError('')
    listRecentInventoryImportSessions({ workspaceId: normalizedWorkspaceId })
      .then((rows) => {
        if (cancelled) return
        setSessions(Array.isArray(rows) ? rows : [])
      })
      .catch((error) => {
        if (cancelled) return
        setSessions([])
        setLoadError(error?.message || 'Could not load recent imports.')
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [workspaceId, refreshKey, listRecentInventoryImportSessions])

  useEffect(() => {
    const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
    const completed = sessions.filter((session) => session.status === 'completed')
    if (!normalizedWorkspaceId || completed.length === 0) {
      setEligibilityById({})
      return undefined
    }

    let cancelled = false
    setEligibilityById({})
    Promise.all(completed.map(async (session) => {
      try {
        const result = await checkInventoryImportUndoEligibility({
          workspaceId: normalizedWorkspaceId,
          sessionId: session.id,
        })
        return [session.id, {
          allowed: result?.allowed === true,
          reasons: Array.isArray(result?.reasons) ? result.reasons.filter(Boolean) : [],
          hidden: false,
        }]
      } catch (error) {
        if (isInventoryImportFunctionMissing(error)) {
          return [session.id, { allowed: false, reasons: [], hidden: true }]
        }
        return [session.id, {
          allowed: false,
          reasons: [formatInventoryImportWizardError(error, 'This import cannot be undone right now.')],
          hidden: false,
        }]
      }
    })).then((entries) => {
      if (!cancelled) setEligibilityById(Object.fromEntries(entries))
    })

    return () => {
      cancelled = true
    }
  }, [sessions, workspaceId, checkInventoryImportUndoEligibility])

  async function handleConfirmUndo() {
    const sessionId = `${confirmSessionId ?? ''}`.trim()
    const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
    if (!sessionId || !normalizedWorkspaceId || isUndoing) return
    setIsUndoing(true)
    setUndoError('')
    try {
      await undoInventoryImportSession({
        workspaceId: normalizedWorkspaceId,
        sessionId,
      })
      setConfirmSessionId('')
      setSessions((current) => current.map((session) => (
        session.id === sessionId
          ? { ...session, status: 'cancelled', statusLabel: 'Cancelled' }
          : session
      )))
      setEligibilityById((current) => {
        const next = { ...current }
        delete next[sessionId]
        return next
      })
    } catch (error) {
      setUndoError(formatInventoryImportWizardError(error, 'Failed to undo this import.'))
    } finally {
      setIsUndoing(false)
    }
  }

  return (
    <section className="inventory-import-history" aria-label="Recent imports" data-import-history="list">
      <header className="inventory-import-history-header">
        <h3 className="inventory-import-history-title">Recent imports</h3>
        <p className="inventory-import-history-copy">
          The last few imports for this workspace stay here after you leave Import Complete.
        </p>
      </header>

      {isLoading ? (
        <p className="inventory-import-history-status" role="status">Loading recent imports…</p>
      ) : null}
      {loadError ? (
        <p className="inventory-import-history-error" role="alert">{loadError}</p>
      ) : null}
      {!isLoading && !loadError && sessions.length === 0 ? (
        <p className="inventory-import-history-status">No imports yet.</p>
      ) : null}

      {sessions.length > 0 ? (
        <ul className="inventory-import-history-list">
          {sessions.map((session) => {
            const eligibility = eligibilityById[session.id]
            const showUndo = session.status === 'completed' && eligibility?.allowed === true
            const reasons = session.status === 'completed' && eligibility && !eligibility.allowed && !eligibility.hidden
              ? eligibility.reasons
              : []
            return (
              <li
                key={session.id}
                className="inventory-import-history-item"
                data-import-history-session={session.id}
              >
                <p className="inventory-import-history-when">
                  {formatVenueDateTime(session.occurredAt, timeZone)}
                </p>
                <p className="inventory-import-history-who">{session.actorName || 'Unknown'}</p>
                {session.sourceFilename ? (
                  <p className="inventory-import-history-file">{session.sourceFilename}</p>
                ) : null}
                <p className="inventory-import-history-counts">
                  Created {session.createdCount} · Linked {session.linkedCount}
                </p>
                <p className="inventory-import-history-status-label">{session.statusLabel}</p>
                {showUndo ? (
                  <button
                    type="button"
                    className="ghost-btn inventory-import-undo-btn"
                    data-undo-import="open"
                    onClick={() => {
                      setUndoError('')
                      setConfirmSessionId(session.id)
                    }}
                  >
                    Undo import
                  </button>
                ) : null}
                {reasons.length > 0 ? (
                  <ul className="inventory-import-history-reasons" data-import-undo-reasons={session.id}>
                    {reasons.map((reason, index) => (
                      <li key={`${session.id}-${index}`}>{reason}</li>
                    ))}
                  </ul>
                ) : null}
                {session.status === 'completed' && eligibility && !eligibility.allowed && !eligibility.hidden && reasons.length === 0 ? (
                  <p className="inventory-import-history-reasons">This import cannot be undone.</p>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {undoError ? (
        <p className="inventory-import-history-error" role="alert">{undoError}</p>
      ) : null}
      {confirmSessionId ? (
        <InventoryImportUndoConfirm
          titleId="inventory-import-history-undo-title"
          onCancel={() => {
            if (!isUndoing) setConfirmSessionId('')
          }}
          onConfirm={handleConfirmUndo}
          isUndoing={isUndoing}
        />
      ) : null}
    </section>
  )
}
