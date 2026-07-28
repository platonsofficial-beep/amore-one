/**
 * @vitest-environment jsdom
 * P8.20.4 / P8.20.7 / P8.20.9 / P8.20.10 / P8.20.12 — Posted Count historical review + audit table.
 * P8.22.8 — Reverse action foundation.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  InventoryCountPostedReview,
  buildPostedCorrectionAuditSummary,
  buildPostedCorrectionVersionHistory,
  buildPostedLineAuditQuantities,
} from './InventoryCountPostedReview'

const getPostedReviewMock = vi.fn()
const applyCorrectionsMock = vi.fn()
const reverseSessionMock = vi.fn()
const useAuthMock = vi.fn()
const canManageStockMock = vi.fn()

vi.mock('../../services/inventoryCountService', () => ({
  getInventoryCountPostedReview: (...args) => getPostedReviewMock(...args),
  applyInventoryCountCorrections: (...args) => applyCorrectionsMock(...args),
  reverseInventoryCountSession: (...args) => reverseSessionMock(...args),
  previewInventoryCountFinish: vi.fn(() => {
    throw new Error('Finish Preview must not be called from posted review')
  }),
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../../lib/permissions', () => ({
  canManageStock: (...args) => canManageStockMock(...args),
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
  const { session: sessionOverrides, ...rest } = overrides
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
      ...sessionOverrides,
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
    reversal: null,
    ...rest,
  }
}

beforeEach(() => {
  getPostedReviewMock.mockReset()
  applyCorrectionsMock.mockReset()
  reverseSessionMock.mockReset()
  useAuthMock.mockReset()
  canManageStockMock.mockReset()
  getPostedReviewMock.mockResolvedValue(reviewFixture())
  useAuthMock.mockReturnValue({ role: 'manager' })
  canManageStockMock.mockReturnValue(true)
  reverseSessionMock.mockResolvedValue({
    reversalId: 'reversal-1',
    sessionId: 'posted-1',
    workspaceId: 'workspace-1',
    status: 'posted',
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('buildPostedCorrectionVersionHistory (P8.20.7)', () => {
  it('numbers batches chronologically with oldest as Correction 1', () => {
    const versions = buildPostedCorrectionVersionHistory([
      {
        id: 'corr-newer',
        createdAt: '2026-07-27T15:00:00.000Z',
        operatorName: 'Blake',
        lines: [{ id: 'l2', deltaQuantity: -1 }],
      },
      {
        id: 'corr-older',
        createdAt: '2026-07-27T12:00:00.000Z',
        operatorName: 'Alex',
        lines: [{ id: 'l1', deltaQuantity: 2 }],
      },
    ])

    expect(versions.map((version) => version.versionLabel)).toEqual([
      'Correction 1',
      'Correction 2',
    ])
    expect(versions[0].id).toBe('corr-older')
    expect(versions[1].id).toBe('corr-newer')
    expect(versions[0].netDelta).toBe(2)
    expect(versions[1].netDelta).toBe(-1)
    expect(versions[0].detailAnchorId).toBe('inventory-count-audit-correction-1')
    expect(versions[1].detailAnchorId).toBe('inventory-count-audit-correction-2')
  })
})

describe('buildPostedCorrectionAuditSummary (P8.20.9)', () => {
  it('reconstructs original, effective, corrections, and net from loaded history', () => {
    const versions = buildPostedCorrectionVersionHistory([
      {
        id: 'corr-1',
        createdAt: '2026-07-27T12:00:00.000Z',
        lines: [{
          id: 'cline-1',
          sessionItemId: 'line-1',
          itemName: 'Coca-Cola',
          originalQuantity: 6,
          correctedQuantity: 7,
          deltaQuantity: 1,
        }],
      },
      {
        id: 'corr-2',
        createdAt: '2026-07-27T13:00:00.000Z',
        lines: [{
          id: 'cline-2',
          sessionItemId: 'line-1',
          itemName: 'Coca-Cola',
          originalQuantity: 6,
          correctedQuantity: 4,
          deltaQuantity: -2,
        }],
      },
      {
        id: 'corr-3',
        createdAt: '2026-07-27T14:00:00.000Z',
        lines: [{
          id: 'cline-3',
          sessionItemId: 'line-1',
          itemName: 'Coca-Cola',
          originalQuantity: 6,
          correctedQuantity: 7,
          deltaQuantity: 2,
        }],
      },
    ])

    expect(buildPostedCorrectionAuditSummary(versions)).toEqual({
      originalPostedQuantity: 6,
      currentEffectiveQuantity: 7,
      totalCorrections: 3,
      netAdjustment: 1,
    })
  })
})

describe('buildPostedLineAuditQuantities (P8.20.10)', () => {
  const items = [{
    id: 'line-1',
    countedQuantity: 6,
    resultAfterPost: 6,
  }]

  it('keeps effective equal to posted qty with zero delta when there are no corrections', () => {
    const byId = buildPostedLineAuditQuantities(items, [])
    expect(byId.get('line-1')).toEqual({
      postedQuantity: 6,
      currentEffectiveQuantity: 6,
      deltaSincePosted: 0,
    })
  })

  it('derives effective from one correction delta', () => {
    const byId = buildPostedLineAuditQuantities(items, [{
      id: 'corr-1',
      lines: [{ sessionItemId: 'line-1', deltaQuantity: 1 }],
    }])
    expect(byId.get('line-1')).toEqual({
      postedQuantity: 6,
      currentEffectiveQuantity: 7,
      deltaSincePosted: 1,
    })
  })

  it('sums multiple correction deltas including positive, negative, and zero net', () => {
    const byId = buildPostedLineAuditQuantities(items, [
      { id: 'c1', lines: [{ sessionItemId: 'line-1', deltaQuantity: 1 }] },
      { id: 'c2', lines: [{ sessionItemId: 'line-1', deltaQuantity: -3 }] },
      { id: 'c3', lines: [{ sessionItemId: 'line-1', deltaQuantity: 2 }] },
    ])
    expect(byId.get('line-1')).toEqual({
      postedQuantity: 6,
      currentEffectiveQuantity: 6,
      deltaSincePosted: 0,
    })
  })

  it('preserves posted quantity while reporting a negative delta since posted', () => {
    const byId = buildPostedLineAuditQuantities(items, [
      { id: 'c1', lines: [{ sessionItemId: 'line-1', deltaQuantity: -2 }] },
    ])
    expect(byId.get('line-1')).toEqual({
      postedQuantity: 6,
      currentEffectiveQuantity: 4,
      deltaSincePosted: -2,
    })
  })
})

describe('InventoryCountPostedReview (P8.20.4 / P8.20.7 / P8.20.9 / P8.20.10)', () => {
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
    expect(container.textContent).toContain('Expected')
    expect(container.textContent).toContain('Posted')
    expect(container.textContent).toContain('Current')
    expect(container.textContent).toContain('Δ')
    expect(container.textContent).toContain('Movement')
    expect(container.textContent).not.toContain('Posted Qty')
    expect(container.textContent).not.toContain('Current Effective')
    expect(container.textContent).not.toContain('Δ Since Posted')
    expect(container.textContent).not.toContain('Live at post')
    expect(container.textContent).not.toContain('Result after post')
    expect(container.textContent).toContain('9')
    expect(container.textContent).toContain('8')
    expect(container.textContent).toContain('-1')
    expect(container.querySelector('[data-posted-qty="true"]')?.textContent).toBe('8')
    expect(container.querySelector('[data-current-effective="true"]')?.textContent).toBe('8')
    expect(container.querySelector('[data-delta-since-posted="true"]')?.textContent).toBe('0')
    expect(container.textContent).not.toContain(
      'Corrections will be handled through a separate audited workflow.',
    )
    expect(container.querySelector('.inventory-count-posted-review-footnote')).toBeNull()
    expect(container.textContent).toContain('Suggest Correction')
    expect(container.querySelector('input')).toBeNull()
    expect(container.querySelector('textarea')).toBeNull()
    expect(container.textContent).not.toContain('Pause')
    expect(container.textContent).not.toContain('Resume')
    expect(container.textContent).not.toContain('Complete Location')
    expect(container.textContent).not.toContain('Finish Count')
    expect(container.textContent).not.toContain('Post Count')
    expect(container.textContent).not.toContain('Post again')
    expect(applyCorrectionsMock).not.toHaveBeenCalled()

    cleanup()
  })

  it('renders posted qty, current effective, and delta after multiple corrections', async () => {
    getPostedReviewMock.mockResolvedValueOnce(reviewFixture({
      items: [{
        id: 'line-1',
        itemName: 'Coca-Cola',
        unit: 'case',
        storageLocation: 'Bar',
        lineStatus: 'counted',
        expectedAtCount: 6,
        countedQuantity: 6,
        varianceQuantity: 0,
        liveQuantityAtPost: 6,
        resultAfterPost: 6,
        postedMovementId: 'mov-post-1',
      }],
      corrections: [
        {
          id: 'corr-1',
          createdAt: '2026-07-27T12:00:00.000Z',
          operatorName: 'Casey',
          lines: [{
            id: 'cline-1',
            sessionItemId: 'line-1',
            itemName: 'Coca-Cola',
            originalQuantity: 6,
            correctedQuantity: 7,
            deltaQuantity: 1,
            movementId: 'mov-1',
          }],
        },
        {
          id: 'corr-2',
          createdAt: '2026-07-27T13:00:00.000Z',
          operatorName: 'Casey',
          lines: [{
            id: 'cline-2',
            sessionItemId: 'line-1',
            itemName: 'Coca-Cola',
            originalQuantity: 6,
            correctedQuantity: 4,
            deltaQuantity: -3,
            movementId: 'mov-2',
          }],
        },
        {
          id: 'corr-3',
          createdAt: '2026-07-27T14:00:00.000Z',
          operatorName: 'Casey',
          lines: [{
            id: 'cline-3',
            sessionItemId: 'line-1',
            itemName: 'Coca-Cola',
            originalQuantity: 6,
            correctedQuantity: 6,
            deltaQuantity: 2,
            movementId: 'mov-3',
          }],
        },
      ],
      correctionCount: 3,
      hasCorrections: true,
    }))

    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
    }))
    await flush()

    expect(container.querySelector('[data-posted-qty="true"]')?.textContent).toBe('6')
    expect(container.querySelector('[data-current-effective="true"]')?.textContent).toBe('6')
    expect(container.querySelector('[data-delta-since-posted="true"]')?.textContent).toBe('0')
    expect(
      container.querySelector('[data-delta-since-posted="true"] .inventory-count-posted-review-delta-badge')
        ?.className,
    ).toContain('is-neutral')

    cleanup()
  })

  it('renders positive and negative delta badges from correction history', async () => {
    getPostedReviewMock.mockResolvedValueOnce(reviewFixture({
      items: [
        {
          id: 'line-1',
          itemName: 'Coca-Cola',
          unit: 'case',
          storageLocation: 'Bar',
          lineStatus: 'counted',
          expectedAtCount: 6,
          countedQuantity: 6,
          varianceQuantity: 0,
          liveQuantityAtPost: 6,
          resultAfterPost: 6,
          postedMovementId: 'mov-a',
        },
        {
          id: 'line-2',
          itemName: 'Tonic',
          unit: 'bottle',
          storageLocation: 'Bar',
          lineStatus: 'counted',
          expectedAtCount: 3,
          countedQuantity: 3,
          varianceQuantity: 0,
          liveQuantityAtPost: 3,
          resultAfterPost: 3,
          postedMovementId: 'mov-b',
        },
      ],
      corrections: [{
        id: 'corr-1',
        createdAt: '2026-07-27T12:00:00.000Z',
        operatorName: 'Casey',
        lines: [
          {
            id: 'cline-1',
            sessionItemId: 'line-1',
            itemName: 'Coca-Cola',
            originalQuantity: 6,
            correctedQuantity: 8,
            deltaQuantity: 2,
            movementId: 'mov-1',
          },
          {
            id: 'cline-2',
            sessionItemId: 'line-2',
            itemName: 'Tonic',
            originalQuantity: 3,
            correctedQuantity: 1,
            deltaQuantity: -2,
            movementId: 'mov-2',
          },
        ],
      }],
      correctionCount: 2,
      hasCorrections: true,
    }))

    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
    }))
    await flush()

    const rows = Array.from(container.querySelectorAll('.inventory-count-posted-review-table tbody tr'))
    expect(rows[0].querySelector('[data-posted-qty="true"]')?.textContent).toBe('6')
    expect(rows[0].querySelector('[data-current-effective="true"]')?.textContent).toBe('8')
    expect(rows[0].querySelector('[data-delta-since-posted="true"]')?.textContent).toBe('+2')
    expect(rows[0].querySelector('[data-delta-since-posted="true"] .is-positive')).toBeTruthy()

    expect(rows[1].querySelector('[data-posted-qty="true"]')?.textContent).toBe('3')
    expect(rows[1].querySelector('[data-current-effective="true"]')?.textContent).toBe('1')
    expect(rows[1].querySelector('[data-delta-since-posted="true"]')?.textContent).toBe('−2')
    expect(rows[1].querySelector('[data-delta-since-posted="true"] .is-negative')).toBeTruthy()

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

  it('shows singular applied-correction badge', async () => {
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
          movementId: 'mov-1',
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
      .toBe('1 Applied Correction')

    cleanup()
  })

  it('shows plural applied-correction badge and versioned history above the table', async () => {
    getPostedReviewMock.mockResolvedValueOnce(reviewFixture({
      corrections: [
        {
          id: 'corr-2',
          operatorName: 'Blake Owner',
          createdAt: '2026-07-27T15:00:00.000Z',
          lines: [{
            id: 'cline-2',
            itemName: 'Tonic',
            originalQuantity: 3,
            correctedQuantity: 1,
            deltaQuantity: -2,
            movementId: 'mov-2',
            createdAt: '2026-07-27T15:00:00.000Z',
          }],
        },
        {
          id: 'corr-1',
          operatorName: 'Casey Corrector',
          createdAt: '2026-07-27T12:00:00.000Z',
          lines: [{
            id: 'cline-1',
            itemName: 'Coca-Cola',
            originalQuantity: 6,
            correctedQuantity: 7,
            deltaQuantity: 1,
            movementId: 'mov-1',
            createdAt: '2026-07-27T12:00:00.000Z',
          }],
        },
      ],
      correctionCount: 2,
      hasCorrections: true,
    }))

    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
    }))
    await flush()

    expect(container.querySelector('[data-inventory-count-corrected-badge="true"]')?.textContent)
      .toBe('2 Applied Corrections')

    const history = container.querySelector('[data-inventory-count-correction-history="true"]')
    const table = container.querySelector('[data-inventory-count-posted-lines="true"]')
    expect(history).toBeTruthy()
    expect(table).toBeTruthy()
    expect(
      Boolean(history.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true)

    expect(history.textContent).toContain('Original')
    expect(history.textContent).toContain('Correction 1')
    expect(history.textContent).toContain('Correction 2')
    expect(history.textContent).toContain('Casey Corrector')
    expect(history.textContent).toContain('Blake Owner')
    expect(history.textContent).toContain('1 product corrected')
    expect(history.textContent).toContain('Original 6 → Corrected 7')
    expect(history.textContent).toContain('+1 stock adjustment applied')
    expect(history.textContent).toContain('Original 3 → Corrected 1')
    expect(history.textContent).toContain('−2 stock adjustment applied')

    const versionOne = history.querySelector('[data-correction-version="1"]')
    const versionTwo = history.querySelector('[data-correction-version="2"]')
    expect(versionOne?.textContent).toContain('Correction 1')
    expect(versionOne?.textContent).toContain('Coca-Cola')
    expect(versionTwo?.textContent).toContain('Correction 2')
    expect(versionTwo?.textContent).toContain('Tonic')

    expect(container.querySelector('.inventory-count-posted-review-table')).toBeTruthy()
    expect(container.textContent).toContain('Expected')
    expect(container.textContent).toContain('Posted')
    expect(container.textContent).toContain('Current')
    expect(container.textContent).toContain('Δ')
    expect(container.querySelector('input')).toBeNull()
    expect(applyCorrectionsMock).not.toHaveBeenCalled()

    cleanup()
  })

  it('renders audit timeline, summary values, anchors, and delta badges in chronological order', async () => {
    const scrollIntoViewMock = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoViewMock

    getPostedReviewMock.mockResolvedValueOnce(reviewFixture({
      corrections: [
        {
          id: 'corr-2',
          operatorName: 'Blake Owner',
          createdAt: '2026-07-27T15:00:00.000Z',
          lines: [{
            id: 'cline-2',
            sessionItemId: 'line-1',
            itemName: 'Coca-Cola',
            originalQuantity: 6,
            correctedQuantity: 4,
            deltaQuantity: -2,
            movementId: 'mov-2',
            createdAt: '2026-07-27T15:00:00.000Z',
          }],
        },
        {
          id: 'corr-1',
          operatorName: 'Casey Corrector',
          createdAt: '2026-07-27T12:00:00.000Z',
          lines: [{
            id: 'cline-1',
            sessionItemId: 'line-1',
            itemName: 'Coca-Cola',
            originalQuantity: 6,
            correctedQuantity: 7,
            deltaQuantity: 1,
            movementId: 'mov-1',
            createdAt: '2026-07-27T12:00:00.000Z',
          }],
        },
      ],
      correctionCount: 2,
      hasCorrections: true,
    }))

    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
    }))
    await flush()

    const timeline = container.querySelector('[data-inventory-count-correction-timeline="true"]')
    expect(timeline).toBeTruthy()
    expect(timeline.textContent).toContain('Posted Count')
    expect(timeline.textContent).toContain('Correction 1')
    expect(timeline.textContent).toContain('Correction 2')

    const timelineLabels = Array.from(
      timeline.querySelectorAll('.inventory-count-posted-review-timeline-label'),
    ).map((node) => node.textContent)
    expect(timelineLabels).toEqual(['Posted Count', 'Correction 1', 'Correction 2'])

    const summary = container.querySelector('[data-inventory-count-audit-summary="true"]')
    const summaryLabels = Array.from(
      summary.querySelectorAll('.inventory-count-posted-review-audit-summary-label'),
    ).map((node) => node.textContent)
    expect(summaryLabels).toEqual([
      'Posted Total',
      'Current Total',
      'Correction Batches',
      'Net Adjustment',
    ])
    expect(container.querySelector('[data-inventory-count-audit-historical-note="true"]')).toBeNull()
    expect(summary?.textContent).not.toContain('Original Posted')
    expect(summary?.textContent).not.toContain('Current Effective')
    expect(summary?.textContent).toContain('6')
    expect(summary?.textContent).toContain('5')
    expect(summary?.textContent).toContain('2')
    expect(summary?.textContent).toContain('−1')
    expect(summary.querySelector('.is-effective')).toBeTruthy()
    expect(summary.querySelector('.is-effective .inventory-count-posted-review-audit-summary-label')?.textContent)
      .toBe('Current Total')

    expect(container.textContent).toContain('Immutable historical record')
    expect(container.textContent).toContain('Suggest Correction')
    expect(container.textContent).not.toContain(
      'Corrections will be handled through a separate audited workflow.',
    )
    expect(container.querySelector('#inventory-count-audit-original')).toBeTruthy()
    expect(container.querySelector('#inventory-count-audit-correction-1')).toBeTruthy()
    expect(container.querySelector('#inventory-count-audit-correction-2')).toBeTruthy()

    const badges = Array.from(container.querySelectorAll('[data-correction-delta-badge="true"]'))
      .map((node) => node.textContent)
    expect(badges).toContain('+1')
    expect(badges).toContain('−2')
    expect(
      container.querySelector('[data-correction-version="1"] [data-correction-delta-badge="true"]')
        ?.className,
    ).toContain('is-positive')
    expect(
      container.querySelector('[data-correction-version="2"] [data-correction-delta-badge="true"]')
        ?.className,
    ).toContain('is-negative')

    await act(async () => {
      timeline.querySelector('[data-timeline-target="2"]')?.click()
    })
    expect(scrollIntoViewMock).toHaveBeenCalled()
    expect(scrollIntoViewMock.mock.calls[0][0]).toMatchObject({
      behavior: 'smooth',
      block: 'start',
    })

    cleanup()
  })

  it('does not claim adjustment applied when movement reference is missing', async () => {
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
          movementId: null,
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

    expect(container.textContent).toContain('+2 recorded · adjustment reference unavailable')
    expect(container.textContent).not.toContain('+2 stock adjustment applied')

    cleanup()
  })

  it('keeps full product/location text with native titles and quiet missing movement (P8.20.12)', async () => {
    const fullName = 'Premium Extra Virgin Olive Oil Reserve Bottle 750ml Estate Selection'
    const movementId = '11111111-2222-3333-4444-555555555555'
    getPostedReviewMock.mockResolvedValueOnce(reviewFixture({
      items: [{
        id: 'line-1',
        itemName: fullName,
        unit: 'Bottle 750ml',
        storageLocation: 'Main Storage',
        lineStatus: 'counted',
        expectedAtCount: 6,
        countedQuantity: 6,
        varianceQuantity: 0,
        liveQuantityAtPost: 6,
        resultAfterPost: 6,
        postedMovementId: movementId,
      }, {
        id: 'line-2',
        itemName: 'Tonic',
        unit: 'bottle',
        storageLocation: 'Bar',
        lineStatus: 'counted',
        expectedAtCount: 3,
        countedQuantity: 3,
        varianceQuantity: 0,
        liveQuantityAtPost: 3,
        resultAfterPost: 3,
        postedMovementId: null,
      }],
    }))

    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
    }))
    await flush()

    const nameNode = container.querySelector('.inventory-count-posted-review-item-name')
    expect(nameNode?.textContent).toBe(fullName)
    expect(nameNode?.getAttribute('title')).toBe(fullName)

    const locationNode = container.querySelector('td.is-location')
    expect(locationNode?.textContent).toBe('Main Storage')
    expect(locationNode?.getAttribute('title')).toBe('Main Storage')

    const movementNodes = container.querySelectorAll('.inventory-count-posted-review-movement')
    expect(movementNodes[0]?.getAttribute('title')).toBe(movementId)
    expect(movementNodes[0]?.textContent).toContain('…')
    expect(movementNodes[1]?.textContent).toBe('—')
    expect(movementNodes[1]?.getAttribute('title')).toBeNull()

    const headers = Array.from(
      container.querySelectorAll('.inventory-count-posted-review-table thead th'),
    ).map((node) => node.textContent)
    expect(headers).toEqual([
      'Item',
      'Location',
      'Expected',
      'Counted',
      'Variance',
      'Posted',
      'Current',
      'Δ',
      'Movement',
    ])

    cleanup()
  })
})

describe('posted audit table CSS contracts (P8.20.11 / P8.20.12 / P8.20.13 / P8.20.14)', () => {
  it('keeps fixed layout, sticky opaque header, subtle zebra, clamp, and hierarchy', () => {
    const css = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8')
    const tableCssStart = css.indexOf('.inventory-count-posted-review-table-wrap {')
    const tableCssEnd = css.indexOf('.inventory-count-posted-review-corrections {')
    const tableCss = css.slice(tableCssStart, tableCssEnd)

    expect(tableCss).toContain('overflow-x: hidden')
    expect(tableCss).toContain('overflow-y: visible')
    expect(tableCss).not.toContain('overflow-y: auto')
    expect(tableCss).toContain('table-layout: fixed')
    expect(tableCss).toContain('min-width: 0')
    expect(tableCss).not.toContain('min-width: 920px')

    expect(tableCss).toContain('.inventory-count-posted-review-table thead th')
    expect(tableCss).toMatch(/position:\s*sticky/)
    expect(tableCss).toMatch(/top:\s*0/)
    expect(tableCss).toMatch(/z-index:\s*2/)
    expect(tableCss).toContain('background: #121214')
    expect(tableCss).toMatch(/box-shadow:\s*inset 0 -1px 0/)

    expect(tableCss).toContain('.inventory-count-posted-review-table tbody tr:nth-child(even) td')
    expect(tableCss).toContain('rgba(255, 247, 232, 0.025)')
    expect(tableCss).not.toMatch(/thead[^{]*nth-child\(even\)/)

    expect(tableCss).toMatch(/-webkit-line-clamp:\s*2/)
    expect(tableCss).toMatch(/line-clamp:\s*2/)
    expect(tableCss).toContain('.inventory-count-posted-review-table th.is-location')
    expect(tableCss).toContain('.inventory-count-posted-review-table td.is-location')
    expect(tableCss).toMatch(/white-space:\s*nowrap/)
    expect(tableCss).toContain('.inventory-count-posted-review-effective-qty')
    expect(tableCss).toContain('font-weight: 700')
    expect(tableCss).toContain('.inventory-count-posted-review-delta-badge.is-compact')
  })

  it('keeps a slightly stronger compact timeline contract', () => {
    const css = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8')
    const timelineStart = css.indexOf('.inventory-count-posted-review-timeline {')
    const timelineEnd = css.indexOf('.inventory-count-posted-review-timeline-details {')
    const timelineCss = css.slice(timelineStart, timelineEnd)

    expect(timelineCss).toContain('gap: 4px')
    expect(timelineCss).toContain('width: 12px')
    expect(timelineCss).toContain('height: 12px')
    expect(timelineCss).toContain('width: 1.5px')
    expect(timelineCss).toContain('rgba(212, 175, 55, 0.58)')
    expect(css).not.toContain('.inventory-count-posted-review-footnote')
  })

  it('keeps posted audit table hooks and compact headers unchanged', async () => {
    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
    }))
    await flush()

    expect(container.querySelector('[data-inventory-count-posted-review="true"]')).toBeTruthy()
    expect(container.querySelector('.inventory-count-posted-review-table')).toBeTruthy()
    expect(container.querySelector('[data-inventory-count-posted-lines="true"]')).toBeTruthy()
    expect(
      Array.from(container.querySelectorAll('.inventory-count-posted-review-table thead th'))
        .map((node) => node.textContent),
    ).toEqual([
      'Item',
      'Location',
      'Expected',
      'Counted',
      'Variance',
      'Posted',
      'Current',
      'Δ',
      'Movement',
    ])

    cleanup()
  })
})

describe('posted review reverse action foundation (P8.22.8)', () => {
  function setTextareaValue(node, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )?.set
    act(() => {
      nativeSetter?.call(node, value)
      node.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('hides Reverse when the operator cannot manage stock', async () => {
    canManageStockMock.mockReturnValue(false)

    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
    }))
    await flush()

    expect(container.querySelector('[data-inventory-count-reverse-action="true"]')).toBeNull()
    expect(container.querySelector('.inventory-count-posted-review-suggest-btn')).toBeTruthy()
    cleanup()
  })

  it('hides Reverse when the session is already reversed', async () => {
    getPostedReviewMock.mockResolvedValue(reviewFixture({
      session: {
        reversedAt: '2026-07-28T18:00:00.000Z',
      },
    }))

    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
    }))
    await flush()

    expect(container.querySelector('[data-inventory-count-reversed="true"]')).toBeTruthy()
    expect(container.querySelector('[data-inventory-count-reverse-action="true"]')).toBeNull()
    expect(container.querySelector('.inventory-count-posted-review-suggest-btn')).toBeNull()
    cleanup()
  })

  it('opens the reverse dialog and requires a trimmed reason before submit', async () => {
    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
    }))
    await flush()

    const reverseBtn = container.querySelector('[data-inventory-count-reverse-action="true"]')
    expect(reverseBtn).toBeTruthy()
    act(() => {
      reverseBtn.click()
    })
    await flush()

    expect(container.querySelector('[data-inventory-count-reverse-dialog="true"]')).toBeTruthy()
    expect(container.textContent).toContain('The original inventory count remains in history.')
    expect(container.textContent).toContain('Later stock movements are not affected.')

    const confirmBtn = container.querySelector('[data-inventory-count-reverse-confirm="true"]')
    expect(confirmBtn?.disabled).toBe(true)

    const reason = container.querySelector('[data-inventory-count-reverse-reason="true"]')
    setTextareaValue(reason, '   ')
    await flush()
    expect(container.querySelector('[data-inventory-count-reverse-confirm="true"]')?.disabled).toBe(true)

    setTextareaValue(reason, 'Posted in error')
    await flush()
    expect(container.querySelector('[data-inventory-count-reverse-confirm="true"]')?.disabled).toBe(false)

    cleanup()
  })

  it('calls the reversal service once, shows loading, and reloads on success', async () => {
    let resolveReverse
    reverseSessionMock.mockImplementationOnce(() => new Promise((resolve) => {
      resolveReverse = resolve
    }))

    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
    }))
    await flush()

    act(() => {
      container.querySelector('[data-inventory-count-reverse-action="true"]').click()
    })
    await flush()

    const reason = container.querySelector('[data-inventory-count-reverse-reason="true"]')
    const note = container.querySelector('[data-inventory-count-reverse-note="true"]')
    setTextareaValue(reason, ' Posted in error ')
    setTextareaValue(note, 'Ops note')
    await flush()

    const confirmBtn = container.querySelector('[data-inventory-count-reverse-confirm="true"]')
    act(() => {
      confirmBtn.click()
      confirmBtn.click()
    })
    await flush()

    expect(reverseSessionMock).toHaveBeenCalledTimes(1)
    expect(reverseSessionMock).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      sessionId: 'posted-1',
      reason: 'Posted in error',
      note: 'Ops note',
    })
    expect(container.textContent).toContain('Reversing…')
    expect(container.querySelector('[data-inventory-count-reverse-confirm="true"]')?.disabled).toBe(true)

    getPostedReviewMock.mockResolvedValueOnce(reviewFixture({
      session: {
        reversedAt: '2026-07-28T18:00:00.000Z',
      },
    }))

    await act(async () => {
      resolveReverse({
        reversalId: 'reversal-1',
        sessionId: 'posted-1',
        workspaceId: 'workspace-1',
        status: 'posted',
      })
      await Promise.resolve()
      await Promise.resolve()
    })
    await flush()

    expect(container.querySelector('[data-inventory-count-reverse-dialog="true"]')).toBeNull()
    expect(getPostedReviewMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(container.querySelector('[data-inventory-count-reverse-action="true"]')).toBeNull()
    cleanup()
  })

  it('renders mapped service errors inside the dialog', async () => {
    reverseSessionMock.mockRejectedValueOnce(
      new Error('This inventory count has already been reversed.'),
    )

    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
    }))
    await flush()

    act(() => {
      container.querySelector('[data-inventory-count-reverse-action="true"]').click()
    })
    await flush()

    const reason = container.querySelector('[data-inventory-count-reverse-reason="true"]')
    setTextareaValue(reason, 'Posted in error')
    await flush()

    await act(async () => {
      container.querySelector('[data-inventory-count-reverse-confirm="true"]').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await flush()

    expect(container.textContent).toContain('This inventory count has already been reversed.')
    expect(container.querySelector('[data-inventory-count-reverse-dialog="true"]')).toBeTruthy()
    cleanup()
  })
})

describe('posted review reversal completion & read-only lock (P8.23.0)', () => {
  it('shows Reversed badge, metadata, timeline event, and hides all actions', async () => {
    getPostedReviewMock.mockResolvedValue(reviewFixture({
      session: {
        reversedAt: '2026-07-28T18:00:00.000Z',
        reversedBy: 'user-posted',
        postedBy: 'user-posted',
        postedByName: 'Blake Owner',
        reversalReason: 'Posted in error',
      },
      reversal: {
        id: 'reversal-1',
        sessionId: 'posted-1',
        workspaceId: 'workspace-1',
        reason: 'Posted in error',
        note: 'Ops follow-up',
        createdBy: 'user-posted',
        createdAt: '2026-07-28T18:00:00.000Z',
        createdByName: 'Blake Owner',
      },
    }))

    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
      onSuggestCorrection: vi.fn(),
    }))
    await flush()

    expect(container.querySelector('[data-inventory-count-review-status="reversed"]')?.textContent)
      .toContain('Reversed')
    expect(container.querySelector('[data-inventory-count-reversed="true"]')).toBeTruthy()
    expect(container.querySelector('[data-inventory-count-reversed-at="true"]')?.textContent)
      .toContain('Reversed at')
    expect(container.querySelector('[data-inventory-count-reversed-by="true"]')?.textContent)
      .toContain('Blake Owner')
    expect(container.querySelector('[data-inventory-count-reversal-reason="true"]')?.textContent)
      .toContain('Posted in error')

    expect(container.querySelector('[data-inventory-count-audit-timeline="true"]')).toBeTruthy()
    expect(container.querySelector('[data-inventory-count-timeline-reversal="true"]')).toBeTruthy()
    const timelineLabels = Array.from(
      container.querySelectorAll('.inventory-count-posted-review-timeline-label'),
    ).map((node) => node.textContent)
    expect(timelineLabels).toEqual(['Posted Count', 'Reversal'])

    const reversalEvent = container.querySelector('[data-inventory-count-reversal-event="true"]')
    expect(reversalEvent).toBeTruthy()
    expect(reversalEvent.textContent).toContain('Blake Owner')
    expect(reversalEvent.textContent).toContain('Posted in error')
    expect(container.querySelector('[data-inventory-count-reversal-event-note="true"]')?.textContent)
      .toContain('Ops follow-up')

    expect(container.querySelector('[data-inventory-count-reverse-action="true"]')).toBeNull()
    expect(container.querySelector('.inventory-count-posted-review-suggest-btn')).toBeNull()
    expect(container.querySelector('[data-inventory-count-reverse-dialog="true"]')).toBeNull()
    expect(container.textContent).not.toContain('Suggest Correction')
    expect(
      Array.from(container.querySelectorAll('button'))
        .map((button) => button.textContent)
        .filter((label) => label === 'Reverse' || label === 'Suggest Correction'),
    ).toEqual([])

    cleanup()
  })

  it('appends Reversal after correction batches on the audit timeline', async () => {
    getPostedReviewMock.mockResolvedValue(reviewFixture({
      session: {
        reversedAt: '2026-07-28T19:00:00.000Z',
        reversedBy: 'user-1',
        reversalReason: 'Wrong location counted',
      },
      hasCorrections: true,
      correctionCount: 1,
      corrections: [
        {
          id: 'corr-1',
          createdAt: '2026-07-21T13:00:00.000Z',
          operatorName: 'Casey Ops',
          lines: [
            {
              id: 'corr-line-1',
              sessionItemId: 'line-1',
              itemName: 'Coca-Cola',
              originalQuantity: 8,
              correctedQuantity: 9,
              deltaQuantity: 1,
            },
          ],
        },
      ],
    }))

    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
    }))
    await flush()

    const timelineLabels = Array.from(
      container.querySelectorAll('.inventory-count-posted-review-timeline-label'),
    ).map((node) => node.textContent)
    expect(timelineLabels).toEqual(['Posted Count', 'Correction 1', 'Reversal'])
    expect(container.querySelector('[data-inventory-count-reversal-event="true"]')).toBeTruthy()
    expect(container.querySelector('[data-inventory-count-corrected-badge="true"]')).toBeTruthy()
    expect(container.querySelector('[data-inventory-count-audit-historical-note="true"]')?.textContent)
      .toContain('Reversal Applied')
    expect(container.textContent).toContain('Inventory impact has been fully compensated.')
    expect(container.textContent).toContain('Historical values are preserved for audit purposes.')
    expect(container.querySelector('[data-inventory-count-audit-summary="true"]')?.textContent)
      .toContain('Posted Total')
    expect(container.querySelector('[data-inventory-count-audit-summary="true"]')?.textContent)
      .toContain('Current Total')

    cleanup()
  })

  it('keeps non-reversed posted review status and actions unchanged', async () => {
    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
      onSuggestCorrection: vi.fn(),
    }))
    await flush()

    expect(container.querySelector('[data-inventory-count-review-status="posted"]')?.textContent)
      .toContain('Posted')
    expect(container.querySelector('[data-inventory-count-reversed="false"]')).toBeTruthy()
    expect(container.querySelector('[data-inventory-count-reversed-at="true"]')).toBeNull()
    expect(container.querySelector('[data-inventory-count-timeline-reversal="true"]')).toBeNull()
    expect(container.querySelector('[data-inventory-count-reversal-event="true"]')).toBeNull()
    expect(container.querySelector('[data-inventory-count-reversal-event-note="true"]')).toBeNull()
    expect(container.querySelector('[data-inventory-count-reverse-action="true"]')).toBeTruthy()
    expect(container.querySelector('.inventory-count-posted-review-suggest-btn')).toBeTruthy()
    expect(container.textContent).toContain('Suggest Correction')
    expect(container.querySelector('[data-inventory-count-audit-historical-note="true"]')).toBeNull()

    cleanup()
  })
})

describe('posted review reversal audit note loading (P8.23.0a)', () => {
  it('renders optional non-empty reversal note from the audit header only', async () => {
    getPostedReviewMock.mockResolvedValue(reviewFixture({
      session: {
        reversedAt: '2026-07-28T18:00:00.000Z',
        reversedBy: 'user-1',
        startedBy: 'user-1',
        reversalReason: 'Posted in error',
        operatorName: 'Alex Manager',
      },
      reversal: {
        id: 'reversal-1',
        reason: 'Posted in error',
        note: '  Desk note from audit header  ',
        createdBy: 'user-1',
        createdAt: '2026-07-28T18:00:00.000Z',
      },
    }))

    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
    }))
    await flush()

    const note = container.querySelector('[data-inventory-count-reversal-event-note="true"]')
    expect(note?.textContent).toContain('Desk note from audit header')
    expect(container.querySelector('[data-inventory-count-reversal-event-reason="true"]')?.textContent)
      .toContain('Posted in error')
    expect(container.querySelector('[data-inventory-count-reversal-event="true"]')?.textContent)
      .toContain('Alex Manager')

    cleanup()
  })

  it('does not render an empty Note row when audit note is blank', async () => {
    getPostedReviewMock.mockResolvedValue(reviewFixture({
      session: {
        reversedAt: '2026-07-28T18:00:00.000Z',
        reversedBy: 'user-1',
        reversalReason: 'Wrong count',
        operatorName: 'Alex Manager',
      },
      reversal: {
        id: 'reversal-1',
        reason: 'Wrong count',
        note: '   ',
        createdBy: 'user-1',
        createdAt: '2026-07-28T18:00:00.000Z',
      },
    }))

    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
    }))
    await flush()

    expect(container.querySelector('[data-inventory-count-reversal-event="true"]')).toBeTruthy()
    expect(container.querySelector('[data-inventory-count-reversal-event-note="true"]')).toBeNull()
    expect(container.querySelector('[data-inventory-count-reversal-event-reason="true"]')?.textContent)
      .toContain('Wrong count')
    expect(container.textContent).not.toMatch(/\bNote:\s*$/m)

    cleanup()
  })

  it('keeps REVERSED read-only state when reversal audit header is missing', async () => {
    getPostedReviewMock.mockResolvedValue(reviewFixture({
      session: {
        reversedAt: '2026-07-28T18:00:00.000Z',
        reversedBy: 'user-1',
        reversalReason: 'Posted in error',
        postedByName: 'Blake Owner',
        operatorName: 'Alex Manager',
      },
      reversal: null,
    }))

    const { container, cleanup } = render(createElement(InventoryCountPostedReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onClose: vi.fn(),
      onSuggestCorrection: vi.fn(),
    }))
    await flush()

    expect(container.querySelector('[data-inventory-count-review-status="reversed"]')).toBeTruthy()
    expect(container.querySelector('[data-inventory-count-reversed="true"]')).toBeTruthy()
    expect(container.querySelector('[data-inventory-count-reversal-event="true"]')).toBeTruthy()
    expect(container.querySelector('[data-inventory-count-reversal-event-note="true"]')).toBeNull()
    expect(container.querySelector('[data-inventory-count-reverse-action="true"]')).toBeNull()
    expect(container.querySelector('.inventory-count-posted-review-suggest-btn')).toBeNull()
    expect(container.querySelector('[data-inventory-count-reverse-dialog="true"]')).toBeNull()

    cleanup()
  })
})
