/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { MobileManagerApp } from './MobileManagerApp'

const managerLeaveInboxMock = vi.hoisted(() => vi.fn(() => createElement('div', {
  'data-testid': 'shared-manager-leave-inbox',
}, 'Pending leave inbox')))

vi.mock('../team/ManagerLeaveInbox', () => ({
  ManagerLeaveInbox: (props) => managerLeaveInboxMock(props),
}))

function renderManagerApp(props = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(createElement(MobileManagerApp, {
      activeTab: 'menu',
      onTabChange: vi.fn(),
      homeProps: {},
      stockProps: {},
      managerTasksProps: {},
      menuProps: {
        screen: 'main',
        menuVariant: 'manager',
        profileName: 'Pat Manager',
        roleLabel: 'Manager',
        onOpenProfile: vi.fn(),
        onSignOut: vi.fn(),
        ...props.menuProps,
      },
      bottomTabs: [
        { id: 'today', label: 'Today', icon: '◈' },
        { id: 'menu', label: 'Menu', icon: '☺' },
      ],
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

describe('MobileManagerApp Leave inbox screen', () => {
  it('renders shared ManagerLeaveInbox when menu screen is leave-inbox', () => {
    const onBack = vi.fn()
    const { container, unmount } = renderManagerApp({
      menuProps: {
        screen: 'leave-inbox',
        onBackFromLeaveInbox: onBack,
        leaveInboxProps: {
          workspaceId: 'ws-1',
          employees: [{ id: 'emp-1', name: 'Alex' }],
        },
      },
    })

    expect(container.querySelector('[data-testid="shared-manager-leave-inbox"]')).toBeTruthy()
    expect(container.querySelector('h1')?.textContent).toBe('Leave inbox')
    expect(managerLeaveInboxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        employees: [{ id: 'emp-1', name: 'Alex' }],
      }),
    )

    const backButton = Array.from(container.querySelectorAll('button'))
      .find((node) => node.textContent.includes('Back'))

    act(() => {
      backButton.click()
    })

    expect(onBack).toHaveBeenCalledTimes(1)
    unmount()
  })
})
