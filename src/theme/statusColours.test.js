import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HOST_FLOOR_SEMANTIC_CSS_VARS } from '../lib/hostFloorSemanticTokens.js'

// Palette step 6: one meaning per status colour, all via the status tokens.
const cssFiles = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? cssFiles(p) : p.endsWith('.css') ? [p] : [] })
const all = cssFiles('src').filter((f) => !f.includes('/legal/')).map((f) => readFileSync(f, 'utf8')).join('\n')
const app = readFileSync('src/App.css', 'utf8')

describe('palette step 6: status colours', () => {
  it('no Material status colours remain in CSS', () => {
    expect(all).not.toMatch(/#(4caf50|f44336|ff9800|ffb74d|ef5350|e53935|f0b429)\b/i)
    expect(all).not.toMatch(/rgba\(\s*(76,\s*175,\s*80|244,\s*67,\s*54|255,\s*152,\s*0)\s*,/)
  })
  it('seated and combined use their own tokens (no ad-hoc teal/purple)', () => {
    expect(all).not.toMatch(/rgba\(\s*(48,\s*168,\s*196|42,\s*156,\s*182|148,\s*124,\s*196)\s*,/)
  })
  it('host floor CSS vars and the JS mirror use the same status tokens', () => {
    const block = app.slice(app.indexOf('.floor-plan-workspace.is-host-floor {'), app.indexOf('--host-floor-surface-transition'))
    for (const [k, v] of Object.entries(HOST_FLOOR_SEMANTIC_CSS_VARS)) expect(block).toContain(`${k}: ${v};`)
    expect(HOST_FLOOR_SEMANTIC_CSS_VARS['--host-floor-available-dot']).toContain('--one-success')
    expect(HOST_FLOOR_SEMANTIC_CSS_VARS['--host-floor-seated-dot']).toBe('var(--one-status-seated)')
    expect(HOST_FLOOR_SEMANTIC_CSS_VARS['--host-floor-problem-dot']).toBe('var(--one-danger)')
    expect(HOST_FLOOR_SEMANTIC_CSS_VARS['--host-floor-combined-dot']).toBe('var(--one-status-combined)')
  })
  it('floor seating dots: free = success, booked = gold, waiting = warning, seated = seated', () => {
    expect(app).toContain('.floor-table-seating-indicator.is-empty { background: var(--one-success); }')
    expect(app).toContain('.floor-table-seating-indicator.is-confirmed { background: var(--one-gold); }')
    expect(app).toContain('.floor-table-seating-indicator.is-waiting { background: var(--one-warning); }')
    expect(app).toContain('.floor-table-seating-indicator.is-seated { background: var(--one-status-seated); }')
  })
  it('notification count is danger with dark ink (AA)', () => {
    expect(app).toMatch(/\.notification-bell-badge \{[^}]*background: var\(--one-danger\);[^}]*color: var\(--one-gold-ink\);/s)
  })
  it('leave status pills (inline style blocks) use the status tokens', () => {
    for (const f of ['src/components/team/LeaveHistoryDetailsModal.jsx', 'src/components/team/LeaveHistoryPanel.jsx']) {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/rgba\(\s*(76,\s*175,\s*80|244,\s*67,\s*54|255,\s*152,\s*0)\s*,/)
      expect(src).toMatch(/status-pill\.approved \{\s*color: var\(--one-success\);\s*background: var\(--one-success-bg\);/)
    }
  })
})
