import { useCallback, useEffect, useState } from 'react'
import {
  buildInviteUrl,
  getEmployeeAccountConnectionStatus,
  revokeInvite,
} from '../../services/inviteService'
import { EmployeeInviteModal } from './EmployeeInviteModal'

function formatInviteExpiryDate(value) {
  const timestamp = Date.parse(value ?? '')
  if (!Number.isFinite(timestamp)) return '—'

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

async function copyTextToClipboard(text) {
  const value = `${text ?? ''}`.trim()
  if (!value) return false

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return true
  }

  if (typeof document === 'undefined') return false

  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()

  let copied = false

  try {
    copied = document.execCommand('copy')
  } catch {
    copied = false
  }

  document.body.removeChild(textarea)
  return copied
}

export function EmployeeAccountConnectionSection({
  employee,
  workspaceId,
  canManageInvites = false,
  canAssignManagerRole = false,
}) {
  const [connectionStatus, setConnectionStatus] = useState({
    pendingInvite: null,
    linkedMembership: null,
    acceptedInvite: null,
    isConnected: false,
  })
  const [isLoading, setIsLoading] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [actionError, setActionError] = useState('')
  const [copyNotice, setCopyNotice] = useState('')
  const [isRevoking, setIsRevoking] = useState(false)
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false)

  const employeeId = `${employee?.id ?? ''}`.trim()
  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()

  const loadConnectionStatus = useCallback(async () => {
    if (!employeeId || !normalizedWorkspaceId) {
      setConnectionStatus({
        pendingInvite: null,
        linkedMembership: null,
        acceptedInvite: null,
        isConnected: false,
      })
      return
    }

    setIsLoading(true)
    setStatusError('')

    try {
      const nextStatus = await getEmployeeAccountConnectionStatus(normalizedWorkspaceId, employeeId)
      setConnectionStatus(nextStatus)
    } catch (error) {
      setStatusError(error?.message || 'Unable to load account connection status.')
      setConnectionStatus({
        pendingInvite: null,
        linkedMembership: null,
        acceptedInvite: null,
        isConnected: false,
      })
    } finally {
      setIsLoading(false)
    }
  }, [employeeId, normalizedWorkspaceId])

  useEffect(() => {
    setActionError('')
    setCopyNotice('')
    loadConnectionStatus()
  }, [loadConnectionStatus])

  if (!employee) return null

  const { pendingInvite, linkedMembership, isConnected } = connectionStatus
  const connectedEmail = linkedMembership?.email || connectionStatus.acceptedInvite?.email || ''
  const showPending = Boolean(pendingInvite?.id) && !isConnected

  const handleCopyInviteLink = async () => {
    if (!pendingInvite?.token) return

    setActionError('')
    setCopyNotice('')

    try {
      const copied = await copyTextToClipboard(buildInviteUrl(pendingInvite.token))
      setCopyNotice(copied ? 'Invite link copied.' : 'Unable to copy invite link.')
    } catch {
      setActionError('Unable to copy invite link.')
    }
  }

  const handleRevokeInvite = async () => {
    if (!pendingInvite?.id || isRevoking) return

    setIsRevoking(true)
    setActionError('')
    setCopyNotice('')

    try {
      await revokeInvite(pendingInvite.id)
      await loadConnectionStatus()
    } catch (error) {
      setActionError(error?.message || 'Unable to revoke invite right now.')
    } finally {
      setIsRevoking(false)
    }
  }

  const handleInviteCreated = async () => {
    setIsInviteModalOpen(false)
    await loadConnectionStatus()
  }

  return (
    <>
      <section className="employee-account-connection" aria-label="ONE account connection">
        <div className="employee-account-connection-header">
          <p className="eyebrow">ONE account</p>
          <h4>Account connection</h4>
        </div>

        {isLoading ? <p className="employee-account-connection-status">Checking connection…</p> : null}
        {statusError ? <p className="employee-account-connection-error" role="alert">{statusError}</p> : null}
        {actionError ? <p className="employee-account-connection-error" role="alert">{actionError}</p> : null}
        {copyNotice ? <p className="employee-account-connection-notice">{copyNotice}</p> : null}

        {!isLoading && isConnected ? (
          <div className="employee-account-connection-card is-connected">
            <p className="employee-account-connection-label">ONE account active</p>
            {connectedEmail ? (
              <p className="employee-account-connection-meta">{connectedEmail}</p>
            ) : null}
          </div>
        ) : null}

        {!isLoading && !isConnected && showPending ? (
          <div className="employee-account-connection-card is-pending">
            <p className="employee-account-connection-label">Invite pending</p>
            <dl className="employee-account-connection-details">
              <div className="employee-account-connection-detail-row">
                <dt>Invited email</dt>
                <dd>{pendingInvite.email || '—'}</dd>
              </div>
              <div className="employee-account-connection-detail-row">
                <dt>Expires</dt>
                <dd>{formatInviteExpiryDate(pendingInvite.expiresAt)}</dd>
              </div>
            </dl>

            {canManageInvites ? (
              <div className="employee-account-connection-actions">
                <button
                  type="button"
                  className="ghost-btn employee-account-connection-btn"
                  onClick={handleCopyInviteLink}
                >
                  Copy link
                </button>
                <button
                  type="button"
                  className="ghost-btn employee-account-connection-btn"
                  onClick={handleRevokeInvite}
                  disabled={isRevoking}
                >
                  {isRevoking ? 'Revoking…' : 'Revoke invite'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        {!isLoading && !isConnected && !showPending ? (
          <div className="employee-account-connection-card is-disconnected">
            <p className="employee-account-connection-label">Not connected to ONE</p>
            {canManageInvites ? (
              <button
                type="button"
                className="primary-btn employee-account-connection-btn"
                onClick={() => setIsInviteModalOpen(true)}
              >
                Invite to ONE
              </button>
            ) : (
              <p className="employee-account-connection-meta">No linked sign-in account yet.</p>
            )}
          </div>
        ) : null}
      </section>

      <EmployeeInviteModal
        isOpen={isInviteModalOpen}
        employee={employee}
        workspaceId={normalizedWorkspaceId}
        canAssignManagerRole={canAssignManagerRole}
        onClose={() => setIsInviteModalOpen(false)}
        onInviteCreated={handleInviteCreated}
      />
    </>
  )
}
