import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const viteConfig = readFileSync(resolve(root, 'vite.config.js'), 'utf8')
const pushWorker = readFileSync(resolve(root, 'public/push-sw.js'), 'utf8')

describe('push service worker contract', () => {
  it('keeps generateSW and imports the push script', () => {
    expect(viteConfig).toContain("registerType: 'autoUpdate'")
    expect(viteConfig).toContain('injectRegister: null')
    expect(viteConfig).toContain("importScripts: ['push-sw.js']")
    expect(viteConfig).not.toContain('injectManifest')
  })

  it('shows the notification and opens or focuses the payload url', () => {
    expect(pushWorker).toContain("addEventListener('push'")
    expect(pushWorker).toContain('showNotification')
    expect(pushWorker).toContain("icon: '/icon-192.png'")
    expect(pushWorker).toContain("badge: '/favicon-32.png'")
    expect(pushWorker).toContain("addEventListener('notificationclick'")
    expect(pushWorker).toContain("type: 'one:notification-open'")
    expect(pushWorker).toContain('openWindow')
    expect(pushWorker).toContain('focus')
    expect(pushWorker).not.toContain('import ')
    expect(pushWorker).not.toContain('export ')
  })
})
