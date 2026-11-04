import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(process.cwd(), 'src')
const tokens = readFileSync(join(root, 'theme/brandTokens.css'), 'utf8')

function cssFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return cssFiles(path)
    return name.endsWith('.css') ? [path] : []
  })
}

describe('palette v1 tokens', () => {
  it('defines the new surface, text, line and status tokens', () => {
    for (const name of ['--one-surface-1', '--one-surface-2', '--one-surface-3', '--one-fill', '--one-fill-hover', '--one-scrim',
      '--one-text-subtle', '--one-border-strong', '--one-gold-text', '--one-info', '--one-status-seated', '--one-status-combined']) {
      expect(tokens, name).toMatch(new RegExp(`${name}:`))
    }
  })

  it('keeps the older token names', () => {
    for (const name of ['--one-surface:', '--one-surface-raised:', '--one-text-muted:', '--one-gold-soft:', '--one-status-info:', '--one-border:']) {
      expect(tokens).toContain(name)
    }
  })

  it('gives --one-form-surface one value everywhere', () => {
    const defs = cssFiles(root).flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/--one-form-surface:\s*([^;]+);/g)].map((m) => m[1].trim()))
    expect(defs.length).toBeGreaterThan(0)
    expect(new Set(defs)).toEqual(new Set(['var(--one-surface-2)']))
  })
})
