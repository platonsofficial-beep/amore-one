/**
 * @vitest-environment jsdom
 * P8.20.5 / P8.20.6 / P8.20.8 — Inventory Count Correction Review + Apply.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  InventoryCountCorrectionReview,
  buildInventoryCountCorrectionDraft,
  computeInventoryCountCorrectionApplyMath,
  getInventoryCountCorrectionChanges,
  sumPriorCorrectionDeltasBySessionItemId,
} from './InventoryCountCorrectionReview'

const getPostedReviewMock = vi.fn()
const applyCorrectionsMock = vi.fn()
const previewFinishMock = vi.fn(() => {
  throw new Error('Finish Preview must not be called from correction review')
})

vi.mock('../../services/inventoryCountService', () => ({
  getInventoryCountPostedReview: (...args) => getPostedReviewMock(...args),
  applyInventoryCountCorrections: (...args) => applyCorrectionsMock(...args),
  previewInventoryCountFinish: (...args) => previewFinishMock(...args),
  postInventoryCountFinish: vi.fn(() => {
    throw new Error('Post must not be called from correction review')
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

function getButtonByText(root, text) {
  return Array.from(root.querySelectorAll('button')).find((button) => button.textContent === text)
}

function setInputValue(input, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set
  nativeInputValueSetter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function reviewFixture() {
  return {
    session: {
      id: 'posted-1',
      workspaceId: 'workspace-1',
      status: 'posted',
      statusLabel: 'Posted',
      countTypeLabel: 'Quick Count',
    },
    locations: [],
    items: [
      {
        id: 'line-1',
        itemName: 'Coca-Cola',
        unit: 'case',
        storageLocation: 'Bar',
        lineStatus: 'counted',
        countedQuantity: 8,
      },
      {
        id: 'line-2',
        itemName: 'Tonic',
        unit: 'bottle',
        storageLocation: 'Bar',
        lineStatus: 'counted',
        countedQuantity: 12,
      },
    ],
    summary: {},
    corrections: [],
    correctionCount: 0,
    hasCorrections: false,
  }
}

beforeEach(() => {
  getPostedReviewMock.mockReset()
  applyCorrectionsMock.mockReset()
  previewFinishMock.mockClear()
  getPostedReviewMock.mockResolvedValue(reviewFixture())
  applyCorrectionsMock.mockResolvedValue({
    correctionId: 'corr-1',
    lineCount: 1,
    movementCount: 1,
    message: 'Inventory count corrections applied successfully.',
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('effective baseline math (P8.20.8)', () => {
  it('computes first correction from posted counted with no prior deltas', () => {
    expect(computeInventoryCountCorrectionApplyMath({
      countedQuantity: 6,
      priorDeltaQuantities: [],
      correctedQuantity: 7,
    })).toEqual({
      effectiveBefore: 6,
      appliedDelta: 1,
      effectiveAfter: 7,
    })
  })

  it('computes repeated correction from latest effective quantity', () => {
    expect(computeInventoryCountCorrectionApplyMath({
      countedQuantity: 6,
      priorDeltaQuantities: [1],
      correctedQuantity: 4,
    })).toEqual({
      effectiveBefore: 7,
      appliedDelta: -3,
      effectiveAfter: 4,
    })
  })

  it('repairs existing production history 6 +1 −2 → effective 5 → 4', () => {
    expect(computeInventoryCountCorrectionApplyMath({
      countedQuantity: 6,
      priorDeltaQuantities: [1, -2],
      correctedQuantity: 4,
    })).toEqual({
      effectiveBefore: 5,
      appliedDelta: -1,
      effectiveAfter: 4,
    })
  })

  it('treats zero-delta repeated correction as no-op math', () => {
    expect(computeInventoryCountCorrectionApplyMath({
      countedQuantity: 6,
      priorDeltaQuantities: [1, -2],
      correctedQuantity: 5,
    })).toEqual({
      effectiveBefore: 5,
      appliedDelta: 0,
      effectiveAfter: 5,
    })
  })

  it('supports positive and negative repeated corrections independently per item', () => {
    const cola = computeInventoryCountCorrectionApplyMath({
      countedQuantity: 10,
      priorDeltaQuantities: [-2],
      correctedQuantity: 12,
    })
    const tonic = computeInventoryCountCorrectionApplyMath({
      countedQuantity: 3,
      priorDeltaQuantities: [4],
      correctedQuantity: 2,
    })
    expect(cola).toEqual({ effectiveBefore: 8, appliedDelta: 4, effectiveAfter: 12 })
    expect(tonic).toEqual({ effectiveBefore: 7, appliedDelta: -5, effectiveAfter: 2 })
  })

  it('sums prior deltas by session item for reconstruction of null-baseline rows', () => {
    const deltas = sumPriorCorrectionDeltasBySessionItemId([
      {
        id: 'corr-1',
        lines: [
          { sessionItemId: 'line-1', deltaQuantity: 1, baselineQuantity: null },
          { sessionItemId: 'line-2', deltaQuantity: 4 },
        ],
      },
      {
        id: 'corr-2',
        lines: [
          { sessionItemId: 'line-1', deltaQuantity: -2, baselineQuantity: null },
        ],
      },
    ])
    expect(deltas.get('line-1')).toBe(-1)
    expect(deltas.get('line-2')).toBe(4)
  })
})

describe('correction draft helpers (P8.20.5/P8.20.6/P8.20.8)', () => {
  it('initializes corrected input from latest effective quantity', () => {
    const draft = buildInventoryCountCorrectionDraft(
      [{ id: 'line-1', itemName: 'Coca-Cola', countedQuantity: 6, storageLocation: 'Bar' }],
      [{
        id: 'corr-1',
        lines: [{ sessionItemId: 'line-1', deltaQuantity: 1 }],
      }, {
        id: 'corr-2',
        lines: [{ sessionItemId: 'line-1', deltaQuantity: -2 }],
      }],
    )
    expect(draft[0]).toMatchObject({
      id: 'line-1',
      originalCountedQuantity: 6,
      effectiveQuantity: 5,
      correctedQuantity: 5,
      correctedInput: '5',
      hasAppliedCorrection: true,
    })
  })

  it('builds draft rows and marks previously corrected lines', () => {
    const draft = buildInventoryCountCorrectionDraft(
      [{ id: 'line-1', itemName: 'Coca-Cola', countedQuantity: 8, storageLocation: 'Bar' }],
      ['line-1'],
    )
    expect(draft[0]).toMatchObject({
      id: 'line-1',
      originalCountedQuantity: 8,
      effectiveQuantity: 8,
      hasAppliedCorrection: true,
    })
  })

  it('lists only non-zero changed rows with differences from effective baseline', () => {
    const changes = getInventoryCountCorrectionChanges([
      {
        id: 'line-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Bar',
        originalCountedQuantity: 6,
        effectiveQuantity: 5,
        correctedQuantity: 4,
      },
      {
        id: 'line-2',
        itemName: 'Tonic',
        storageLocation: 'Bar',
        originalCountedQuantity: 12,
        effectiveQuantity: 12,
        correctedQuantity: 12,
      },
    ])
    expect(changes).toEqual([{
      id: 'line-1',
      sessionItemId: 'line-1',
      itemId: null,
      itemName: 'Coca-Cola',
      storageLocation: 'Bar',
      oldQuantity: 5,
      newQuantity: 4,
      originalCountedQuantity: 6,
      effectiveQuantity: 5,
      correctedQuantity: 4,
      difference: -1,
    }])
  })

  it('keeps original posted quantity available while execution uses effective', () => {
    const draft = buildInventoryCountCorrectionDraft(
      [{ id: 'line-1', itemName: 'Coca-Cola', countedQuantity: 6 }],
      [{ lines: [{ sessionItemId: 'line-1', deltaQuantity: 1 }] }],
    )
    expect(draft[0].originalCountedQuantity).toBe(6)
    expect(draft[0].effectiveQuantity).toBe(7)
    expect(draft[0].correctedInput).toBe('7')
  })
})

describe('InventoryCountCorrectionReview apply (P8.20.6/P8.20.8)', () => {
  it('loads posted snapshot with read-only lines until Correction Mode', async () => {
    const { container, cleanup } = render(createElement(InventoryCountCorrectionReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onCancel: vi.fn(),
    }))
    await flush()

    expect(getPostedReviewMock).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      sessionId: 'posted-1',
    })
    expect(previewFinishMock).not.toHaveBeenCalled()
    expect(container.querySelector('input')).toBeNull()
    expect(container.textContent).not.toContain('Save')
    expect(container.textContent).not.toContain('Update')
    expect(container.textContent).toContain('Current Effective')

    cleanup()
  })

  it('applies corrections after confirmation and skips zero deltas', async () => {
    const onApplied = vi.fn()
    const { container, cleanup } = render(createElement(InventoryCountCorrectionReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onCancel: vi.fn(),
      onApplied,
    }))
    await flush()

    await act(async () => {
      getButtonByText(container, 'Enter Correction Mode')?.click()
    })
    await act(async () => {
      setInputValue(container.querySelectorAll('.inventory-count-correction-qty-input')[0], '10')
    })
    await act(async () => {
      getButtonByText(container, 'Review Corrections')?.click()
    })

    const summary = container.querySelector('[aria-labelledby="inventory-count-correction-summary-title"]')
    expect(summary?.textContent).toContain('Current Effective')
    expect(summary?.textContent).toContain('Corrected')
    expect(summary?.textContent).toContain('Delta')
    expect(summary?.textContent).toContain('Coca-Cola')

    await act(async () => {
      getButtonByText(summary, 'Apply Corrections')?.click()
    })

    const confirm = container.querySelector('[aria-labelledby="inventory-count-correction-apply-title"]')
    expect(confirm?.textContent).toContain('Apply Inventory Corrections?')
    expect(confirm?.textContent).toContain('original posted inventory count will remain unchanged')
    expect(confirm?.textContent).toContain('New adjustment movements')

    await act(async () => {
      getButtonByText(confirm, 'Apply Corrections')?.click()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(applyCorrectionsMock).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      sessionId: 'posted-1',
      corrections: [
        expect.objectContaining({
          id: 'line-1',
          effectiveQuantity: 8,
          originalCountedQuantity: 8,
          correctedQuantity: 10,
          difference: 2,
        }),
      ],
    })
    expect(onApplied).toHaveBeenCalled()
    expect(previewFinishMock).not.toHaveBeenCalled()

    cleanup()
  })

  it('initializes previously corrected rows from reconstructed effective quantity', async () => {
    getPostedReviewMock.mockResolvedValueOnce({
      ...reviewFixture(),
      items: [{
        id: 'line-1',
        itemName: 'Coca-Cola',
        unit: 'case',
        storageLocation: 'Bar',
        lineStatus: 'counted',
        countedQuantity: 6,
      }],
      corrections: [{
        id: 'corr-1',
        lines: [{ sessionItemId: 'line-1', deltaQuantity: 1 }],
      }, {
        id: 'corr-2',
        lines: [{ sessionItemId: 'line-1', deltaQuantity: -2 }],
      }],
      correctionCount: 2,
      hasCorrections: true,
    })

    const { container, cleanup } = render(createElement(InventoryCountCorrectionReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onCancel: vi.fn(),
    }))
    await flush()

    const appliedRow = container.querySelector('[data-correction-applied="true"]')
    expect(appliedRow).toBeTruthy()
    expect(appliedRow?.textContent).toContain('5')
    expect(appliedRow?.textContent).toContain('Posted 6')

    await act(async () => {
      getButtonByText(container, 'Enter Correction Mode')?.click()
    })
    const input = container.querySelector('.inventory-count-correction-qty-input')
    expect(input?.value).toBe('5')

    await act(async () => {
      setInputValue(input, '4')
    })
    await act(async () => {
      getButtonByText(container, 'Review Corrections')?.click()
    })

    const summary = container.querySelector('[aria-labelledby="inventory-count-correction-summary-title"]')
    expect(summary?.textContent).toContain('-1')

    cleanup()
  })

  it('highlights previously applied correction lines permanently', async () => {
    getPostedReviewMock.mockResolvedValueOnce({
      ...reviewFixture(),
      corrections: [{
        id: 'corr-1',
        lines: [{ sessionItemId: 'line-1', deltaQuantity: 2 }],
      }],
      correctionCount: 1,
      hasCorrections: true,
    })

    const { container, cleanup } = render(createElement(InventoryCountCorrectionReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onCancel: vi.fn(),
    }))
    await flush()

    const appliedRow = container.querySelector('[data-correction-applied="true"]')
    expect(appliedRow).toBeTruthy()
    expect(appliedRow?.className).toContain('is-changed')
    expect(appliedRow?.textContent).toContain('Coca-Cola')

    cleanup()
  })
})
