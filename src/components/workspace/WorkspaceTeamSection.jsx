import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getWorkspaceRoleLabel } from '../../lib/membershipRoles'
import {
  getCurrentMembership,
  linkMembershipEmployee,
  resolveMembershipEmployeeId,
} from '../../services/membershipService'
import {
  EMPTY_WORKSPACE_PROFILE,
  getWorkspaceProfile,
} from '../../services/workspaceProfileService'
import { WorkspaceLinkEmployeeModal } from './WorkspaceLinkEmployeeModal'

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
    isOwner,
    refreshMembership,
  } = useAuth()

  const [workspaceProfile, setWorkspaceProfile] = useState(
    workspaceProfileProp ?? EMPTY_WORKSPACE_PROFILE,
  )
  const [linkedEmployeeId, setLinkedEmployeeId] = useState(
    () => resolveMembershipEmployeeId(membership),
  )
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [isSavingEmployeeLink, setIsSavingEmployeeLink] = useState(false)
  const [linkEmployeeError, setLinkEmployeeError] = useState('')

  const membershipEmployeeId = resolveMembershipEmployeeId(membership)
  const effectiveLinkedEmployeeId = membershipEmployeeId ?? linkedEmployeeId

  useEffect(() => {
    const nextEmployeeId = resolveMembershipEmployeeId(membership)
    setLinkedEmployeeId(nextEmployeeId)
  }, [membership, membership?.employeeId, membership?.employee_id])

  useEffect(() => {
    if (membershipEmployeeId || !user?.id || !membership?.id) {
      return undefined
    }

    let isMounted = true

    getCurrentMembership(user.id)
      .then((freshMembership) => {
        if (!isMounted) return
        const freshEmployeeId = resolveMembershipEmployeeId(freshMembership)
        if (freshEmployeeId) {
          setLinkedEmployeeId(freshEmployeeId)
        }
      })
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [membership?.id, membershipEmployeeId, user?.id])

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
  const linkedEmployeeName = resolveLinkedEmployeeName(employees, effectiveLinkedEmployeeId)
  const resolvedWorkspace = workspace ?? authWorkspace
  const workspaceDisplayName =
    `${resolvedWorkspace?.name ?? ''}`.trim()
    || `${workspaceProfile?.businessName ?? ''}`.trim()
    || '—'

  const handleOpenLinkModal = () => {
    setSelectedEmployeeId(effectiveLinkedEmployeeId ? String(effectiveLinkedEmployeeId) : '')
    setLinkEmployeeError('')
    setIsLinkModalOpen(true)
  }

  const handleCloseLinkModal = () => {
    if (isSavingEmployeeLink) return
    setIsLinkModalOpen(false)
    setLinkEmployeeError('')
  }

  const handleSaveEmployeeLink = async () => {
    const authUserId = `${membership?.authUserId ?? membership?.auth_user_id ?? user?.id ?? ''}`.trim()
    const employeeId = `${selectedEmployeeId ?? ''}`.trim()

    if (!authUserId) {
      setLinkEmployeeError('Authenticated user is not available.')
      return
    }

    if (!employeeId) {
      setLinkEmployeeError('Select an employee to link.')
      return
    }

    setIsSavingEmployeeLink(true)
    setLinkEmployeeError('')

    try {
      await linkMembershipEmployee(authUserId, employeeId)

      const refreshedMembership = await refreshMembership().catch(() => getCurrentMembership(user?.id))
      const nextEmployeeId = resolveMembershipEmployeeId(refreshedMembership) ?? employeeId
      setLinkedEmployeeId(nextEmployeeId)
      setIsLinkModalOpen(false)
    } catch (error) {
      setLinkEmployeeError(error?.message || 'Unable to link employee right now.')
    } finally {
      setIsSavingEmployeeLink(false)
    }
  }

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
          <div className="workspace-member-row workspace-member-row-linked">
            <dt>Linked employee</dt>
            <dd>
              <div className="workspace-member-linked-value">
                <span>{linkedEmployeeName || 'Not linked'}</span>
                {isOwner ? (
                  <button
                    type="button"
                    className="ghost-btn workspace-link-employee-btn"
                    onClick={handleOpenLinkModal}
                  >
                    Link employee
                  </button>
                ) : null}
              </div>
            </dd>
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

      <WorkspaceLinkEmployeeModal
        isOpen={isLinkModalOpen}
        employees={employees}
        selectedEmployeeId={selectedEmployeeId}
        isSaving={isSavingEmployeeLink}
        errorMessage={linkEmployeeError}
        onSelectEmployeeId={setSelectedEmployeeId}
        onClose={handleCloseLinkModal}
        onSave={handleSaveEmployeeLink}
      />
    </>
  )
}
