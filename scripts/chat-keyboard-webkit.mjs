/**
 * Simulates an iOS keyboard by shrinking visualViewport in WebKit.
 * The layout viewport stays full height, which is what installed PWAs do.
 *
 *   ONE_VIEWPORT_BASE_URL=http://127.0.0.1:4173 node scripts/chat-keyboard-webkit.mjs
 *
 * Without a base URL the script builds the auth-bypass preview first.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { webkit } from 'playwright'

const VIEWPORT_BOOT = `(() => {
  const listeners = { resize: new Set(), scroll: new Set() }
  let height = window.innerHeight
  let offsetTop = 0
  const fake = {
    get height() { return height },
    get width() { return window.innerWidth },
    get offsetTop() { return offsetTop },
    get offsetLeft() { return 0 },
    get pageTop() { return offsetTop },
    get pageLeft() { return 0 },
    get scale() { return 1 },
    addEventListener(type, fn) { listeners[type]?.add(fn) },
    removeEventListener(type, fn) { listeners[type]?.delete(fn) },
  }
  window.__setVisualViewport = (next = {}) => {
    if (Number.isFinite(next.height)) height = next.height
    if (Number.isFinite(next.offsetTop)) offsetTop = next.offsetTop
    const event = new Event('resize')
    listeners.resize.forEach((fn) => fn(event))
    listeners.scroll.forEach((fn) => fn(event))
  }
  Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake })
})()`

async function waitForHttp(url) {
  const started = Date.now()
  while (Date.now() - started < 20000) {
    try {
      const response = await fetch(url)
      if (response.ok || response.status < 500) return
    } catch {
      // preview is still booting
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

async function resolveBaseUrl() {
  const preferred = `${process.env.ONE_VIEWPORT_BASE_URL ?? ''}`.trim()
  if (preferred) {
    await waitForHttp(preferred)
    return { url: preferred, close: async () => {} }
  }
  process.env.VITE_AUTH_DISABLED = 'true'
  const envDir = await mkdtemp(join(tmpdir(), 'one-keyboard-env-'))
  const { build, preview } = await import('vite')
  await build({ logLevel: 'warn', mode: 'production', envDir })
  const server = await preview({
    logLevel: 'error',
    envDir,
    preview: { host: '127.0.0.1', port: 4174, strictPort: false },
  })
  const address = server.httpServer?.address?.()
  const port = address && typeof address === 'object' ? address.port : 4174
  const url = server.resolvedUrls?.local?.[0] || `http://127.0.0.1:${port}/`
  await waitForHttp(url)
  return {
    url,
    close: async () => {
      await server.close()
      await rm(envDir, { recursive: true, force: true }).catch(() => {})
    },
  }
}

function injectThread() {
  const shell = document.querySelector('.app-shell')
  if (!shell) return 'missing-shell'
  shell.classList.add('is-mobile-shell', 'is-chat-thread')
  const screen = document.createElement('div')
  screen.className = 'chat-screen'
  screen.innerHTML = `
    <section class="chat-thread-pane" aria-label="Conversation">
      <header class="chat-thread-header"><h2 class="chat-thread-title"><span>eviesamaridi</span></h2></header>
      <div class="chat-messages"><p>Latest message</p></div>
      <form class="chat-composer">
        <textarea aria-label="Message" placeholder="Message"></textarea>
      </form>
    </section>`
  shell.appendChild(screen)
  return 'ready'
}

const app = await resolveBaseUrl()
const browser = await webkit.launch()
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
})
const failures = []
try {
  await page.addInitScript(VIEWPORT_BOOT)
  await page.goto(`${app.url.replace(/\/$/, '')}/?devRole=owner`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.app-shell', { timeout: 45000 })
  const injected = await page.evaluate(injectThread)
  if (injected !== 'ready') failures.push(injected)
  await page.evaluate(() => {
    window.__setVisualViewport({ height: window.innerHeight - 320, offsetTop: 0 })
  })
  await page.waitForTimeout(100)
  const measurement = await page.evaluate(() => {
    const composer = document.querySelector('.chat-composer')
    const field = document.querySelector('.chat-composer textarea')
    const nav = document.querySelector('.mobile-bottom-nav')
    const rect = composer?.getBoundingClientRect()
    const visual = window.visualViewport
    return {
      kb: getComputedStyle(document.documentElement).getPropertyValue('--kb').trim(),
      vvh: getComputedStyle(document.documentElement).getPropertyValue('--vvh').trim(),
      keyboardClass: document.body.classList.contains('is-keyboard-open'),
      composerBottom: rect ? Math.round(rect.bottom) : null,
      composerTop: rect ? Math.round(rect.top) : null,
      visualHeight: Math.round(visual?.height || 0),
      innerHeight: window.innerHeight,
      navDisplay: nav ? getComputedStyle(nav).display : 'absent',
      fontSize: field ? parseFloat(getComputedStyle(field).fontSize) : 0,
      bodyPosition: getComputedStyle(document.body).position,
    }
  })
  if (!measurement.keyboardClass) failures.push('keyboard class was not set')
  if (measurement.composerBottom == null) failures.push('composer was not measured')
  else if (measurement.composerBottom > measurement.visualHeight + 4) {
    failures.push(`composer bottom ${measurement.composerBottom}px is below the visual viewport ${measurement.visualHeight}px`)
  } else if (measurement.composerBottom < measurement.visualHeight - 120) {
    failures.push(`composer bottom ${measurement.composerBottom}px is not sitting on the visual viewport ${measurement.visualHeight}px`)
  }
  if (measurement.navDisplay !== 'none' && measurement.navDisplay !== 'absent') {
    failures.push(`bottom nav display is ${measurement.navDisplay}`)
  }
  if (measurement.fontSize < 16) failures.push(`message field is ${measurement.fontSize}px`)
  if (measurement.bodyPosition !== 'fixed') failures.push(`body position is ${measurement.bodyPosition}`)
  console.log(JSON.stringify(measurement, null, 2))
} finally {
  await browser.close()
  await app.close()
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log('webkit keyboard inset ok')
