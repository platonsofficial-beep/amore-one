import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  inventoryCountModeLabel,
  isRoutinePendingCountReason,
  parseCountedDraft,
} from './InventoryCountSessionWorkspace'

const portraitCss = readFileSync(resolve(__dirname, '../../activeCountPhonePortrait.css'), 'utf8')
const landscapeCss = readFileSync(resolve(__dirname, '../../countLandscapePhone.css'), 'utf8')

describe('Active Count quantity and copy', () => {
  it('rejects a counted quantity below zero', () => {
    expect(parseCountedDraft('-1')).toMatchObject({ ready: false, invalid: true })
    expect(parseCountedDraft('0').countedQuantity).toBe(0)
    expect(parseCountedDraft('1.5').countedQuantity).toBe(1.5)
  })

  it('keeps the pending sentence off the standalone Complete Location note', () => {
    expect(isRoutinePendingCountReason('2 items are still pending.')).toBe(true)
    expect(isRoutinePendingCountReason('1 item is still pending.')).toBe(true)
    expect(isRoutinePendingCountReason('Complete “Bar” first.')).toBe(false)
  })

  it('names blind mode only when the session is blind', () => {
    expect(inventoryCountModeLabel('blind')).toBe('Blind Count')
    expect(inventoryCountModeLabel('open')).toBe('Open count')
    expect(inventoryCountModeLabel('')).toBe('Count')
  })
})

describe('Active Count phone portrait layout', () => {
  it('uses card rows, location chips, and hides the app tab bar', () => {
    expect(portraitCss).toMatch(/grid-template-columns:\s*minmax\(8rem,\s*1fr\) auto auto/)
    expect(portraitCss).toMatch(/inventory-count-session-item-name \{\s*display:\s*block;\s*min-width:\s*8rem/)
    expect(portraitCss).toMatch(/grid-template-areas:\s*"item unit status"/)
    expect(portraitCss).toMatch(/flex-direction:\s*row/)
    expect(portraitCss).toMatch(/body:has\(\.inventory-count-session\) \.mobile-bottom-nav/)
    expect(portraitCss).toMatch(/max-width:\s*560px/)
    expect(portraitCss).toMatch(/\.app-shell\.is-mobile-shell \.mobile-workspace-module\.is-mobile-expanded:has\(\.inventory-count-session\) \{\s*display:\s*flex !important;[\s\S]*flex:\s*1 1 0% !important/)
    expect(portraitCss).toMatch(/\.mobile-expanded-scroll \{\s*display:\s*flex !important;[\s\S]*height:\s*0 !important;[\s\S]*overflow:\s*hidden !important/)
    expect(portraitCss).toMatch(/\.mobile-workspace-module\.is-mobile-expanded:has\(\.inventory-count-session\) \{[\s\S]*overflow:\s*hidden !important/)
    expect(portraitCss).not.toMatch(/\.inventory-count-session\.is-high-density \{[^}]*max-height:\s*100dvh/)
  })

  it('raises phone-landscape header and filter taps', () => {
    expect(landscapeCss).toMatch(/inventory-count-session-header-actions \.inventory-count-session-action-btn \{\s*min-height:\s*38px/)
    expect(landscapeCss).toMatch(/inventory-count-session-filter-btn \{\s*min-height:\s*38px/)
    expect(landscapeCss).toMatch(/inventory-count-session-footer \.inventory-count-session-action-btn \{\s*min-height:\s*40px/)
  })
})
