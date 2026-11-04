/**
 * Stock audit S-03 — the Suggest order preview must also render in the portrait manager shell,
 * which returns <MobileManagerApp> early and skipped the desktop-tree dialog.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

describe('Suggest order preview in portrait (S-03)', () => {
  it('renders the shared dialog next to MobileManagerApp', () => {
    const start = app.indexOf('<MobileManagerApp')
    const end = app.indexOf('if (isHostMobileShellLocal)', start)
    expect(start).toBeGreaterThan(-1)
    expect(app.slice(start, end)).toContain('{renderSupplyDraftPreviewDialog()}')
  })
  it('keeps exactly one dialog definition shared by both trees', () => {
    expect(app.match(/<SupplyOrderDraftPreviewDialog\b/g)).toHaveLength(1)
    expect(app.match(/\{renderSupplyDraftPreviewDialog\(\)\}/g)).toHaveLength(2)
  })
})
