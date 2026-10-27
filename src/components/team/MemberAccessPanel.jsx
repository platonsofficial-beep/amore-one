import { useEffect, useState } from 'react'
import {
  MEMBER_ACCESS_AREAS,
  canShowMemberAccess,
  isMemberAccessEditable,
  levelsForMember,
  presetLabelForRole,
  presetLevelsForRole,
} from '../../lib/memberAccess'
import { getEmployeeLinkedMembership } from '../../services/inviteService'
import {
  fetchMemberPermissionRows,
  saveMemberPermissionLevels,
} from '../../services/memberPermissionService'

const LEVEL_OPTIONS = [
  { id: 'none', label: 'None' },
  { id: 'view', label: 'View' },
  { id: 'manage', label: 'Manage' },
]

function levelOptionsFor(area) {
  if (area.module !== 'stock') return LEVEL_OPTIONS
  return LEVEL_OPTIONS.map((option) => (
    option.id === 'view' ? { ...option, label: 'View & count' } : option
  ))
}

function levelsEqual(left, right) {
  return MEMBER_ACCESS_AREAS.every((area) => left?.[area.module] === right?.[area.module])
}

export function MemberAccessPanel({
  actorRole = '',
  workspaceId = '',
  employeeId = '',
  actorMemberId = '',
  actorUserId = '',
  loadLinkedMembership = getEmployeeLinkedMembership,
  loadPermissionRows = fetchMemberPermissionRows,
  savePermissionRows = saveMemberPermissionLevels,
}) {
  const [linkedMembership, setLinkedMembership] = useState(null)
  const [draft, setDraft] = useState(null)
  const [saved, setSaved] = useState(null)
  const [status, setStatus] = useState('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [notice, setNotice] = useState('')

  const normalizedWorkspaceId = `${workspaceId ?? ''}`.trim()
  const normalizedEmployeeId = `${employeeId ?? ''}`.trim()
  const visible = canShowMemberAccess(actorRole)

  useEffect(() => {
    if (!visible || !normalizedWorkspaceId || !normalizedEmployeeId) {
      setLinkedMembership(null)
      setDraft(null)
      setSaved(null)
      setStatus('idle')
      setErrorMessage('')
      setNotice('')
      return undefined
    }

    let cancelled = false
    setStatus('loading')
    setErrorMessage('')
    setNotice('')

    async function load() {
      try {
        const membership = await loadLinkedMembership(normalizedWorkspaceId, normalizedEmployeeId)
        if (cancelled) return
        setLinkedMembership(membership)

        if (!membership?.id) {
          setDraft(null)
          setSaved(null)
          setStatus('unlinked')
          return
        }

        if (!isMemberAccessEditable({
          actorRole,
          targetRole: membership.role,
          targetMemberId: membership.id,
          actorMemberId,
        })) {
          setDraft(null)
          setSaved(null)
          setStatus('locked')
          return
        }

        let rows = null
        try {
          rows = await loadPermissionRows(normalizedWorkspaceId, membership.id)
        } catch (loadError) {
          console.error('[MemberAccessPanel] permission load error:', loadError)
          rows = null
        }
        if (cancelled) return

        const levels = levelsForMember(membership.role, rows)
        setDraft(levels)
        setSaved(levels)
        setStatus(rows == null ? 'preset' : 'ready')
      } catch (error) {
        if (cancelled) return
        setStatus('error')
        setErrorMessage(error?.message || 'Unable to load access right now.')
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [
    visible,
    actorRole,
    normalizedWorkspaceId,
    normalizedEmployeeId,
    actorMemberId,
    loadLinkedMembership,
    loadPermissionRows,
  ])

  if (!visible) return null

  const editable = Boolean(draft) && (status === 'ready' || status === 'preset' || status === 'saving')
  const dirty = editable && draft && saved && !levelsEqual(draft, saved)
  const presetName = presetLabelForRole(linkedMembership?.role)

  const setLevel = (module, level) => {
    setNotice('')
    setErrorMessage('')
    setDraft((current) => ({ ...current, [module]: level }))
  }

  const persistLevels = async (levels, successNotice) => {
    if (!linkedMembership?.id) return
    setStatus('saving')
    setErrorMessage('')
    setNotice('')
    try {
      await savePermissionRows({
        workspaceId: normalizedWorkspaceId,
        memberId: linkedMembership.id,
        levels,
        updatedBy: `${actorUserId ?? ''}`.trim() || null,
      })
      setDraft(levels)
      setSaved(levels)
      setStatus('ready')
      setNotice(successNotice)
    } catch (error) {
      setStatus('ready')
      setErrorMessage(error?.message || 'Unable to save access right now.')
    }
  }

  const handleSave = () => {
    if (!draft || status === 'saving') return
    persistLevels(draft, 'Access saved')
  }

  const handleReset = () => {
    if (!linkedMembership || status === 'saving') return
    const preset = presetLevelsForRole(linkedMembership.role)
    persistLevels(preset, 'Access reset to the role default.')
  }

  return (
    <section className="employee-profile-drawer-section member-access" aria-label="Access">
      <h4 className="employee-profile-drawer-section-title">Access</h4>
      {linkedMembership?.role ? <p className="member-access-preset">Preset: {presetName}</p> : null}

      {status === 'loading' || status === 'saving' ? (
        <p className="member-access-status">{status === 'saving' ? 'Saving access…' : 'Loading access…'}</p>
      ) : null}
      {status === 'unlinked' ? (
        <p className="member-access-status">No ONE account yet. Invite them before setting access.</p>
      ) : null}
      {status === 'locked' ? (
        <p className="member-access-locked">Full access (owner)</p>
      ) : null}
      {errorMessage ? (
        <div className="staff-status-banner auth-banner-error" role="alert">{errorMessage}</div>
      ) : null}
      {notice ? (
        <div className="staff-status-banner auth-banner-success" role="status" aria-live="polite">{notice}</div>
      ) : null}

      {editable && draft ? (
        <>
          <ul className="member-access-list">
            {MEMBER_ACCESS_AREAS.map((area) => (
              <li key={area.module} className="member-access-row">
                <div className="member-access-copy">
                  <p className="member-access-label">
                    <span className="member-access-icon" aria-hidden="true">{area.icon}</span>
                    {area.label}
                  </p>
                  <p className="member-access-hint">{area.hint}</p>
                  {area.note ? <p className="member-access-note">{area.note}</p> : null}
                </div>
                {area.control === 'toggle' ? (
                  <div className="member-access-choices" role="group" aria-label={area.label}>
                    {[
                      { id: 'none', label: 'Off' },
                      { id: 'manage', label: 'On' },
                    ].map((option) => {
                      const selected = option.id === 'manage'
                        ? draft[area.module] !== 'none'
                        : draft[area.module] === 'none'
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`member-access-choice${selected ? ' is-selected' : ''}`}
                          aria-pressed={selected}
                          onClick={() => setLevel(area.module, option.id)}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="member-access-choices" role="group" aria-label={area.label}>
                    {levelOptionsFor(area).map((option) => {
                      const selected = draft[area.module] === option.id
                      return (
                        <button
                          key={option.id}
                          type="button"
                          className={`member-access-choice${selected ? ' is-selected' : ''}`}
                          aria-pressed={selected}
                          onClick={() => setLevel(area.module, option.id)}
                        >
                          {option.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="member-access-actions">
            <button
              type="button"
              className="ghost-btn member-access-action"
              onClick={handleReset}
              disabled={status === 'saving'}
            >
              Reset to role default
            </button>
            <button
              type="button"
              className="primary-btn member-access-action"
              onClick={handleSave}
              disabled={status === 'saving' || !dirty}
            >
              Save
            </button>
          </div>
        </>
      ) : null}
    </section>
  )
}
