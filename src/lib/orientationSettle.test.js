/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { bindOrientationSettle, settleShellAfterOrientation } from './orientationSettle'

function fakeWindow({
  scrollY = 180,
  offsetTop = 40,
  offsetLeft = 0,
  focused = null,
  keyboard = false,
  sheetTop = 90,
} = {}) {
  const sheet = { scrollTop: sheetTop, scrollLeft: 0, className: 'mobile-sheet' }
  const root = { scrollTop: 24, scrollLeft: 8 }
  const shell = { scrollTop: 16, scrollLeft: 0, getBoundingClientRect: () => ({ top: 0 }) }
  const panel = { scrollTop: 0, scrollLeft: 0 }
  const scrollingElement = { scrollTop: scrollY, scrollLeft: 0 }
  const listeners = {}
  const win = {
    document: {
      activeElement: focused,
      scrollingElement,
      querySelector: (selector) => (selector === '.app-shell' ? shell : null),
      querySelectorAll: (selector) => (
        selector === '#root, .app-shell, .main-panel' ? [root, shell, panel] : []
      ),
    },
    scrollX: 0,
    scrollY,
    pageXOffset: 0,
    pageYOffset: scrollY,
    innerWidth: 390,
    innerHeight: keyboard ? 844 : 844,
    visualViewport: {
      width: 390,
      height: keyboard ? 520 : 700,
      offsetTop,
      offsetLeft,
    },
    scrollTo(x, y) {
      win.scrollX = x
      win.scrollY = y
      win.pageYOffset = y
      scrollingElement.scrollTop = y
      scrollingElement.scrollLeft = x
    },
    addEventListener(type, fn) {
      listeners[type] = listeners[type] || []
      listeners[type].push(fn)
    },
    removeEventListener(type, fn) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== fn)
    },
    dispatch(type) {
      ;(listeners[type] || []).forEach((fn) => fn())
    },
    setTimeout(fn) {
      fn()
      return 1
    },
    clearTimeout() {},
    screen: { orientation: { addEventListener() {}, removeEventListener() {} } },
  }
  win.visualViewport.addEventListener = (type, fn) => {
    listeners[`vv:${type}`] = listeners[`vv:${type}`] || []
    listeners[`vv:${type}`].push(fn)
  }
  win.visualViewport.removeEventListener = () => {}
  return { win, root, shell, sheet, listeners }
}

describe('settleShellAfterOrientation', () => {
  it('clears a leftover window offset and leaves an open sheet scrolled', () => {
    const { win, root, shell, sheet } = fakeWindow()
    expect(settleShellAfterOrientation(win)).toBe(true)
    expect(win.scrollY).toBe(0)
    expect(root.scrollTop).toBe(0)
    expect(shell.scrollTop).toBe(0)
    expect(sheet.scrollTop).toBe(90)
  })

  it('does not fight a focused field or the keyboard', () => {
    const typing = fakeWindow({ focused: { tagName: 'INPUT' }, scrollY: 120, offsetTop: 30 })
    expect(settleShellAfterOrientation(typing.win)).toBe(false)
    expect(typing.win.scrollY).toBe(120)

    const keyboard = fakeWindow({
      keyboard: true,
      focused: { tagName: 'INPUT', matches: () => true },
      scrollY: 80,
      offsetTop: 0,
    })
    expect(settleShellAfterOrientation(keyboard.win)).toBe(false)
    expect(keyboard.win.scrollY).toBe(80)
  })

  it('resets after portrait, landscape, and portrait again, and the nav still clicks', () => {
    const { win } = fakeWindow({ scrollY: 0, offsetTop: 0 })
    const stop = bindOrientationSettle(win)
    win.innerWidth = 844
    win.innerHeight = 390
    win.dispatch('resize')
    win.scrollY = 210
    win.pageYOffset = 210
    win.document.scrollingElement.scrollTop = 210
    win.visualViewport.offsetTop = 36
    win.innerWidth = 390
    win.innerHeight = 844
    win.dispatch('orientationchange')
    expect(win.scrollY).toBe(0)
    expect(win.document.scrollingElement.scrollTop).toBe(0)
    stop()

    function Shell() {
      const [view, setView] = useState('settings')
      return createElement('div', { className: 'app-shell is-mobile-shell' },
        createElement('h1', null, view),
        createElement('button', { type: 'button', onClick: () => setView('reservations') }, 'Reservations'),
      )
    }
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => { root.render(createElement(Shell)) })
    act(() => { container.querySelector('button').click() })
    expect(container.querySelector('h1').textContent).toBe('reservations')
    act(() => { root.unmount() })
    container.remove()
  })
})

describe('app entry owns the locale tree and the rotation settle', () => {
  const entry = readFileSync(resolve(process.cwd(), 'src/appEntry.jsx'), 'utf8')

  it('does not pass the app through as children', () => {
    expect(entry).toMatch(/function LocaleRoot\(\)/)
    expect(entry).not.toMatch(/function LocaleRoot\(\{\s*children/)
    expect(entry).toContain('<WorkspaceKeyedApp />')
    expect(entry).toContain('bindOrientationSettle()')
  })
})
