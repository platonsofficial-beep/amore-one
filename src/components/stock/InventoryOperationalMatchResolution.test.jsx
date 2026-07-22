/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  matchInventoryOperationalProducts,
} from '../../lib/inventoryOperationalProductMatcher'
import {
  buildInventoryOperationalImportPreview,
} from '../../lib/inventoryOperationalImportPreview'
import {
  INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION,
  getOperationalMatchResolutionRowKey,
} from '../../lib/inventoryOperationalMatchResolutions'
import {
  InventoryOperationalMatchResolution,
  listOperationalPossibleMatchRows,
} from './InventoryOperationalMatchResolution'

function stock(partial) {
  return {
    id: partial.id,
    name: partial.name,
    category: partial.category ?? 'Vodka',
    unit: partial.unit ?? 'Bottle',
    sku: null,
    active: partial.active ?? true,
  }
}

function buildBasePreview() {
  const operationalModel = {
    categories: [{
      name: 'VODKA',
      products: [
        {
          name: 'Ketel One 70cl',
          storage: 4,
          bar: 1,
          weekdays: null,
          order: null,
          stockControl: null,
        },
        {
          name: 'Ketel One 1lt',
          storage: 2,
          bar: 0,
          weekdays: null,
          order: null,
          stockControl: null,
        },
      ],
    }],
  }
  const existingStockItems = [
    stock({ id: 'ko', name: 'KETEL ONE', category: 'Vodka', unit: 'Bottle 0.7L', active: true }),
  ]
  const matchingResult = matchInventoryOperationalProducts({
    operationalModel,
    existingStockItems,
  })
  return buildInventoryOperationalImportPreview({
    operationalModel,
    matchingResult,
    existingStockItems,
  })
}

describe('InventoryOperationalMatchResolution', () => {
  let container
  let root

  afterEach(() => {
    act(() => {
      root?.unmount()
    })
    container?.remove()
    container = null
    root = null
  })

  function renderResolution(props) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(createElement(InventoryOperationalMatchResolution, props))
    })
  }

  it('renders header, counts, source facts, candidates, and no initial selection', () => {
    const basePreview = buildBasePreview()
    const onChangeResolution = vi.fn()
    renderResolution({
      basePreview,
      resolutions: {},
      onChangeResolution,
    })

    expect(container.textContent).toContain('Resolve Possible Matches')
    expect(container.textContent).toContain('Total possible matches: 2')
    expect(container.textContent).toContain('Resolved: 0')
    expect(container.textContent).toContain('Remaining: 2')
    expect(container.textContent).toContain('Ketel One 70cl')
    expect(container.textContent).toContain('Ketel One 1lt')
    expect(container.textContent).toContain('Storage')
    expect(container.textContent).toContain('4')
    expect(container.textContent).toContain('BAR')
    expect(container.textContent).toContain('KETEL ONE')
    expect(container.textContent).toContain('Bottle 0.7L')
    expect(container.textContent).toContain('Active')
    expect(container.textContent).toContain('Needs decision')

    const checked = container.querySelectorAll('input[type="radio"]:checked')
    expect(checked).toHaveLength(0)
    expect(onChangeResolution).not.toHaveBeenCalled()
  })

  it('selecting a candidate links existing and create/skip clear the candidate', () => {
    const basePreview = buildBasePreview()
    const key = getOperationalMatchResolutionRowKey(basePreview.rows[0], 0)
    /** @type {Record<string, object>} */
    let resolutions = {}
    const onChangeResolution = vi.fn((rowKey, next) => {
      resolutions = { ...resolutions, [rowKey]: next }
      act(() => {
        root.render(createElement(InventoryOperationalMatchResolution, {
          basePreview,
          resolutions,
          onChangeResolution,
        }))
      })
    })

    renderResolution({
      basePreview,
      resolutions,
      onChangeResolution,
    })

    const candidateRadio = container.querySelector(`input[name="match-resolution-candidate-${key}"]`)
    expect(candidateRadio).toBeTruthy()
    act(() => {
      candidateRadio.click()
    })

    expect(onChangeResolution).toHaveBeenCalledWith(key, {
      decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.LINK_EXISTING,
      selectedStockItemId: 'ko',
    })
    expect(container.textContent).toContain('Resolved')
    expect(container.getAttribute('data-resolved-count')
      || container.querySelector('[data-resolved-count]')?.getAttribute('data-resolved-count'))
      .toBe('1')

    const createRadio = Array.from(container.querySelectorAll(`input[name="match-resolution-decision-${key}"]`))
      .find((input) => input.value === 'create_new')
    act(() => {
      createRadio.click()
    })
    expect(onChangeResolution).toHaveBeenCalledWith(key, {
      decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.CREATE_NEW,
      selectedStockItemId: null,
    })

    const skipRadio = Array.from(container.querySelectorAll(`input[name="match-resolution-decision-${key}"]`))
      .find((input) => input.value === 'skip')
    act(() => {
      skipRadio.click()
    })
    expect(onChangeResolution).toHaveBeenCalledWith(key, {
      decision: INVENTORY_OPERATIONAL_MATCH_RESOLUTION_DECISION.SKIP,
      selectedStockItemId: null,
    })
  })

  it('shows empty state when no possible matches exist', () => {
    renderResolution({
      basePreview: {
        previewVersion: 1,
        rows: [{
          source: { productName: 'Belvedere', category: 'VODKA', storage: 1, bar: 1 },
          match: { status: 'exact_match', candidates: [], evidence: [] },
          proposedAction: 'link_existing',
        }],
        summary: {},
      },
      resolutions: {},
    })

    expect(container.textContent).toContain('No matches need resolution')
    expect(listOperationalPossibleMatchRows({
      rows: [{ match: { status: 'exact_match' } }],
    })).toHaveLength(0)
  })

  it('supports keyboard-focusable radios and no Apply control', () => {
    const basePreview = buildBasePreview()
    renderResolution({
      basePreview,
      resolutions: {},
      onChangeResolution: vi.fn(),
    })

    const radios = container.querySelectorAll('input[type="radio"]')
    expect(radios.length).toBeGreaterThan(0)
    radios.forEach((radio) => {
      expect(radio.tabIndex === 0 || radio.tabIndex === -1 || !radio.hasAttribute('tabindex')).toBe(true)
      expect(radio.disabled).toBe(false)
    })
    expect(container.textContent).not.toMatch(/\bApply\b/)
    expect(container.querySelector('button')).toBeNull()
  })
})
