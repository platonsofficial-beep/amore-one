import { useEffect, useState } from 'react'
import { getWorkspaceRoleLabel } from '../../lib/membershipRoles'
import { buildInviteUrl, createEmployeeInvite } from '../../services/inviteService'

const INVITE_ROLE_OPTIONS = [
  { value: 'staff', label: 'Staff' },
  { value: 'manager', label: 'Manager' },
]

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

export function EmployeeInviteModal({
  isOpen,
  employee,
  workspaceId,
  canAssignManagerRole = false,
  onClose,
  onInviteCreated,
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('staff')
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [createdInvite, setCreatedInvite] = useState(null)
  const [copyNotice, setCopyNotice] = useState('')

  useEffect(() => {
    if (!isOpen) return

    setEmail(`${employee?.email ?? ''}`.trim())
    setRole('staff')
    setIsSaving(false)
    setErrorMessage('')
    setCreatedInvite(null)
    setCopyNotice('')
  }, [isOpen, employee?.id, employee?.email])

  if (!isOpen || !employee) return null

  const inviteLink = createdInvite?.token ? buildInviteUrl(createdInvite.token) : ''
  const roleOptions = canAssignManagerRole
    ? INVITE_ROLE_OPTIONS
    : INVITE_ROLE_OPTIONS.filter((option) => option.value === 'staff')

  const handleClose = () => {
    if (isSaving) return
    onClose?.()
  }

  const handleCopyLink = async () => {
    if (!inviteLink) return

    try {
      const copied = await copyTextToClipboard(inviteLink)
      setCopyNotice(copied ? 'Link copied.' : 'Unable to copy link.')
    } catch {
      setCopyNotice('Unable to copy link.')
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    const normalizedEmail = `${email ?? ''}`.trim()
    if (!normalizedEmail) {
      setErrorMessage('Email is required.')
      return
    }

    setIsSaving(true)
    setErrorMessage('')
    setCopyNotice('')

    try {
      const invite = await createEmployeeInvite({
        workspaceId,
        employeeId: employee.id,
        email: normalizedEmail,
        role,
      })

      setCreatedInvite(invite)
      onInviteCreated?.(invite)
    } catch (error) {
      setErrorMessage(error?.message || 'Unable to create invite right now.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="employee-modal-backdrop task-modal-backdrop" onClick={handleClose}>
      <div
        className="employee-modal task-form-modal is-responsive-sheet employee-invite-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-invite-title"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Team invite</p>
            <h3 id="employee-invite-title">
              {createdInvite ? 'Invite created' : `Invite ${employee.name}`}
            </h3>
          </div>
          <button type="button" className="icon-btn" onClick={handleClose} aria-label="Close invite modal">
            ✕
          </button>
        </div>

        {errorMessage ? <p className="employee-invite-error" role="alert">{errorMessage}</p> : null}

        {createdInvite ? (
          <div className="employee-invite-success">
            <p className="employee-invite-success-copy">
              Share this link with <strong>{createdInvite.email || email}</strong> so they can sign in and connect as{' '}
              <strong>{getWorkspaceRoleLabel(createdInvite.role)}</strong>.
            </p>

            <label className="form-field full-width">
              <span>Invite link</span>
              <input type="text" readOnly value={inviteLink} onFocus={(event) => event.target.select()} />
            </label>

            {copyNotice ? <p className="employee-invite-copy-notice">{copyNotice}</p> : null}

            <div className="modal-actions employee-invite-actions">
              <button type="button" className="ghost-btn" onClick={handleClose}>
                Done
              </button>
              <button type="button" className="primary-btn" onClick={handleCopyLink}>
                Copy link
              </button>
            </div>
          </div>
        ) : (
          <form className="employee-form employee-invite-form" onSubmit={handleSubmit}>
            <label className="form-field full-width">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                autoComplete="email"
                required
              />
            </label>

            <label className="form-field full-width">
              <span>Role</span>
              <select value={role} onChange={(event) => setRole(event.target.value)} disabled={isSaving}>
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small className="employee-invite-role-hint">
                Staff can access assigned modules. Managers can invite staff but cannot open workspace settings.
              </small>
            </label>

            <div className="modal-actions employee-invite-actions">
              <button type="button" className="ghost-btn" onClick={handleClose} disabled={isSaving}>
                Cancel
              </button>
              <button type="submit" className="primary-btn" disabled={isSaving}>
                {isSaving ? 'Creating…' : 'Create invite'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
