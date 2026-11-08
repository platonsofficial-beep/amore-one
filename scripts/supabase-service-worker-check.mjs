import { spawn } from 'node:child_process'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build, preview } from 'vite'
import { enableViewportAuthBypass } from './viewportAuthBypass.mjs'

const SUPABASE_GETS = [
  'https://storm.supabase.co/rest/v1/floor_plans?select=id',
  'https://storm.supabase.co/rest/v1/reservations?select=id',
  'https://storm.supabase.co/auth/v1/user',
  'https://storm.supabase.co/storage/v1/bucket',
]

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/local/bin/google-chrome',
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // try the next installed binary
    }
  }
  throw new Error('Chrome is not installed')
}

function openSocket(url) {
  const ws = new WebSocket(url)
  let nextId = 0
  const pending = new Map()
  const listeners = new Map()
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.method) {
      for (const handler of listeners.get(message.method) ?? []) handler(message.params)
    }
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  })
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve)
    ws.addEventListener('error', () => reject(new Error('DevTools socket failed')))
  })
  return {
    ready,
    on(method, handler) {
      const handlers = listeners.get(method) ?? []
      handlers.push(handler)
      listeners.set(method, handlers)
    },
    send(method, params = {}) {
      const id = ++nextId
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
    },
    close() { ws.close() },
  }
}

async function launchChrome(userDataDir, binary) {
  const chrome = spawn(binary, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-sandbox',
    '--disable-gpu',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome did not open a DevTools port')), 15000)
    const onData = (chunk) => {
      const match = String(chunk).match(/DevTools listening on (ws:\/\/\S+)/)
      if (!match) return
      clearTimeout(timer)
      resolve(match[1])
    }
    chrome.stderr.on('data', onData)
    chrome.stdout.on('data', onData)
  })
  return { chrome, endpoint }
}

async function connectPage(endpoint) {
  const version = await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/version`).then((response) => response.json())
  const browser = openSocket(version.webSocketDebuggerUrl)
  await browser.ready
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const targets = await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/list`).then((response) => response.json())
  const page = openSocket(targets.find((entry) => entry.id === targetId).webSocketDebuggerUrl)
  await page.ready
  await page.send('Page.enable')
  await page.send('Runtime.enable')
  await page.send('Network.enable')
  return { browser, page }
}

function track(page) {
  const rows = []
  page.on('Network.responseReceived', (params) => {
    rows.push({
      url: params.response?.url ?? '',
      fromServiceWorker: Boolean(params.response?.fromServiceWorker),
      status: params.response?.status ?? 0,
    })
  })
  page.on('Network.requestWillBeSent', (params) => {
    const url = params.request?.url ?? ''
    if (!url.includes('supabase.co')) return
    const initiatorUrl = params.initiator?.url ?? ''
    rows.push({
      url,
      method: params.request?.method ?? '',
      initiatorType: params.initiator?.type ?? '',
      initiatorUrl,
      fromWorkerScript: /sw\.js|workbox/i.test(initiatorUrl),
    })
  })
  return rows
}

async function waitForLoad(page) {
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 8000)
    page.on('Page.loadEventFired', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function main() {
  enableViewportAuthBypass()
  const envDir = await mkdtemp(join(tmpdir(), 'one-sw-check-env-'))
  await writeFile(join(envDir, '.env'), 'VITE_AUTH_DISABLED=true\n')
  await build({ logLevel: 'warn', mode: 'production', envDir })
  const workerSource = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8')
  if (workerSource.includes('supabase.co') || workerSource.includes('NetworkOnly')) {
    throw new Error('Generated service worker still routes Supabase')
  }
  if (!workerSource.includes('precacheAndRoute') || !workerSource.includes('index.html') || !workerSource.includes('icon-192.png')) {
    throw new Error('Generated service worker dropped the app shell precache')
  }

  const server = await preview({
    logLevel: 'error',
    envDir,
    preview: { host: '127.0.0.1', port: 4183, strictPort: true },
  })
  const userDataDir = await mkdtemp(join(tmpdir(), 'one-sw-check-chrome-'))
  const launched = await launchChrome(userDataDir, await chromePath())
  try {
    const { browser, page } = await connectPage(launched.endpoint)
    const rows = track(page)
    await page.send('Page.navigate', { url: 'http://127.0.0.1:4183/?devRole=host' })
    await waitForLoad(page)
    let controller = null
    const deadline = Date.now() + 8000
    while (Date.now() < deadline) {
      const probe = await page.send('Runtime.evaluate', {
        expression: `navigator.serviceWorker.getRegistration().then((registration) => ({
          countReady: true,
          controller: navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : '',
          activeState: registration && registration.active ? registration.active.state : '',
          script: registration && registration.active ? registration.active.scriptURL : '',
        }))`,
        awaitPromise: true,
        returnByValue: true,
      })
      controller = probe.result?.value ?? null
      if (controller?.controller?.endsWith('/sw.js') && controller.activeState === 'activated') break
      await sleep(200)
    }
    if (!controller?.controller?.endsWith('/sw.js') || controller.activeState !== 'activated') {
      throw new Error(`Fresh profile did not activate this build's worker: ${JSON.stringify(controller)}`)
    }

    rows.length = 0
    const fetches = await page.send('Runtime.evaluate', {
      expression: `(async () => {
        const urls = ${JSON.stringify(SUPABASE_GETS)}
        const results = []
        for (const url of urls) {
          try {
            const response = await fetch(url)
            results.push({ url, status: response.status, ok: response.ok })
          } catch (error) {
            results.push({ url, failed: String(error && error.message || error) })
          }
        }
        const shell = await fetch('/icon-192.png')
        results.push({ url: '/icon-192.png', status: shell.status, ok: shell.ok })
        return results
      })()`,
      awaitPromise: true,
      returnByValue: true,
    })
    await sleep(300)
    const pageResults = fetches.result?.value ?? []
    const supabaseRows = rows.filter((row) => `${row.url}`.includes('supabase.co'))
    const workerSupabase = supabaseRows.filter((row) => row.fromWorkerScript || row.fromServiceWorker)
    const shell = rows.filter((row) => `${row.url}`.includes('/icon-192.png'))
    const shellFromWorker = shell.some((row) => row.fromServiceWorker)
    if (workerSupabase.length > 0) {
      throw new Error(`Service worker handled a Supabase request: ${JSON.stringify(workerSupabase)}`)
    }
    if (!shellFromWorker) {
      throw new Error(`Precached icon was not served by the activated worker: ${JSON.stringify(shell)}`)
    }
    const shellResult = pageResults.find((entry) => entry.url === '/icon-192.png')
    if (!shellResult?.ok) {
      throw new Error(`App shell icon was not readable: ${JSON.stringify(shellResult)}`)
    }
    console.log(JSON.stringify({
      provenance: 'Fresh Chrome profile, this build only, auth disabled, no Supabase project. Not live.',
      controller,
      supabaseGets: pageResults.filter((entry) => entry.url.includes('supabase.co')).length,
      workerHandledSupabase: workerSupabase.length,
      shellFromWorker,
    }))
    page.close()
    browser.close()
  } finally {
    launched.chrome.kill('SIGKILL')
    await server.close()
    await rm(envDir, { recursive: true, force: true }).catch(() => {})
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
