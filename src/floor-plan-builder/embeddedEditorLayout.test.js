import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const editorSource = readFileSync(
  resolve(process.cwd(), 'src/components/floor/EmbeddedFloorPlanEditor.jsx'),
  'utf8',
)
const builderCss = readFileSync(
  resolve(process.cwd(), 'src/floor-plan-builder/floorPlanBuilder.css'),
  'utf8',
)
const helpCss = readFileSync(resolve(process.cwd(), 'src/help/helpMode.css'), 'utf8')
const overlayCss = readFileSync(resolve(process.cwd(), 'src/safeOverlay.css'), 'utf8')

describe('embedded floor editor layout', () => {
  it('hides the floating help button and notification bell while the editor is open', () => {
    expect(helpCss).toMatch(/:has\(\.unified-floor-editor\) \.help-mode-fallback/)
    expect(helpCss).toMatch(/:has\(\.unified-floor-editor\) \.help-mode-banner/)
    expect(overlayCss).toMatch(/:has\(\.unified-floor-editor\) \.mobile-shell-bell/)
  })

  it('shows Tools and Properties toggles only for the collapsing tablet layout', () => {
    expect(editorSource).toMatch(/\{isTabletLayout \? \(/)
    expect(editorSource).toContain("aria-label={toolsOpen ? 'Hide tools' : 'Show tools'}")
    expect(editorSource).toContain("aria-label={inspectorOpen ? 'Hide properties' : 'Show properties'}")
    expect(editorSource).toContain("const toolsOpen = isTabletLayout ? toolsPanelOpen : true")
  })

  it('keeps one exit path and moves Clear layout into More', () => {
    expect(editorSource).not.toContain('Exit edit')
    expect(editorSource).not.toContain('>Cancel<')
    expect(editorSource).toContain("state.hasUnsavedChanges ? 'Discard & exit' : 'Exit'")
    expect(editorSource).toContain('Clear layout')
    expect(editorSource).toContain('unified-floor-editor-more-menu')
    expect(editorSource).toContain('Save draft')
    expect(editorSource).toContain('Publish layout')
  })

  it('keeps the rotate handle visible in embedded mode, including tablet widths', () => {
    expect(builderCss).not.toMatch(/\.fpb-editor-embedded \.fpb-handle-rotate,\s*\.fpb-editor-embedded \.fpb-rotate-stem \{\s*display:\s*none/)
    expect(builderCss).toMatch(/\.fpb-editor-embedded \.fpb-handle\.fpb-handle-rotate \{[^}]*width:\s*calc\(44px \/ var\(--fpb-camera-zoom, 1\)\)/s)
    const tabletHide = builderCss.match(/\.fpb-editor-embedded\.is-tablet-layout \.fpb-handle-sw \{[^}]*display:\s*none/s)
    expect(tabletHide).not.toBeNull()
    expect(builderCss).not.toMatch(/is-tablet-layout \.fpb-handle-rotate/)
  })

  it('overlays panels on phone and short landscape without hiding publish or exit', () => {
    expect(builderCss).toMatch(/@media \(max-width: 900px\), \(max-height: 520px\)/)
    expect(builderCss).toMatch(/@media \(max-width: 520px\) and \(orientation: portrait\)/)
    expect(builderCss).toMatch(/@media \(orientation: landscape\) and \(max-height: 520px\)/)
    expect(builderCss).toContain('height: min(52%, 420px)')
    expect(builderCss).toContain('width: min(280px, 42vw)')
    expect(builderCss).toContain('overflow-y: auto')
    expect(editorSource).toContain('Publish layout')
    expect(editorSource).toContain('unified-floor-editor-toolbar-commit')
  })
})
