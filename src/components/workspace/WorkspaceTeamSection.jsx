import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getWorkspaceRoleLabel } from '../../lib/membershipRoles'
import {
  EMPTY_WORKSPACE_PROFILE,
  getWorkspaceProfile,
} from '../../services/workspaceProfileService'

function countActiveStaff(employees = []) {
  return employees.filter((employee) => {
    const status = `${employee?.status ?? ''}`.trim().toLowerCase()
    if (!status) return true
    return status === 'working' || status === 'active'
  }).length
}

function resolveLinkedEmployeeName(employees, employeeId) {
  if (!employeeId) return null
  const match = employees.find((employee) => String(employee.id) === String(employeeId))
  return `${match?.name ?? match?.fullName ?? ''}`.trim() || null
}

export function WorkspaceTeamSection({
  employees = [],
  managerName = '',
  onManageStaff,
  workspace = null,
  workspaceProfile: workspaceProfileProp = null,
}) {
  const {
    membership,
    role,
    roleLabel,
    user,
    workspace: authWorkspace,
  } = useAuth()

  const [workspaceProfile, setWorkspaceProfile] = useState(
    workspaceProfileProp ?? EMPTY_WORKSPACE_PROFILE,
  )

  useEffect(() => {
    if (workspaceProfileProp) {
      setWorkspaceProfile(workspaceProfileProp)
      return undefined
    }

    let isMounted = true

    getWorkspaceProfile()
      .then((profile) => {
        if (isMounted) {
          setWorkspaceProfile(profile)
        }
      })
      .catch(() => {
        if (isMounted) {
          setWorkspaceProfile(EMPTY_WORKSPACE_PROFILE)
        }
      })

    return () => {
      isMounted = false
    }
  }, [workspaceProfileProp])

  const totalStaff = employees.length
  const activeStaff = countActiveStaff(employees)
  const trimmedManager = `${managerName ?? ''}`.trim()
  const memberDisplayName = `${membership?.displayName ?? ''}`.trim() || trimmedManager || 'Not set'
  const resolvedRoleLabel = roleLabel || getWorkspaceRoleLabel(role)
  const memberEmail = `${membership?.email ?? user?.email ?? ''}`.trim()
  const linkedEmployeeName = resolveLinkedEmployeeName(employees, membership?.employeeId)
  const resolvedWorkspace = workspace ?? authWorkspace
  const workspaceDisplayName =
    `${resolvedWorkspace?.name ?? ''}`.trim()
    || `${workspaceProfile?.businessName ?? ''}`.trim()
    || '—'

  return (
    <>
      <div className="workspace-section-header">
        <div>
          <p className="eyebrow">Workspace</p>
          <h3 className="workspace-section-heading">
            <span className="workspace-section-icon" aria-hidden="true">👥</span>
            Team
          </h3>
          <p className="workspace-section-subtitle">
            Your workspace membership and staff overview.
          </p>
        </div>
        <button type="button" className="ghost-btn workspace-action-btn workspace-link-btn" onClick={onManageStaff}>
          Manage Staff →
        </button>
      </div>

      <div className="panel staff-panel workspace-panel workspace-member-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Signed in member</p>
            <h3>Current user</h3>
          </div>
        </div>
        <dl className="workspace-member-details">
          <div className="workspace-member-row">
            <dt>Name</dt>
            <dd>{memberDisplayName}</dd>
          </div>
          <div className="workspace-member-row">
            <dt>Role</dt>
            <dd><span className="user-menu-role-badge">{resolvedRoleLabel}</span></dd>
          </div>
          <div className="workspace-member-row">
            <dt>Email</dt>
            <dd>{memberEmail || '—'}</dd>
          </div>
          <div className="workspace-member-row">
            <dt>Linked employee</dt>
            <dd>{linkedEmployeeName || 'Not linked'}</dd>
          </div>
          <div className="workspace-member-row">
            <dt>Workspace</dt>
            <dd>{workspaceDisplayName}</dd>
          </div>
        </dl>
      </div>

      <div className="workspace-team-grid">
        <article className="workspace-stat-card panel staff-panel">
          <p className="workspace-stat-label">Total staff</p>
          <p className="workspace-stat-value">{totalStaff}</p>
        </article>
        <article className="workspace-stat-card panel staff-panel">
          <p className="workspace-stat-label">Active staff</p>
          <p className="workspace-stat-value">{totalStaff > 0 ? activeStaff : '—'}</p>
        </article>
        <article className="workspace-stat-card panel staff-panel workspace-stat-card-wide">
          <p className="workspace-stat-label">Manager</p>
          <p className="workspace-stat-value workspace-stat-value-text">
            {trimmedManager || 'Not set — configure in Business Profile'}
          </p>
        </article>
      </div>
    </>
  )
}
