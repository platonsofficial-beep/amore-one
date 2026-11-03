/**
 * @vitest-environment jsdom
 */
import { createElement as h, act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { useEscapeToClose } from './useEscapeToClose'
import { dismissEmployeeFormOverlayPickers, useEmployeeFormPickerDismiss } from './employeeFormPickerDismiss'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

function SelectPicker({ id }) {
  const [open, setOpen] = useState(false)
  useEmployeeFormPickerDismiss(() => setOpen(false), { enabled: open })
  return h('div', null,
    h('button', { id, type: 'button', onClick: () => { if (!open) dismissEmployeeFormOverlayPickers(); setOpen(!open) } }, id),
    open ? h('div', { className: `menu-${id}` }, 'menu') : null)
}

function Form() {
  const [open, setOpen] = useState(true)
  useEscapeToClose(() => setOpen(false), { enabled: open })
  if (!open) return null
  return h('div', { className: 'employee-form' }, h(SelectPicker, { id: 'status' }), h(SelectPicker, { id: 'date' }))
}

let root
let container
function render() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(h(Form)))
}
const click = (id) => act(() => { document.getElementById(id).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
const q = (sel) => document.querySelector(sel)

afterEach(() => { act(() => root?.unmount()); container?.remove() })

describe('employee form pickers', () => {
  it('opening a dropdown keeps the form open', () => {
    render()
    click('status')
    expect(q('.employee-form')).not.toBeNull()
    expect(q('.menu-status')).not.toBeNull()
  })

  it('opening one picker closes the other open picker', () => {
    render()
    click('date')
    expect(q('.menu-date')).not.toBeNull()
    click('status')
    expect(q('.menu-date')).toBeNull()
    expect(q('.menu-status')).not.toBeNull()
    expect(q('.employee-form')).not.toBeNull()
  })

  it('a real Escape still closes the dialog', () => {
    render()
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(q('.employee-form')).toBeNull()
  })

  it('no source file dispatches a synthetic Escape key press', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.jsx'), 'utf8')
    expect(app).not.toMatch(/dispatchEvent\(new KeyboardEvent\('keydown', \{ key: 'Escape'/)
  })
})
