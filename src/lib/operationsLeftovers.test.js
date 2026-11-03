import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const css = read('../safeOverlay.css')
const block = css.slice(css.indexOf('0033 — (1) Tablet header'))

vi.mock('./supabaseClient', () => {
  const runs = [{
    id: 'r1', workspace_id: 'w1', template_id: 't1', due_date: '2026-11-03', title: 'Open',
    steps: [{ id: 's1', title: 'Lights', status: 'completed', completed_by: 'u1', completed_at: '2026-11-03T17:12:00Z', order_index: 0 }],
  }]
  const chain = (rows) => {
    const q = { select: () => q, eq: () => q, in: () => q, order: () => Promise.resolve({ data: rows, error: null }) }
    q.then = (res) => Promise.resolve({ data: rows, error: null }).then(res)
    return q
  }
  return {
    supabase: {
      from: (table) => chain(table === 'operations_checklist_runs'
        ? runs
        : [{ auth_user_id: 'u1', display_name: 'Platon Sachinis', email: 'p@x' }]),
    },
  }
})

describe('0033 leftovers', () => {
  it('(1) tablet header collapses the user chip to the avatar', () => {
    expect(block).toMatch(/max-width: 1100px[\s\S]*profile-chip > div:not\(\.profile-avatar\) \{\s*display: none/)
  })

  it('(2) checklist run steps get the author name', async () => {
    const { getChecklistRuns } = await import('../services/operationsChecklistRunService')
    const runs = await getChecklistRuns('w1')
    expect(runs[0].steps[0].completedByName).toBe('Platon Sachinis')
  })

  it('(3) phone dashboard uses the Task boards overdue count', () => {
    expect(read('../components/mobile/MobileManagerTasksView.jsx')).toContain('Task boards overdue: ${boardOverdueCount}')
    expect(read('../App.jsx')).toContain('boardOverdueCount: taskBoardsOverdueCount')
  })

  it('(4) checklist task rows use the dark input fill', () => {
    expect(block).toMatch(/\.operations-checklist-item-fields input,[\s\S]*background: rgba\(10, 22, 40, 0\.55\)/)
  })
})

describe('0033 (5) phone dashboard checklist opens its run', () => {
  it('not-started rows start and open the run instead of staying on Operational control', () => {
    const app = read('../App.jsx')
    const fn = app.slice(app.indexOf('const handleMobileManagerOpenChecklist'), app.indexOf('const handleMobileGoToCurrentWeek'))
    expect(fn).toContain('handleStartOperationsChecklistRef.current?.(template)')
    expect(fn).toContain('openChecklistTemplate(templateId)')
    expect(app).toContain('handleStartOperationsChecklistRef.current = handleStartOperationsChecklist')
  })
})
