import { describe, expect, it } from 'vitest'
import {
  isHostTabletPanelViewport,
  resolveHostReservationFormVariant,
} from './mobileHostReservationUtils'
import {
  shouldUseHostStationLanding,
  shouldUseHostStationShell,
} from './permissions'

describe('mobileHostReservationUtils', () => {
  it('uses inline create/edit forms on split tablet landscape', () => {
    expect(resolveHostReservationFormVariant({ isSplitLayout: true })).toBe('inline')
  })

  it('uses panel forms on tablet portrait widths', () => {
    expect(resolveHostReservationFormVariant({ isSplitLayout: false })).toBe(
      isHostTabletPanelViewport() ? 'panel' : 'sheet',
    )
  })
})

describe('host station shell', () => {
  it('forces host station shell for host role on any viewport', () => {
    expect(shouldUseHostStationShell('host')).toBe(true)
    expect(shouldUseHostStationShell('manager')).toBe(false)
    expect(shouldUseHostStationShell('staff')).toBe(false)
  })

  it('lands host accounts on host tab regardless of mobile breakpoint', () => {
    expect(shouldUseHostStationLanding('host')).toBe(true)
    expect(shouldUseHostStationLanding('staff')).toBe(false)
  })
})
