/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assignCardScrollDelta, shouldBlockAssignCardBackgroundScroll } from './assignCardScrollLock'

function mount({ listOverflow = false, bodyOverflow = false, listTop = 0 } = {}) {
  document.body.innerHTML = `
    <div class="main-panel"></div>
    <div class="employee-modal-backdrop">
      <div class="schedule-assignment-modal">
        <h3 class="drawer-header">Assign employees</h3>
        <div class="assignment-card-body">
          <div class="assignment-employee-list"><div class="assignment-employee-item">Ana</div></div>
        </div>
        <div class="modal-actions"><button>Cancel</button><button>Save</button></div>
      </div>
    </div>
  `
  const list = document.querySelector('.assignment-employee-list')
  const body = document.querySelector('.assignment-card-body')
  Object.defineProperty(list, 'clientHeight', { value: 100, configurable: true })
  Object.defineProperty(list, 'scrollHeight', { value: listOverflow ? 240 : 100, configurable: true })
  list.scrollTop = listTop
  Object.defineProperty(body, 'clientHeight', { value: 120, configurable: true })
  Object.defineProperty(body, 'scrollHeight', { value: bodyOverflow ? 280 : 120, configurable: true })
  body.scrollTop = 0
  return { list, body }
}

describe('assign card scroll lock', () => {
  it('blocks a short list, the card chrome, and the backdrop', () => {
    const { list } = mount()
    expect(shouldBlockAssignCardBackgroundScroll({ type: 'wheel', target: list, deltaY: 40 }, 40)).toBe(true)
    expect(shouldBlockAssignCardBackgroundScroll({
      type: 'wheel',
      target: document.querySelector('h3'),
      deltaY: 40,
    }, 40)).toBe(true)
    expect(shouldBlockAssignCardBackgroundScroll({
      type: 'wheel',
      target: document.querySelector('.employee-modal-backdrop'),
      deltaY: -40,
    }, -40)).toBe(true)
    expect(shouldBlockAssignCardBackgroundScroll({
      type: 'touchmove',
      target: document.querySelector('.modal-actions'),
      touches: [{ clientY: 80 }],
    }, 30)).toBe(true)
  })

  it('lets a long list scroll and blocks only its overscroll', () => {
    const { list } = mount({ listOverflow: true, listTop: 20 })
    expect(shouldBlockAssignCardBackgroundScroll({ type: 'wheel', target: list, deltaY: 30 }, 30)).toBe(false)
    expect(shouldBlockAssignCardBackgroundScroll({ type: 'wheel', target: list, deltaY: -10 }, -10)).toBe(false)
    list.scrollTop = 140
    expect(shouldBlockAssignCardBackgroundScroll({ type: 'wheel', target: list, deltaY: 20 }, 20)).toBe(true)
    list.scrollTop = 0
    expect(shouldBlockAssignCardBackgroundScroll({ type: 'wheel', target: list, deltaY: -20 }, -20)).toBe(true)
  })

  it('uses the card body when the inner list does not overflow', () => {
    const { body } = mount({ bodyOverflow: true })
    const row = document.querySelector('.assignment-employee-item')
    expect(shouldBlockAssignCardBackgroundScroll({ type: 'wheel', target: row, deltaY: 24 }, 24)).toBe(false)
    body.scrollTop = 160
    expect(shouldBlockAssignCardBackgroundScroll({ type: 'wheel', target: row, deltaY: 24 }, 24)).toBe(true)
  })

  it('reads wheel and touch deltas', () => {
    expect(assignCardScrollDelta({ type: 'wheel', deltaY: 18 })).toBe(18)
    expect(assignCardScrollDelta({ type: 'touchmove', touches: [{ clientY: 70 }] }, 100)).toBe(30)
  })

  it('is wired only while the assign card is open, and the list keeps the gesture', () => {
    const app = readFileSync(join(process.cwd(), 'src/App.jsx'), 'utf8')
    const css = readFileSync(join(process.cwd(), 'src/App.css'), 'utf8')
    expect(app).toContain('shouldBlockAssignCardBackgroundScroll')
    expect(app).toContain('isAssignmentModalOpen')
    const backdrop = css.slice(css.indexOf('.employee-modal-backdrop:has(.schedule-assignment-modal) {'), css.indexOf('.employee-modal-backdrop:has(.schedule-assignment-modal) {') + 500)
    expect(backdrop).toContain('overscroll-behavior: none')
    expect(backdrop).toContain('touch-action: none')
    const list = css.slice(css.indexOf('.schedule-assignment-modal .assignment-employee-list {'), css.indexOf('.schedule-assignment-modal .assignment-employee-list {') + 280)
    expect(list).toContain('overscroll-behavior: contain')
    expect(list).toContain('touch-action: pan-y')
  })
})
