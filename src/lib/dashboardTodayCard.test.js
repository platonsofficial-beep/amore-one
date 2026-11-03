import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../safeOverlay.css', import.meta.url), 'utf8')
const block = css.slice(css.indexOf('/* 0026b'))

describe('0026b app card surface', () => {
  it('Dashboard TODAY card uses the app card colour and keeps the gold edge', () => {
    expect(block).toMatch(/\.mobile-manager-tasks-command \{[^}]*background: var\(--one-surface-card\);[^}]*border-left: 3px solid rgba\(212, 175, 55, 0\.55\);[^}]*box-shadow: none;/)
  })
  it('Needs attention panel uses the app card colour', () => {
    expect(block).toMatch(/\.tasks-alerts,\s*\.tasks-dept-performance \{[^}]*background: var\(--one-surface-card\);[^}]*border: 1px solid var\(--one-border\);/)
  })
})
