/**
 * @vitest-environment node
 * P8.29.11 — Inventory location quantity expression parser.
 */
import { describe, expect, it } from 'vitest'
import {
  INVENTORY_LOCATION_QUANTITY_PARSE_STATUS,
  INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE,
  INVENTORY_LOCATION_QUANTITY_WARNING,
  parseInventoryLocationQuantity,
} from './inventoryLocationQuantityParser.js'

describe('parseInventoryLocationQuantity', () => {
  it('treats null/undefined/empty/whitespace as empty (not zero, not blocker)', () => {
    for (const value of [null, undefined, '', '   ', '\t']) {
      expect(parseInventoryLocationQuantity(value)).toEqual({
        parsedQuantity: null,
        parseStatus: INVENTORY_LOCATION_QUANTITY_PARSE_STATUS.EMPTY,
        validationState: INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.VALID,
        warnings: [],
        evidence: {},
      })
    }
  })

  it('parses plain integers, decimals, zero, and numeric strings', () => {
    expect(parseInventoryLocationQuantity(66)).toMatchObject({
      parsedQuantity: 66,
      parseStatus: 'ok',
      validationState: 'valid',
    })
    expect(parseInventoryLocationQuantity('66')).toMatchObject({
      parsedQuantity: 66,
      parseStatus: 'ok',
      validationState: 'valid',
    })
    expect(parseInventoryLocationQuantity('12.5')).toMatchObject({
      parsedQuantity: 12.5,
      parseStatus: 'ok',
      validationState: 'valid',
    })
    expect(parseInventoryLocationQuantity('0')).toMatchObject({
      parsedQuantity: 0,
      parseStatus: 'ok',
      validationState: 'valid',
    })
    expect(parseInventoryLocationQuantity(0)).toMatchObject({
      parsedQuantity: 0,
      parseStatus: 'ok',
      validationState: 'valid',
    })
  })

  it('sums additive expressions and records formula evidence', () => {
    expect(parseInventoryLocationQuantity('288+180')).toEqual({
      parsedQuantity: 468,
      parseStatus: INVENTORY_LOCATION_QUANTITY_PARSE_STATUS.EXPRESSION_OK,
      validationState: INVENTORY_LOCATION_QUANTITY_VALIDATION_STATE.WARNING,
      warnings: [INVENTORY_LOCATION_QUANTITY_WARNING.EXPRESSION_SUMMED],
      evidence: { formulaParts: [288, 180] },
    })
    expect(parseInventoryLocationQuantity('20 + 10 + 5')).toMatchObject({
      parsedQuantity: 35,
      parseStatus: 'expression_ok',
      validationState: 'warning',
      warnings: ['expression_summed'],
      evidence: { formulaParts: [20, 10, 5] },
    })
    expect(parseInventoryLocationQuantity('0+4')).toMatchObject({
      parsedQuantity: 4,
      parseStatus: 'expression_ok',
      evidence: { formulaParts: [0, 4] },
    })
  })

  it('blocks negatives, subtraction, multiplication, division, and malformed forms', () => {
    expect(parseInventoryLocationQuantity(-1).validationState).toBe('blocker')
    expect(parseInventoryLocationQuantity('-5').warnings).toContain('location_quantity_negative')
    expect(parseInventoryLocationQuantity('10-2').validationState).toBe('blocker')
    expect(parseInventoryLocationQuantity('2*3').validationState).toBe('blocker')
    expect(parseInventoryLocationQuantity('8/2').validationState).toBe('blocker')
    expect(parseInventoryLocationQuantity('abc').parseStatus).toBe('malformed')
    expect(parseInventoryLocationQuantity('10++5').parseStatus).toBe('malformed')
    expect(parseInventoryLocationQuantity('12.').parseStatus).toBe('malformed')
    expect(parseInventoryLocationQuantity('1+').parseStatus).toBe('malformed')
    expect(parseInventoryLocationQuantity('+1').parseStatus).toBe('malformed')
    expect(parseInventoryLocationQuantity(Number.NaN).parseStatus).toBe('malformed')
    expect(parseInventoryLocationQuantity(Number.POSITIVE_INFINITY).parseStatus).toBe('malformed')
  })

  it('does not use eval or dynamic execution', () => {
    const source = String(parseInventoryLocationQuantity)
    expect(source).not.toMatch(/\beval\b/)
    expect(source).not.toMatch(/new Function/)
    expect(source).not.toMatch(/Function\(/)
    // Side-effect probe: expression-looking strings must not execute.
    globalThis.__qtyParserProbe = 0
    parseInventoryLocationQuantity('1+globalThis.__qtyParserProbe++')
    expect(globalThis.__qtyParserProbe).toBe(0)
    delete globalThis.__qtyParserProbe
  })
})
