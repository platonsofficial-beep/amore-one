/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { presetLevelsForRole } from '../../lib/memberAccess'
import { MemberAccessPanel } from './MemberAccessPanel'

const MEMBERSHIP = {
  id: 'member-2',
  role: 'manager',
  workspaceId: 'ws-1',
}

function renderPanel(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(MemberAccessPanel, props))
  })
  return {
    container,
    async flush() {
      await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
      })
    },
    unmount() {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('MemberAccessPanel', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('stays hidden for everyone except the owner', async () => {
    const loadLinkedMembership = vi.fn()
    const view = renderPanel({
      actorRole: 'manager',
      workspaceId: 'ws-1',
      employeeId: 'emp-1',
      loadLinkedMembership,
    })
    await view.flush()
    expect(view.container.textContent).not.toContain('Access')
    expect(loadLinkedMembership).not.toHaveBeenCalled()
    view.unmount()
  })

  it('shows the nine areas, salary toggle, and clock-in note for a member', async () => {
    const loadLinkedMembership = vi.fn().mockResolvedValue(MEMBERSHIP)
    const loadPermissionRows = vi.fn().mockResolvedValue(
      Object.entries(presetLevelsForRole('manager')).map(([module, level]) => ({ module, level })),
    )
    const view = renderPanel({
      actorRole: 'owner',
      workspaceId: 'ws-1',
      employeeId: 'emp-1',
      actorMemberId: 'member-1',
      actorUserId: 'user-1',
      loadLinkedMembership,
      loadPermissionRows,
      savePermissionRows: vi.fn(),
    })
    await view.flush()

    expect(view.container.textContent).toContain('Access')
    expect(view.container.textContent).toContain('Preset: Manager')
    expect(view.container.textContent).toContain('Bookings & floor plan')
    expect(view.container.textContent).toContain('Salaries & personal data')
    expect(view.container.textContent).toContain('Clock in/out')
    expect(view.container.textContent).not.toContain('Coming soon')
    expect(view.container.querySelectorAll('.member-access-row')).toHaveLength(9)
    expect(view.container.textContent).toContain('None')
    expect(view.container.textContent).toContain('View')
    expect(view.container.textContent).toContain('Manage')
    const buttonLabels = (label) => [...view.container.querySelectorAll('.member-access-row')]
      .find((row) => row.textContent.includes(label))
      .querySelectorAll('button')
    expect([...buttonLabels('Stock')].map((button) => button.textContent)).toEqual(['None', 'View & count', 'Manage'])
    expect([...buttonLabels('Schedule')].map((button) => button.textContent)).toEqual(['None', 'View', 'Manage'])
    expect([...buttonLabels('Clock in/out')].map((button) => button.textContent)).toEqual(['None', 'View', 'Manage'])
    expect(view.container.textContent).toContain('Reset to role default')
    view.unmount()
  })

  it('saves the draft with the signed-in user and resets from the role preset', async () => {
    const loadLinkedMembership = vi.fn().mockResolvedValue(MEMBERSHIP)
    const loadPermissionRows = vi.fn().mockResolvedValue([])
    const savePermissionRows = vi.fn().mockResolvedValue([])
    const view = renderPanel({
      actorRole: 'owner',
      workspaceId: 'ws-1',
      employeeId: 'emp-1',
      actorMemberId: 'member-1',
      actorUserId: 'user-1',
      loadLinkedMembership,
      loadPermissionRows,
      savePermissionRows,
    })
    await view.flush()

    const stockNone = [...view.container.querySelectorAll('.member-access-row')]
      .find((row) => row.textContent.includes('Stock'))
      .querySelector('button')
    await act(async () => {
      stockNone.click()
    })
    const save = [...view.container.querySelectorAll('button')].find((button) => button.textContent === 'Save')
    await act(async () => {
      save.click()
    })
    await view.flush()

    expect(view.container.querySelector('[role="status"]')?.textContent).toBe('Access saved')
    expect(savePermissionRows).toHaveBeenCalledTimes(1)
    expect(savePermissionRows.mock.calls[0][0]).toMatchObject({
      workspaceId: 'ws-1',
      memberId: 'member-2',
      updatedBy: 'user-1',
      levels: expect.objectContaining({ stock: 'none' }),
    })

    const reset = [...view.container.querySelectorAll('button')].find((button) => button.textContent === 'Reset to role default')
    await act(async () => {
      reset.click()
    })
    await view.flush()
    expect(savePermissionRows.mock.calls[1][0].levels).toEqual(presetLevelsForRole('manager'))
    expect(view.container.querySelector('[role="status"]')?.textContent).toBe('Access reset to the role default.')

    savePermissionRows.mockRejectedValueOnce(new Error('Network down'))
    await act(async () => {
      stockNone.click()
    })
    await act(async () => {
      save.click()
    })
    await view.flush()
    expect(view.container.querySelector('[role="alert"]')?.textContent).toBe('Network down')
    view.unmount()
  })

  it('locks the owner row and does not offer controls', async () => {
    const loadLinkedMembership = vi.fn().mockResolvedValue({ ...MEMBERSHIP, id: 'member-1', role: 'owner' })
    const loadPermissionRows = vi.fn()
    const view = renderPanel({
      actorRole: 'owner',
      workspaceId: 'ws-1',
      employeeId: 'emp-owner',
      actorMemberId: 'member-1',
      loadLinkedMembership,
      loadPermissionRows,
    })
    await view.flush()
    expect(view.container.textContent).toContain('Full access (owner)')
    expect(view.container.querySelector('.member-access-choice')).toBeNull()
    expect(loadPermissionRows).not.toHaveBeenCalled()
    view.unmount()
  })

  it('falls back to the preset list when the permission fetch fails', async () => {
    const loadLinkedMembership = vi.fn().mockResolvedValue(MEMBERSHIP)
    const loadPermissionRows = vi.fn().mockRejectedValue(new Error('offline'))
    const view = renderPanel({
      actorRole: 'owner',
      workspaceId: 'ws-1',
      employeeId: 'emp-1',
      actorMemberId: 'member-1',
      loadLinkedMembership,
      loadPermissionRows,
      savePermissionRows: vi.fn(),
    })
    await view.flush()
    const stock = [...view.container.querySelectorAll('.member-access-row')]
      .find((row) => row.textContent.includes('Stock'))
    const selected = [...stock.querySelectorAll('button')].find((button) => button.getAttribute('aria-pressed') === 'true')
    expect(selected.textContent).toBe('Manage')
    view.unmount()
  })
})
