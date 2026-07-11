import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('host queue list transition styles', () => {
  it('disables list transition under prefers-reduced-motion', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/mobileShell.css'),
      'utf8',
    )

    expect(css).toContain('.host-queue-list-transition')
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.host-queue-list-transition[\s\S]*animation:\s*none/)
  })
})
