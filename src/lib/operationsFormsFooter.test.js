import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../safeOverlay.css', import.meta.url), 'utf8')
const block = css.slice(css.indexOf('/* 0025 — Operations forms'))

describe('0025 operations forms', () => {
  it('sticky footer uses the form colour, not a dark gradient', () => {
    expect(block).toMatch(/\.operations-form-modal\.employee-modal \.modal-actions \{[^}]*position: sticky;[^}]*background: rgb\(11, 15, 23\);[^}]*background-image: none;/)
  })
  it('keeps focused fields clear of the footer', () => {
    expect(block).toMatch(/scroll-padding-bottom: 112px/)
  })
  it('selects match the 44px / 16px inputs', () => {
    expect(block).toMatch(/\.operations-form-modal select,[\s\S]*?height: 44px;[\s\S]*?font-size: 16px;/)
  })
  it('Back sits on its own row with a solid background', () => {
    expect(block).toMatch(/\.operations-checklist-editor-header \{\s*flex-direction: column;/)
    expect(block).toMatch(/\.operations-checklist-editor-back \{[^}]*order: -1;[^}]*background: rgb\(23, 30, 42\);/)
  })
})
