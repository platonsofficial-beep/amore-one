/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveMemberAccess } from '../../lib/memberAccess'

const auth = {
  membership: { id: 'm1', displayName: 'Platon', email: 'p@example.com', employeeId: 'emp-1', role: 'owner' },
  role: 'owner',
  roleLabel: 'Owner',
  user: { id: 'u1', email: 'p@example.com' },
  workspace: { id: 'ws', name: 'SENTIO' },
  refreshMembership: vi.fn(),
  permissionAccess: 'owner',
}

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => auth,
}))

import { WorkspaceTeamSection } from './WorkspaceTeamSection'

function renderSection() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onOpenStaffHours = vi.fn()
  act(() => {
    root.render(createElement(WorkspaceTeamSection, {
      employees: [{ id: 'emp-1', name: 'Nina', status: 'active' }],
      managerName: 'Platon',
      workspace: { id: 'ws', name: 'SENTIO' },
      workspaceProfile: { businessName: 'SENTIO', managerName: 'Platon' },
      pendingHours: 2,
      onManageStaff: vi.fn(),
      onOpenStaffHours,
    }))
  })
  return {
    container,
    onOpenStaffHours,
    cleanup() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
})

afterEach(() => {
  auth.role = 'owner'
  auth.permissionAccess = 'owner'
})

describe('Team settings staff hours entry', () => {
  it('shows the row to an owner who can review attendance', () => {
    const view = renderSection()
    const button = view.container.querySelector('.staff-hours-link')
    expect(button?.textContent).toContain('Staff hours')
    expect(button.querySelector('.hours-review-count')?.textContent).toBe('2')
    act(() => button.click())
    expect(view.onOpenStaffHours).toHaveBeenCalledOnce()
    view.cleanup()
  })

  it('hides the row from staff and from a host even with attendance manage', () => {
    auth.role = 'staff'
    auth.permissionAccess = 'staff'
    const staff = renderSection()
    expect(staff.container.querySelector('.staff-hours-link')).toBeNull()
    staff.cleanup()

    auth.role = 'host'
    auth.permissionAccess = resolveMemberAccess('host', [{ module: 'attendance', level: 2 }])
    const host = renderSection()
    expect(host.container.querySelector('.staff-hours-link')).toBeNull()
    host.cleanup()
  })

  it('shows the row to staff who can review attendance, matching the Hours tab', () => {
    auth.role = 'staff'
    auth.permissionAccess = resolveMemberAccess('staff', [{ module: 'attendance', level: 2 }])
    const view = renderSection()
    expect(view.container.querySelector('.staff-hours-link')).not.toBeNull()
    view.cleanup()
  })
})
