/**
 * @vitest-environment jsdom
 * P8.20.4 — Posted Count read-only historical review.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { InventoryCountPostedReview } from './InventoryCountPostedReview'

const getPostedReviewMock = vi.fn()

vi.mock('../../services/inventoryCountService', () => ({
  getInventoryCountPostedReview: (...args) => getPostedReviewMock(...args),
  previewInventoryCountFinish: vi.fn(() => {
    throw new Error('Finish Preview must not be called from posted review')
  }),
}))

function render(ui) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return {
    container,
    cleanup: () => {
      act(() => root.unmount())
      container.remove()
    },
  }
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

function reviewFixture(overrides = {}) {
  return {
    session: {
      id: 'posted-1',
      workspaceId: 'workspace-1',
      status: 'posted',
      statusLabel: 'Posted',
      countType: 'quick',
      countTypeLabel: 'Quick Count',
      visibility: 'blind',
      note: 'Closing bar',
      startedAt: '2026-07-21T10:00:00.000Z',
      postedAt: '2026-07-21T12:00:00.000Z',
      operatorName: 'Alex Manager',
      postedByName: 'Blake Owner',
      ...overrides.session,
    },
    locations: [
      {
        id: 'loc-1',
        locationKey: 'Bar',
        status: 'completed',
      },
    ],
    items: [
      {
        id: 'line-1',
        itemName: 'Coca-Cola',
        unit: 'case',
        storageLocation: 'Bar',
        lineStatus: 'counted',
        expectedAtCount: 9,
        countedQuantity: 8,
        varianceQuantity: -1,
        liveQuantityAtPost: 9,
        resultAfterPost: 8,
        postedMovementId: '11111111-2222-3333-4444-555555555555',
      },
    ],
    summary: {
      totalLines: 1,
      countedLines: 1,
      skippedLines: 0,
      pendingLines: 0,
      changedItems: 1,
      unchangedItems: 0,
      positiveVariances: 0,
      negativeVariances: 1,
    },
    corrections: [],
    correctionCount: 0,
    hasCorrections: false,
    ...overrides,
  }
}

beforeEach(() => {
  getPostedReviewMock.mockReset()
  getPostedReviewMock.mockResolvedValue(reviewFixture())
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('InventoryCountPostedReview (P8.20.4)', () => {
  it('loads persisted audit fields and reconstructs result after post', async () => {
    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
    }))
    await flush()

    expect(getPostedReviewMock).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      sessionId: 'posted-1',
    })
    expect(container.textContent).toContain('Quick Count')
    expect(container.textContent).toContain('Posted')
    expect(container.textContent).toContain('Alex Manager')
    expect(container.textContent).toContain('Blake Owner')
    expect(container.textContent).toContain('Closing bar')
    expect(container.textContent).toContain('Coca-Cola')
    expect(container.textContent).toContain('Expected at count')
    expect(container.textContent).toContain('9')
    expect(container.textContent).toContain('8')
    expect(container.textContent).toContain('-1')
    expect(container.textContent).toContain('Result after post')
    expect(container.textContent).toContain('Corrections will be handled through a separate audited workflow.')
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('textarea')).toBeNull()
    expect(container.textContent).not.toContain('Pause')
    expect(container.textContent).not.toContain('Resume')
    expect(container.textContent).not.toContain('Complete Location')
    expect(container.textContent).not.toContain('Finish Count')
    expect(container.textContent).not.toContain('Post Count')
    expect(container.textContent).not.toContain('Post again')

    cleanup()
  })

  it('surfaces load errors without mutation controls', async () => {
    getPostedReviewMock.mockRejectedValueOnce(new Error('permission denied for table'))

    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
    }))
    await flush()

    expect(container.textContent).toContain('permission denied for table')
    expect(container.querySelector('input')).toBeNull()
    expect(container.textContent).not.toContain('Post Count')

    cleanup()
  })

  it('Back closes the review', async () => {
    const onClose = vi.fn()
    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose,
    }))
    await flush()

    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Back')
        ?.click()
    })

    expect(onClose).toHaveBeenCalledTimes(1)

    cleanup()
  })

  it('Suggest Correction invokes the correction entry callback', async () => {
    const onSuggestCorrection = vi.fn()
    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
      onSuggestCorrection,
    }))
    await flush()

    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === 'Suggest Correction')
        ?.click()
    })

    expect(onSuggestCorrection).toHaveBeenCalledTimes(1)
    expect(container.querySelector('input')).toBeNull()

    cleanup()
  })

  it('shows CORRECTED badge and correction history when corrections exist', async () => {
    getPostedReviewMock.mockResolvedValueOnce(reviewFixture({
      corrections: [{
        id: 'corr-1',
        operatorName: 'Casey Corrector',
        createdAt: '2026-07-27T12:00:00.000Z',
        lines: [{
          id: 'cline-1',
          itemName: 'Coca-Cola',
          originalQuantity: 8,
          correctedQuantity: 10,
          deltaQuantity: 2,
          createdAt: '2026-07-27T12:00:00.000Z',
        }],
      }],
      correctionCount: 1,
      hasCorrections: true,
    }))

    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
    }))
    await flush()

    expect(container.querySelector('[data-inventory-count-corrected-badge="true"]')?.textContent)
      .toContain('CORRECTED')
    expect(container.textContent).toContain('Correction history')
    expect(container.textContent).toContain('Casey Corrector')
    expect(container.textContent).toContain('Coca-Cola')
    expect(container.textContent).toContain('+2')

    cleanup()
  })
})
