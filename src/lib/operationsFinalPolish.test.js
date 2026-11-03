import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { isTransientSuccessNotice } from './transientNotice'

const css = readFileSync(new URL('../safeOverlay.css', import.meta.url), 'utf8')
const block = css.slice(css.indexOf('/* 0032 — Operations final polish'))
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('0032 transient notices', () => {
  it('auto-dismisses success banners only', () => {
    expect(isTransientSuccessNotice('Task created.')).toBe(true)
    expect(isTransientSuccessNotice('Note added.')).toBe(true)
    expect(isTransientSuccessNotice('Checklist template created.')).toBe(true)
    expect(isTransientSuccessNotice('Unable to create task right now.')).toBe(false)
    expect(isTransientSuccessNotice('')).toBe(false)
  })
})

describe('0032 CSS polish', () => {
  it('checklist editor spacing, sticky footer and quiet buttons', () => {
    expect(block).toMatch(/\.operations-checklist-editor-form \{\s*display: flex;\s*flex-direction: column;\s*gap: 14px;/)
    expect(block).toMatch(/\.operations-checklist-editor-form \.modal-actions \{[^}]*position: sticky;[^}]*background: var\(--one-surface-card\);/)
    expect(block).toMatch(/\.operations-checklist-add-item input \{[^}]*background: rgba\(10, 22, 40, 0\.55\);/)
  })
  it('Back buttons use the solid style, header height is stable, tiles share one surface', () => {
    expect(block).toMatch(/\.tasks-page \.tasks-back-btn \{[^}]*width: auto;[^}]*background: rgb\(23, 30, 42\);/)
    expect(block).toMatch(/\.topbar\.topbar-operations-compact \{\s*flex-shrink: 0;/)
    expect(block).toMatch(/\.operations-summary-card\.tone-gold \{\s*background-color: rgba\(18, 32, 51, 0\.88\);/)
  })
})

describe('0032 logic wiring', () => {
  it('note authors are looked up with the workspace id', () => {
    expect(read('../services/operationsLogService.js')).toMatch(/getMemberDisplayNamesByAuthUserIds\(workspaceId, authUserIds\)/)
  })
  it('Dashboard overdue tile uses the Task boards overdue count', () => {
    const app = read('../App.jsx')
    expect(app).toMatch(/boardOverdueCount=\{taskBoardsOverdueCount\}/)
    expect(app).toMatch(/calculateTaskOverview\(taskBoardTasks, currentDateKey\)\.overdue/)
  })
})
