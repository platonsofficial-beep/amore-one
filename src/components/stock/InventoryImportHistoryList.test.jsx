/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { InventoryImportHistoryList } from './InventoryImportHistoryList'

const sessions = [
  {
    id: 'sess-ok',
    status: 'completed',
    statusLabel: 'Completed',
    sourceFilename: 'one-import-test.csv',
    actorName: 'Platon',
    occurredAt: '2026-10-26T18:05:00.000Z',
    createdCount: 2,
    linkedCount: 0,
  },
  {
    id: 'sess-blocked',
    status: 'completed',
    statusLabel: 'Completed',
    sourceFilename: 'later.csv',
    actorName: 'Alex',
    occurredAt: '2026-10-25T18:05:00.000Z',
    createdCount: 1,
    linkedCount: 3,
  },
]

describe('InventoryImportHistoryList', () => {
  let host
  let root

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    host?.remove()
    host = null
    root = null
  })

  function renderList(props) {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => {
      root.render(createElement(InventoryImportHistoryList, {
        workspaceId: 'ws-1',
        timeZone: 'Europe/Nicosia',
        ...props,
      }))
    })
  }

  it('shows recent imports and confirms before undo', async () => {
    const undoInventoryImportSession = vi.fn(async () => ({ status: 'cancelled' }))
    const checkInventoryImportUndoEligibility = vi.fn(async ({ sessionId }) => (
      sessionId === 'sess-ok'
        ? { allowed: true, reasons: [] }
        : { allowed: false, reasons: ['A product from this import was changed again after it was applied.'] }
    ))

    renderList({
      listRecentInventoryImportSessions: vi.fn(async () => sessions),
      checkInventoryImportUndoEligibility,
      undoInventoryImportSession,
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(host.textContent).toContain('Platon')
    expect(host.textContent).toContain('Created 2')
    expect(host.textContent).toContain('Linked 0')
    expect(host.textContent).toContain('Created 1')
    expect(host.textContent).toContain('Linked 3')
    expect(host.textContent).toContain('Completed')
    expect(host.textContent).toContain('A product from this import was changed again after it was applied.')

    const undoButtons = host.querySelectorAll('[data-undo-import="open"]')
    expect(undoButtons).toHaveLength(1)

    act(() => {
      undoButtons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(host.textContent).toContain('Undo this import?')
    expect(undoInventoryImportSession).not.toHaveBeenCalled()

    await act(async () => {
      host.querySelector('[data-undo-import="confirm"]').dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      )
      await Promise.resolve()
    })

    expect(undoInventoryImportSession).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      sessionId: 'sess-ok',
    })
    expect(host.querySelector('[data-import-history-session="sess-ok"]')?.textContent).toContain('Cancelled')
    expect(host.querySelector('[data-undo-import="open"]')).toBeNull()
  })

  it('hides undo when the eligibility function is not installed', async () => {
    const missing = new Error('Could not find the function public.inventory_import_undo_eligibility')
    missing.code = 'PGRST202'
    renderList({
      listRecentInventoryImportSessions: vi.fn(async () => [sessions[0]]),
      checkInventoryImportUndoEligibility: vi.fn(async () => {
        throw missing
      }),
      undoInventoryImportSession: vi.fn(),
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(host.textContent).toContain('Platon')
    expect(host.querySelector('[data-undo-import="open"]')).toBeNull()
    expect(host.textContent).not.toContain('schema cache')
  })
})
