import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../safeOverlay.css', import.meta.url), 'utf8')
const block = css.slice(css.indexOf('/* 0028'))
const dash = readFileSync(new URL('../components/operations/OperationsDashboardView.jsx', import.meta.url), 'utf8')

describe('0028 Operations button hierarchy', () => {
  it('secondary buttons are quiet ghosts, not bronze fills', () => {
    expect(block).toMatch(/\.operations-dashboard-page \.ghost-btn,[\s\S]*?\.tasks-page \.tasks-templates-nav-btn \{[^}]*background: transparent;/)
    expect(block).not.toMatch(/--one-secondary-bg|--one-bronze/)
  })
  it('desktop header keeps one gold primary (Create task) placed last', () => {
    const header = dash.slice(dash.indexOf('Start checklist'), dash.indexOf('operations-summary-grid" aria-label="Today at a glance"'))
    expect((header.match(/primary-btn/g) || []).length).toBe(1)
    expect(header.indexOf('Create task')).toBeGreaterThan(header.indexOf('Add note'))
  })
})
