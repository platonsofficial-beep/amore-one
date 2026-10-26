/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'))
const viteConfig = readFileSync(resolve(root, 'vite.config.js'), 'utf8')

function headerValue(source) {
  const rule = vercel.headers.find((entry) => entry.source === source)
  return rule?.headers?.find((header) => header.key === 'Cache-Control')?.value ?? ''
}

describe('pwa deploy freshness', () => {
  it('serves the app shell and service worker with no-cache, and hashed assets as immutable', () => {
    for (const source of ['/sw.js', '/index.html', '/']) {
      const value = headerValue(source)
      expect(value).toContain('no-cache')
      expect(value).toContain('must-revalidate')
      expect(value).not.toContain('no-store')
    }

    const assets = headerValue('/assets/(.*)')
    expect(assets).toContain('immutable')
    expect(assets).toContain('max-age=31536000')
    expect(assets).not.toContain('no-cache')

    expect(vercel.rewrites).toEqual([
      {
        source: '/((?!assets/).*)',
        destination: '/index.html',
      },
    ])
  })

  it('keeps auto-update and the offline app shell', () => {
    expect(viteConfig).toContain("registerType: 'autoUpdate'")
    expect(viteConfig).toContain('injectRegister: null')
    expect(viteConfig).toContain('skipWaiting: true')
    expect(viteConfig).toContain('clientsClaim: true')
    expect(viteConfig).toContain('cleanupOutdatedCaches: true')
    expect(viteConfig).toContain("navigateFallback: '/index.html'")
    expect(viteConfig).toContain("globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,woff2}']")
    expect(viteConfig).toContain('supabase\\.co')
    expect(viteConfig).toContain("handler: 'NetworkOnly'")
  })
})
