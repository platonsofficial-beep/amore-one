import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../safeOverlay.css', import.meta.url), 'utf8')
const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8')

describe('Operations compact landscape header', () => {
  it('is scoped to phone landscape only', () => {
    const i = css.indexOf('.topbar.topbar-operations-compact')
    expect(i).toBeGreaterThan(0)
    expect(css.lastIndexOf('@media (orientation: landscape) and (max-height: 520px) and (max-width: 1100px)', i)).toBeGreaterThan(0)
  })
  it('keeps search reachable as an expanding icon', () => {
    expect(css).toMatch(/\.topbar-operations-compact \.search-bar:focus-within/)
  })
  it('renders the section tabs inside the header when compact', () => {
    expect(app).toMatch(/topbar-operations-compact/)
    expect(app).toMatch(/!useMobileExperience && !operationsCompactHeader \? \(/)
  })
})
