/**
 * The assign card must stay inside the visible width, including the close
 * button and Save, on both island sides and when the visual viewport is
 * narrower than the layout viewport (the live iPhone clip).
 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { enableViewportAuthBypass } from './viewportAuthBypass.mjs'

function openSocket(url) {
  const ws = new WebSocket(url)
  let nextId = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message || 'CDP error'))
    else resolve(message.result)
  })
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', () => reject(new Error('ws')))
  })
  return {
    ws, ready,
    send(method, params = {}) {
      const id = ++nextId
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
    },
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const nav = JSON.stringify({ activeView: 'team', teamSection: 'schedule', settingsSection: 'profile', stockSection: 'dashboard', operationsSection: 'dashboard' })
const boot = `try { localStorage.setItem('one.navigation.v2', ${JSON.stringify(nav)}); localStorage.setItem('one_pwa_ios_install_dismissed','1'); localStorage.setItem('one_pwa_install_dismissed','1'); const native = window.matchMedia.bind(window); window.matchMedia = (query) => { const text = String(query); if (!text.includes('display-mode')) return native(query); return { matches: text.includes('standalone'), media: text, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false } } } } catch (error) {}`

const MEASURE = `(() => {
  const modal = document.querySelector('.schedule-assignment-modal');
  if (!modal) return { open: false };
  const backdrop = modal.closest('.employee-modal-backdrop');
  const box = (el) => { const r = el.getBoundingClientRect(); return { r: Math.round(r.right) } };
  const close = modal.querySelector('.icon-btn');
  const save = [...modal.querySelectorAll('button')].find((b) => (b.innerText || '').trim() === 'Save');
  const name = modal.querySelector('.assignment-employee-meta strong');
  const pad = parseFloat(getComputedStyle(backdrop).paddingRight) || 0;
  const vv = window.visualViewport;
  const visibleRight = Math.min(innerWidth, Math.round((vv?.offsetLeft || 0) + (vv?.width || innerWidth)));
  return { open: true, card: box(modal).r, close: box(close).r, save: save ? box(save).r : null, limit: visibleRight - pad, nameFont: name ? getComputedStyle(name).fontSize : '' };
})()`

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'
const cases = [
  { name: 'pro-left', w: 874, h: 402, dpr: 3, ua: iphone, angle: 90, insets: { top: 0, right: 0, bottom: 21, left: 59 }, narrow: true },
  { name: 'pro-right', w: 874, h: 402, dpr: 3, ua: iphone, angle: 270, insets: { top: 0, right: 59, bottom: 21, left: 0 } },
  { name: 'max-left', w: 956, h: 440, dpr: 3, ua: iphone, angle: 90, insets: { top: 0, right: 0, bottom: 21, left: 59 }, narrow: true },
  { name: 'max-right', w: 956, h: 440, dpr: 3, ua: iphone, angle: 270, insets: { top: 0, right: 59, bottom: 21, left: 0 } },
  { name: 'android', w: 915, h: 412, dpr: 2.625, ua: android, angle: 90, insets: { top: 0, right: 0, bottom: 0, left: 0 } },
]

async function main() {
  enableViewportAuthBypass()
  const envDir = await mkdtemp(join(tmpdir(), 'one-right-edge-env-'))
  const { build, preview } = await import('vite')
  await build({ logLevel: 'warn', mode: 'production', envDir })
  const server = await preview({ logLevel: 'error', envDir, preview: { host: '127.0.0.1', port: 4173, strictPort: false } })
  const address = server.httpServer?.address?.()
  const port = address && typeof address === 'object' ? address.port : 4173
  const base = `http://127.0.0.1:${port}/?devRole=owner&scheduleFixture=1`
  const userDataDir = await mkdtemp(join(tmpdir(), 'one-right-edge-chrome-'))
  const chrome = spawn('/usr/bin/google-chrome', ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, '--no-first-run', '--disable-gpu', '--no-sandbox', 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] })
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome did not start')), 15000)
    const on = (chunk) => {
      const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/)
      if (!match) return
      clearTimeout(timer)
      resolve(match[1])
    }
    chrome.stderr.on('data', on)
    chrome.stdout.on('data', on)
  })
  const failures = []
  try {
    const version = await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/version`).then((r) => r.json())
    const browser = openSocket(version.webSocketDebuggerUrl)
    await browser.ready
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
    const targets = await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/list`).then((r) => r.json())
    const page = openSocket(targets.find((entry) => entry.id === targetId).webSocketDebuggerUrl)
    await page.ready
    const send = page.send.bind(page)
    await send('Page.enable')
    await send('Runtime.enable')
    await send('Page.addScriptToEvaluateOnNewDocument', { source: boot })
    await send('Emulation.setTouchEmulationEnabled', { enabled: true })
    for (const device of cases) {
      await send('Emulation.setDeviceMetricsOverride', { width: device.w, height: device.h, deviceScaleFactor: device.dpr, mobile: true, screenWidth: device.w, screenHeight: device.h, screenOrientation: { type: 'landscapePrimary', angle: device.angle } })
      await send('Emulation.setUserAgentOverride', { userAgent: device.ua })
      await send('Emulation.setSafeAreaInsetsOverride', { insets: device.insets })
      await send('Page.navigate', { url: `${base}&d=${device.name}-${Date.now()}` })
      const started = Date.now()
      while (Date.now() - started < 20000) {
        const result = await send('Runtime.evaluate', { expression: `document.querySelector('.schedule-assign-btn') && !document.querySelector('.cold-start-splash') ? 'ready' : ''`, returnByValue: true })
        if (result.result?.value === 'ready') break
        await sleep(150)
      }
      await sleep(400)
      await send('Runtime.evaluate', { expression: `document.querySelector('.schedule-assign-btn')?.click()`, returnByValue: true })
      await sleep(300)
      const read = async (label) => {
        const measured = await send('Runtime.evaluate', { expression: MEASURE, returnByValue: true })
        const value = measured.result?.value
        if (!value?.open) {
          failures.push(`${label} card did not open`)
          return
        }
        for (const key of ['card', 'close', 'save']) {
          if (value[key] == null) continue
          if (value[key] > value.limit + 1) failures.push(`${label} ${key} ${value[key]} > ${value.limit}`)
        }
        console.log(label, JSON.stringify(value))
      }
      if (device.narrow) {
        await send('Runtime.evaluate', { expression: `(() => { const real = window.visualViewport; const fake = new Proxy(real, { get(target, key) { if (key === 'width') return Math.max(320, window.innerWidth - 59); if (key === 'offsetLeft') return 0; const value = target[key]; return typeof value === 'function' ? value.bind(target) : value } }); Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake }); const input = document.querySelector('.schedule-assignment-modal input[type="search"]'); input?.focus(); input?.blur(); })()`, returnByValue: true })
        await sleep(200)
      }
      await read(device.name)
      await send('Runtime.evaluate', { expression: `(() => { const style = document.createElement('style'); style.textContent = '.schedule-assignment-modal .assignment-employee-meta strong { font-size: 22px !important; }'; document.head.appendChild(style); })()`, returnByValue: true })
      await sleep(150)
      await read(`${device.name}-22px`)
    }
    page.ws.close()
    browser.ws.close()
  } finally {
    chrome.kill('SIGKILL')
    await server.close()
    await rm(envDir, { recursive: true, force: true }).catch(() => {})
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
  }
  if (failures.length) {
    console.error(failures.join('\n'))
    process.exit(1)
  }
  console.log('assign card right edge passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
