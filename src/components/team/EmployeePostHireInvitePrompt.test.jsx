/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { EmployeePostHireInvitePrompt } from './EmployeePostHireInvitePrompt'
import { EmployeeAccountConnectionSection } from './EmployeeAccountConnectionSection'

const getEmployeeAccountConnectionStatusMock = vi.hoisted(() => vi.fn())
const createEmployeeInviteMock = vi.hoisted(() => vi.fn())
const revokeInviteMock = vi.hoisted(() => vi.fn())
const buildInviteUrlMock = vi.hoisted(() => vi.fn((token) => `https://example.com/invite/${token}`))

vi.mock('../../services/inviteService', () => ({
  getEmployeeAccountConnectionStatus: getEmployeeAccountConnectionStatusMock,
  createEmployeeInvite: createEmployeeInviteMock,
  revokeInvite: revokeInviteMock,
  buildInviteUrl: buildInviteUrlMock,
}))

const EMPLOYEE = {
  id: 'emp-new',
  name: 'Alex Rivera',
  email: 'alex@example.com',
}

function renderPrompt(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(EmployeePostHireInvitePrompt, {
      isOpen: true,
      employee: EMPLOYEE,
      onInviteNow: vi.fn(),
      onLater: vi.fn(),
      ...props,
    }))
  })

  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

function renderAccountSection(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(EmployeeAccountConnectionSection, {
      employee: EMPLOYEE,
      workspaceId: 'ws-1',
      canManageInvites: true,
      canAssignManagerRole: false,
      autoOpenInvite: false,
      onAutoOpenInviteConsumed: vi.fn(),
      ...props,
    }))
  })

  return {
    container,
    unmount: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

describe('EmployeePostHireInvitePrompt', () => {
  it('shows the post-hire success prompt', () => {
    const { container, unmount } = renderPrompt()

    expect(container.textContent).toContain('Employee created successfully.')
    expect(container.textContent).toContain('Would you like to invite Alex Rivera to ONE now?')
    expect(container.textContent).toContain('Invite Now')
    expect(container.textContent).toContain('Later')

    unmount()
  })

  it('calls onInviteNow when Invite Now is pressed', () => {
    const onInviteNow = vi.fn()
    const { container, unmount } = renderPrompt({ onInviteNow })

    const inviteButton = Array.from(container.querySelectorAll('button'))
      .find((node) => node.textContent === 'Invite Now')

    act(() => {
      inviteButton.click()
    })

    expect(onInviteNow).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('calls onLater when Later is pressed', () => {
    const onLater = vi.fn()
    const { container, unmount } = renderPrompt({ onLater })

    const laterButton = Array.from(container.querySelectorAll('button'))
      .find((node) => node.textContent === 'Later')

    act(() => {
      laterButton.click()
    })

    expect(onLater).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('does not render when closed', () => {
    const { container, unmount } = renderPrompt({ isOpen: false })
    expect(container.textContent).toBe('')
    unmount()
  })
})

describe('EmployeeAccountConnectionSection auto-open invite', () => {
  beforeEach(() => {
    getEmployeeAccountConnectionStatusMock.mockReset()
    getEmployeeAccountConnectionStatusMock.mockResolvedValue({
      pendingInvite: null,
      linkedMembership: null,
      acceptedInvite: null,
      isConnected: false,
    })
  })

  it('opens the existing invite modal when autoOpenInvite is true', async () => {
    const onAutoOpenInviteConsumed = vi.fn()
    const { container, unmount } = renderAccountSection({
      autoOpenInvite: true,
      onAutoOpenInviteConsumed,
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('#employee-invite-title')?.textContent).toBe('Invite Alex Rivera')
    expect(onAutoOpenInviteConsumed).toHaveBeenCalledTimes(1)

    unmount()
  })

  it('does not auto-open invite when the viewer cannot manage invites', async () => {
    const onAutoOpenInviteConsumed = vi.fn()
    const { container, unmount } = renderAccountSection({
      canManageInvites: false,
      autoOpenInvite: true,
      onAutoOpenInviteConsumed,
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(container.querySelector('#employee-invite-title')).toBeNull()
    expect(onAutoOpenInviteConsumed).not.toHaveBeenCalled()

    unmount()
  })
})
