import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../safeOverlay.css', import.meta.url), 'utf8')
const block = css.slice(css.indexOf('/* 0026 — Operations portrait polish'))
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

describe('0026 operations portrait polish', () => {
  it('chips use the same names as desktop', () => {
    expect(src('../components/operations/OperationsUnifiedScreen.jsx')).not.toMatch(/'Today'/)
  })
  it('portrait title is Operations and Task boards eyebrow/title order is fixed', () => {
    expect(src('../components/mobile/MobileManagerTasksView.jsx')).toMatch(/mobile-manager-tasks-title">Operations</)
    expect(src('../components/tasks/TasksView.jsx')).toMatch(/eyebrow">Operations<\/p>[\s\S]*?'Task boards'/)
  })
  it('gap under chips and TODAY card in the app card colour', () => {
    expect(block).toMatch(/\.operations-unified-tabs \{\s*padding-bottom: 12px;/)
    expect(block).toMatch(/\.tasks-mobile-command-metrics \{[^}]*background: var\(--one-surface-card\);[^}]*box-shadow: none;/)
  })
  it('shift names never break mid-word', () => {
    expect(block).toMatch(/\.schedule-shift-instance-name \{[^}]*overflow-wrap: normal;[^}]*word-break: normal;[^}]*text-overflow: ellipsis;/)
  })
})
