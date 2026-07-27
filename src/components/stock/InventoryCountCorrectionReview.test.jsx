/**
 * @vitest-environment jsdom
 * P8.20.5 / P8.20.6 — Inventory Count Correction Review + Apply.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  InventoryCountCorrectionReview,
  buildInventoryCountCorrectionDraft,
  getInventoryCountCorrectionChanges,
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

describe('correction draft helpers (P8.20.5/P8.20.6)', () => {
  it('builds draft rows and marks previously corrected lines', () => {
    const draft = buildInventoryCountCorrectionDraft(
      [{ id: 'line-1', itemName: 'Coca-Cola', countedQuantity: 8, storageLocation: 'Bar' }],
      ['line-1'],
    )
    expect(draft[0]).toMatchObject({
      id: 'line-1',
      originalCountedQuantity: 8,
      hasAppliedCorrection: true,
    })
  })

  it('lists only non-zero changed rows with differences', () => {
    const changes = getInventoryCountCorrectionChanges([
      {
        id: 'line-1',
        itemName: 'Coca-Cola',
        storageLocation: 'Bar',
        originalCountedQuantity: 8,
        correctedQuantity: 10,
      },
      {
        id: 'line-2',
        itemName: 'Tonic',
        storageLocation: 'Bar',
        originalCountedQuantity: 12,
        correctedQuantity: 12,
      },
    ])
    expect(changes).toEqual([{
      id: 'line-1',
      sessionItemId: 'line-1',
      itemId: null,
      itemName: 'Coca-Cola',
      storageLocation: 'Bar',
      oldQuantity: 8,
      newQuantity: 10,
      originalCountedQuantity: 8,
      correctedQuantity: 10,
      difference: 2,
    }])
  })
})

describe('InventoryCountCorrectionReview apply (P8.20.6)', () => {
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
    expect(summary?.textContent).toContain('Original')
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

  it('highlights previously applied correction lines permanently', async () => {
    getPostedReviewMock.mockResolvedValueOnce({
      ...reviewFixture(),
      corrections: [{
        id: 'corr-1',
        lines: [{ sessionItemId: 'line-1' }],
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
