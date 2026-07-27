/**
 * @vitest-environment jsdom
 * P8.20.5 — Inventory Count Correction Review foundation.
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
const previewFinishMock = vi.fn(() => {
  throw new Error('Finish Preview must not be called from correction review')
})

vi.mock('../../services/inventoryCountService', () => ({
  getInventoryCountPostedReview: (...args) => getPostedReviewMock(...args),
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
  }
}

beforeEach(() => {
  getPostedReviewMock.mockReset()
  previewFinishMock.mockClear()
  getPostedReviewMock.mockResolvedValue(reviewFixture())
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

describe('correction draft helpers (P8.20.5)', () => {
  it('builds draft rows from posted counted quantities', () => {
    const draft = buildInventoryCountCorrectionDraft([
      { id: 'line-1', itemName: 'Coca-Cola', countedQuantity: 8, storageLocation: 'Bar' },
    ])
    expect(draft[0]).toMatchObject({
      id: 'line-1',
      originalCountedQuantity: 8,
      correctedQuantity: 8,
      correctedInput: '8',
    })
  })

  it('lists only changed rows with differences', () => {
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
      itemName: 'Coca-Cola',
      storageLocation: 'Bar',
      oldQuantity: 8,
      newQuantity: 10,
      difference: 2,
    }])
  })
})

describe('InventoryCountCorrectionReview (P8.20.5)', () => {
  function setInputValue(input, value) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set
    nativeInputValueSetter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }

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
    expect(container.textContent).toContain('Suggest Correction')
    expect(container.textContent).toContain('Original counted')
    expect(container.textContent).toContain('Coca-Cola')
    expect(container.querySelector('input')).toBeNull()
    expect(container.textContent).not.toContain('Apply')
    expect(container.textContent).not.toContain('Post Count')
    expect(container.textContent).not.toContain('Finish Count')

    cleanup()
  })

  it('enables corrected quantity editing only in Correction Mode and highlights changes', async () => {
    const { container, cleanup } = render(createElement(InventoryCountCorrectionReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onCancel: vi.fn(),
    }))
    await flush()

    await act(async () => {
      getButtonByText(container, 'Enter Correction Mode')?.click()
    })

    expect(
      container.querySelector('[data-correction-mode="true"]'),
    ).toBeTruthy()
    const inputs = container.querySelectorAll('.inventory-count-correction-qty-input')
    expect(inputs).toHaveLength(2)
    expect(container.textContent).toContain('8')

    await act(async () => {
      setInputValue(inputs[0], '10')
    })

    const changedRow = container.querySelector('[data-correction-changed="true"]')
    expect(changedRow).toBeTruthy()
    expect(changedRow?.textContent).toContain('Coca-Cola')
    expect(changedRow?.textContent).toContain('8')
    expect(changedRow?.className).toContain('is-changed')

    cleanup()
  })

  it('Review Corrections shows summary without Apply and Cancel returns', async () => {
    const onCancel = vi.fn()
    const { container, cleanup } = render(createElement(InventoryCountCorrectionReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onCancel,
    }))
    await flush()

    await act(async () => {
      getButtonByText(container, 'Enter Correction Mode')?.click()
    })

    await act(async () => {
      setInputValue(container.querySelectorAll('.inventory-count-correction-qty-input')[0], '11')
    })

    await act(async () => {
      getButtonByText(container, 'Review Corrections')?.click()
    })

    const dialog = container.querySelector('[aria-labelledby="inventory-count-correction-summary-title"]')
    expect(dialog).toBeTruthy()
    expect(dialog?.textContent).toContain('Review Corrections')
    expect(dialog?.textContent).toContain('Old quantity')
    expect(dialog?.textContent).toContain('New quantity')
    expect(dialog?.textContent).toContain('Difference')
    expect(dialog?.textContent).toContain('Coca-Cola')
    expect(dialog?.textContent).toContain('No stock updates are applied')
    expect(container.textContent).not.toContain('Apply Corrections')
    expect(previewFinishMock).not.toHaveBeenCalled()

    await act(async () => {
      getButtonByText(container, 'Cancel')?.click()
    })
    expect(onCancel).toHaveBeenCalledTimes(1)

    cleanup()
  })

  it('surfaces load errors without mutation actions', async () => {
    getPostedReviewMock.mockRejectedValueOnce(new Error('permission denied for table'))

    const { container, cleanup } = render(createElement(InventoryCountCorrectionReview, {
      sessionId: 'posted-1',
      workspaceId: 'workspace-1',
      onCancel: vi.fn(),
    }))
    await flush()

    expect(container.textContent).toContain('permission denied for table')
    expect(container.querySelector('input')).toBeNull()
    expect(getButtonByText(container, 'Enter Correction Mode')?.disabled).toBe(true)

    cleanup()
  })
})
