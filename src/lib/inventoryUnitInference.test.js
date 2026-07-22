import { describe, expect, it } from 'vitest'
import {
  INVENTORY_UNIT_INFERENCE_REASON,
  INVENTORY_UNIT_INFERENCE_STATUS,
  InventoryUnitInferenceError,
  inferInventoryUnitFromProductName,
} from './inventoryUnitInference.js'

describe('inferInventoryUnitFromProductName', () => {
  it('infers supported bottle volumes from AMORE-style names', () => {
    expect(inferInventoryUnitFromProductName('Ketel One 70cl')).toMatchObject({
      status: INVENTORY_UNIT_INFERENCE_STATUS.INFERRED,
      proposedUnit: 'Bottle 700ml',
      normalizedVolumeMl: 700,
      reason: INVENTORY_UNIT_INFERENCE_REASON.EXPLICIT_SUPPORTED_VOLUME,
    })
    expect(inferInventoryUnitFromProductName('Ketel One 70 CL').proposedUnit).toBe('Bottle 700ml')
    expect(inferInventoryUnitFromProductName('Wine 75cl').proposedUnit).toBe('Bottle 750ml')
    expect(inferInventoryUnitFromProductName('Campari 1lt').proposedUnit).toBe('Bottle 1L')
    expect(inferInventoryUnitFromProductName('Aperol 1 LT').proposedUnit).toBe('Bottle 1L')
    expect(inferInventoryUnitFromProductName('Product 1L').proposedUnit).toBe('Bottle 1L')
    expect(inferInventoryUnitFromProductName('Product 1000ml').proposedUnit).toBe('Bottle 1L')
    expect(inferInventoryUnitFromProductName('Product 1.5lt').proposedUnit).toBe('Bottle 1.5L')
    expect(inferInventoryUnitFromProductName('Product 1,5lt').proposedUnit).toBe('Bottle 1.5L')
    expect(inferInventoryUnitFromProductName('Product 1500 ml').proposedUnit).toBe('Bottle 1.5L')
    expect(inferInventoryUnitFromProductName('Product 2lt').proposedUnit).toBe('Bottle 2L')
    expect(inferInventoryUnitFromProductName('Product 2000ml').proposedUnit).toBe('Bottle 2L')
    expect(inferInventoryUnitFromProductName('campari 1LT').proposedUnit).toBe('Bottle 1L')
    expect(inferInventoryUnitFromProductName('Disaronno   1   lt').proposedUnit).toBe('Bottle 1L')
  })

  it('requires explicit token boundaries and ignores unrelated digits', () => {
    expect(inferInventoryUnitFromProductName('Chivas 12')).toMatchObject({
      status: INVENTORY_UNIT_INFERENCE_STATUS.NOT_FOUND,
      proposedUnit: null,
      reason: INVENTORY_UNIT_INFERENCE_REASON.NO_VOLUME_TOKEN,
    })
    expect(inferInventoryUnitFromProductName('Item 7000')).toMatchObject({
      status: INVENTORY_UNIT_INFERENCE_STATUS.NOT_FOUND,
      proposedUnit: null,
    })
    expect(inferInventoryUnitFromProductName('Bitter Truth Apricot Liqueur').proposedUnit).toBeNull()
    // "12l" is not a supported V1 bottle size → unsupported, not 2L
    expect(inferInventoryUnitFromProductName('Mystery 12l')).toMatchObject({
      status: INVENTORY_UNIT_INFERENCE_STATUS.AMBIGUOUS,
      reason: INVENTORY_UNIT_INFERENCE_REASON.UNSUPPORTED_VOLUME,
      proposedUnit: null,
    })
  })

  it('does not infer Bottle for conflicting packaging tokens', () => {
    expect(inferInventoryUnitFromProductName('Coke Can 330ml')).toMatchObject({
      status: INVENTORY_UNIT_INFERENCE_STATUS.AMBIGUOUS,
      proposedUnit: null,
      reason: INVENTORY_UNIT_INFERENCE_REASON.PACKAGING_AMBIGUOUS,
    })
    expect(inferInventoryUnitFromProductName('Beer Case 24x330ml')).toMatchObject({
      status: INVENTORY_UNIT_INFERENCE_STATUS.AMBIGUOUS,
      proposedUnit: null,
      reason: INVENTORY_UNIT_INFERENCE_REASON.PACKAGING_AMBIGUOUS,
    })
    expect(inferInventoryUnitFromProductName('Keg 30L')).toMatchObject({
      status: INVENTORY_UNIT_INFERENCE_STATUS.AMBIGUOUS,
      proposedUnit: null,
      reason: INVENTORY_UNIT_INFERENCE_REASON.PACKAGING_AMBIGUOUS,
    })
    expect(inferInventoryUnitFromProductName('Pack 750ml').proposedUnit).toBeNull()
    expect(inferInventoryUnitFromProductName('Tin 700ml').proposedUnit).toBeNull()
  })

  it('leaves unsupported volumes for manual selection', () => {
    expect(inferInventoryUnitFromProductName('Soda 330ml')).toMatchObject({
      status: INVENTORY_UNIT_INFERENCE_STATUS.AMBIGUOUS,
      proposedUnit: null,
      normalizedVolumeMl: 330,
      reason: INVENTORY_UNIT_INFERENCE_REASON.UNSUPPORTED_VOLUME,
    })
    expect(inferInventoryUnitFromProductName('Juice 500ml')).toMatchObject({
      reason: INVENTORY_UNIT_INFERENCE_REASON.UNSUPPORTED_VOLUME,
      proposedUnit: null,
    })
    expect(inferInventoryUnitFromProductName('Mini 50cl')).toMatchObject({
      reason: INVENTORY_UNIT_INFERENCE_REASON.UNSUPPORTED_VOLUME,
      proposedUnit: null,
      normalizedVolumeMl: 500,
    })
    expect(inferInventoryUnitFromProductName('Sample 20cl').proposedUnit).toBeNull()
  })

  it('keeps conflicting volumes ambiguous', () => {
    expect(inferInventoryUnitFromProductName('Bottle 700ml / 1L')).toMatchObject({
      status: INVENTORY_UNIT_INFERENCE_STATUS.AMBIGUOUS,
      proposedUnit: null,
      reason: INVENTORY_UNIT_INFERENCE_REASON.MULTIPLE_CONFLICTING_VOLUMES,
    })
    expect(inferInventoryUnitFromProductName('Case 6 x 750ml 4.5L')).toMatchObject({
      status: INVENTORY_UNIT_INFERENCE_STATUS.AMBIGUOUS,
      proposedUnit: null,
    })
  })

  it('treats repeated equivalent tokens as one volume', () => {
    expect(inferInventoryUnitFromProductName('Campari 1lt 1000ml')).toMatchObject({
      status: INVENTORY_UNIT_INFERENCE_STATUS.INFERRED,
      proposedUnit: 'Bottle 1L',
      normalizedVolumeMl: 1000,
    })
  })

  it('handles blank and nullish names without mutating input', () => {
    expect(inferInventoryUnitFromProductName('')).toMatchObject({
      status: INVENTORY_UNIT_INFERENCE_STATUS.NOT_FOUND,
      reason: INVENTORY_UNIT_INFERENCE_REASON.NO_VOLUME_TOKEN,
    })
    expect(inferInventoryUnitFromProductName('   ')).toMatchObject({
      status: INVENTORY_UNIT_INFERENCE_STATUS.NOT_FOUND,
    })
    expect(inferInventoryUnitFromProductName(null).status).toBe(
      INVENTORY_UNIT_INFERENCE_STATUS.NOT_FOUND,
    )
    expect(inferInventoryUnitFromProductName(undefined).status).toBe(
      INVENTORY_UNIT_INFERENCE_STATUS.NOT_FOUND,
    )
    expect(() => inferInventoryUnitFromProductName(12)).toThrow(InventoryUnitInferenceError)

    const source = 'Ketel One 70cl'
    const first = inferInventoryUnitFromProductName(source)
    const second = inferInventoryUnitFromProductName(source)
    expect(first).toEqual(second)
    expect(Object.isFrozen(first)).toBe(true)
    expect(source).toBe('Ketel One 70cl')
  })
})
