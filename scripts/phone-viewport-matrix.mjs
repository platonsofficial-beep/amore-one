import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
async function resolveBaseUrl() {
  const preferred = process.env.ONE_VIEWPORT_BASE_URL || 'http://127.0.0.1:5173'
  try {
    const response = await fetch(preferred, { signal: AbortSignal.timeout(1500) })
    if (response.ok || response.status < 500) return { url: preferred, close: async () => {} }
  } catch {
    // Start a local Vite server when one is not already running.
  }

  const { createServer } = await import('vite')
  const vite = await createServer({
    server: { host: '127.0.0.1', port: 4173, strictPort: false },
    logLevel: 'error',
  })
  await vite.listen()
  return {
    url: `http://127.0.0.1:${vite.config.server.port}/`,
    close: () => vite.close(),
  }
}

export const PHONE_VIEWPORT_SIZES = [
  [320, 568],
  [360, 640],
  [360, 780],
  [375, 667],
  [390, 844],
  [393, 852],
  [412, 915],
  [414, 896],
  [430, 932],
]

export const PHONE_VIEWPORT_PAGES = [
  {
    id: 'reservations',
    navigation: {
      activeView: 'reservations',
      settingsSection: 'profile',
      teamSection: 'today',
      stockSection: 'dashboard',
      operationsSection: 'dashboard',
    },
    ready: 'reservations',
    requiresFloorInWorkspace: true,
  },
  {
    id: 'schedule',
    navigation: {
      activeView: 'team',
      settingsSection: 'profile',
      teamSection: 'schedule',
      stockSection: 'dashboard',
      operationsSection: 'dashboard',
    },
    ready: 'schedule',
  },
  {
    id: 'stock',
    navigation: {
      activeView: 'stock',
      settingsSection: 'profile',
      teamSection: 'today',
      stockSection: 'dashboard',
      operationsSection: 'dashboard',
    },
    ready: 'stock',
  },
  {
    id: 'shell',
    navigation: {
      activeView: 'today',
      settingsSection: 'profile',
      teamSection: 'today',
      stockSection: 'dashboard',
      operationsSection: 'dashboard',
    },
    ready: 'shell',
  },
]

const FLOOR_LAYOUT = {
  version: 1,
  floors: [{
    id: 'main-dining',
    label: 'Main Dining',
    workspace: { width: 1000, height: 700, x: 0, y: 0 },
  }],
  activeFloorId: 'main-dining',
  objects: [1, 2, 3, 4].map((number) => ({
    id: `table-${number}`,
    type: 'table',
    floorId: 'main-dining',
    position: {
      x: 160 + ((number - 1) % 2) * 320,
      y: 140 + Math.floor((number - 1) / 2) * 240,
    },
    size: { width: 140, height: 140 },
    rotation: 0,
    properties: {
      shape: 'round',
      tableNumber: String(number),
      minGuests: 2,
      maxGuests: 4,
      visible: true,
    },
  })),
  publishedAt: '2026-01-01T00:00:00.000Z',
}

function chromePath() {
  return process.env.CHROME_PATH
    || process.env.GOOGLE_CHROME_BIN
    || '/usr/bin/google-chrome'
}

function bootSource(navigation) {
  const layout = JSON.stringify(FLOOR_LAYOUT)
  const nav = JSON.stringify(navigation)
  return `
    try {
      localStorage.setItem('one.navigation.v2', ${JSON.stringify(nav)});
      localStorage.removeItem('one.navigation.v1');
      localStorage.setItem('amore-floor-plan-published-v1--dev-workspace-id', ${JSON.stringify(layout)});
      localStorage.setItem('amore-floor-plan-published-v1', ${JSON.stringify(layout)});
      const applySafe = () => {
        const landscape = window.innerWidth > window.innerHeight;
        const root = document.documentElement;
        root.style.setProperty('--one-safe-area-left', landscape ? '59px' : '0px');
        root.style.setProperty('--one-safe-area-right', landscape ? '0px' : '0px');
        root.style.setProperty('--one-safe-area-top', landscape ? '0px' : '47px');
        root.style.setProperty('--one-safe-area-bottom', landscape ? '21px' : '34px');
      };
      applySafe();
      window.addEventListener('resize', applySafe);
      window.addEventListener('orientationchange', applySafe);
    } catch (error) {}
  `
}

const MEASURE_SOURCE = `(() => {
  const width = window.innerWidth
  const height = window.innerHeight
  const scrollWidth = Math.max(
    document.documentElement.scrollWidth,
    document.body ? document.body.scrollWidth : 0,
  )
  const clipped = []
  const nodes = document.body ? document.body.querySelectorAll('*') : []
  for (const el of nodes) {
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') continue
    const rect = el.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) continue
    if (rect.right <= width + 1) continue
    let scroller = el.parentElement
    let insideFittingScroller = false
    while (scroller && scroller !== document.body) {
      const scrollerStyle = getComputedStyle(scroller)
      const scrollerRect = scroller.getBoundingClientRect()
      const scrollsX = (scrollerStyle.overflowX === 'auto' || scrollerStyle.overflowX === 'scroll')
        && scroller.scrollWidth > scroller.clientWidth + 1
      if (scrollsX && scrollerRect.right <= width + 1 && scrollerRect.left >= -1) {
        insideFittingScroller = true
        break
      }
      scroller = scroller.parentElement
    }
    if (insideFittingScroller) continue
    clipped.push({
      tag: el.tagName,
      className: String(el.className || '').slice(0, 100),
      right: Math.round(rect.right),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
    })
    if (clipped.length >= 6) break
  }
  const sizedTables = [...document.querySelectorAll('.floor-table-node')].flatMap((el) => {
    const rect = el.getBoundingClientRect()
    if (rect.width <= 1 || rect.height <= 1) return []
    return [{
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      left: Math.round(rect.left),
      top: Math.round(rect.top),
    }]
  })
  const tables = sizedTables.slice(0, 4)
  const visibleTableCount = sizedTables.filter((table) => {
    const right = table.left + table.width
    const bottom = table.top + table.height
    return Math.min(right, width) - Math.max(table.left, 0) > 8
      && Math.min(bottom, height) - Math.max(table.top, 0) > 8
  }).length
  const floor = document.querySelector('.floor-plan-viewport')
  const floorRect = floor ? floor.getBoundingClientRect() : null
  const boxOf = (selector) => {
    const el = document.querySelector(selector)
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return { width: Math.round(rect.width), height: Math.round(rect.height), top: Math.round(rect.top) }
  }
  return {
    innerWidth: width,
    innerHeight: height,
    scrollWidth,
    shell: boxOf('.app-shell'),
    main: boxOf('.main-panel'),
    mainStyle: (() => {
      const el = document.querySelector('.main-panel')
      if (!el) return null
      const style = getComputedStyle(el)
      return { height: style.height, minHeight: style.minHeight, maxHeight: style.maxHeight, display: style.display }
    })(),
    host: boxOf('.mobile-host-reservations'),
    header: boxOf('.mobile-host-sticky-bar'),
    split: boxOf('.mobile-host-reservations-landscape'),
    shellClass: document.querySelector('.app-shell')?.className || '',
    shellStyle: (() => {
      const el = document.querySelector('.app-shell')
      if (!el) return null
      const style = getComputedStyle(el)
      return { height: style.height, gridTemplateRows: style.gridTemplateRows, overflow: style.overflow }
    })(),
    canvas: boxOf('.host-operations-canvas'),
    layout: boxOf('.floor-plan-layout-space'),
    overflow: scrollWidth - width,
    clipped,
    tableCount: sizedTables.length,
    visibleTableCount,
    tables,
    floor: floorRect ? {
      width: Math.round(floorRect.width),
      height: Math.round(floorRect.height),
      top: Math.round(floorRect.top),
    } : null,
  }
})()`

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
    ws.addEventListener('error', () => reject(new Error(`Unable to connect to ${url}`)))
  })
  return {
    ws,
    ready,
    send(method, params = {}) {
      const id = ++nextId
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
    },
  }
}

async function launchChrome() {
  const userDataDir = await mkdtemp(join(tmpdir(), 'one-phone-viewport-'))
  const chrome = spawn(chromePath(), [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--hide-scrollbars',
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
    chrome.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`Chrome exited before DevTools was ready (${code})`))
    })
  })

  return {
    endpoint,
    async close() {
      chrome.kill('SIGKILL')
      await new Promise((resolve) => setTimeout(resolve, 200))
      await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
    },
  }
}

async function setViewport(send, width, height) {
  const landscape = width > height
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: width,
    screenHeight: height,
    screenOrientation: {
      type: landscape ? 'landscapePrimary' : 'portraitPrimary',
      angle: landscape ? 90 : 0,
    },
  })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true })
}

function workspaceFloorExpected(width, height) {
  return width > height && height >= 280
}

function assertMeasurement(page, width, height, measurement) {
  const failures = []
  if (measurement.scrollWidth > measurement.innerWidth + 1) {
    failures.push(`horizontal overflow ${measurement.scrollWidth} > ${measurement.innerWidth}`)
  }
  if (measurement.clipped.length > 0) {
    const sample = measurement.clipped
      .map((item) => `${item.className || item.tag} right ${item.right}`)
      .join('; ')
    failures.push(`clipped past the right edge: ${sample}`)
  }
  const floorVisible = measurement.floor && measurement.floor.width > 20 && measurement.floor.height > 40
  const visibleTableCount = measurement.visibleTableCount || 0
  if (page.requiresFloorInWorkspace && workspaceFloorExpected(width, height)) {
    if (!floorVisible) failures.push('floor plan did not render')
    if (visibleTableCount < 1) failures.push('floor plan has no tables inside the viewport')
  } else if (floorVisible && visibleTableCount < 1) {
    failures.push('floor plan is visible but its tables are outside the viewport')
  }
  return failures
}

async function waitForApp(send) {
  const started = Date.now()
  while (Date.now() - started < 12000) {
    const result = await send('Runtime.evaluate', {
      expression: `document.querySelector('.app-shell') ? 'ready' : ''`,
      returnByValue: true,
    })
    if (result.result?.value === 'ready') return
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('App shell did not render')
}

export async function runPhoneViewportMatrix({
  screenshotDir = '',
  sizes = PHONE_VIEWPORT_SIZES,
  pages = PHONE_VIEWPORT_PAGES,
} = {}) {
  const sizeFilter = `${process.env.ONE_VIEWPORT_FILTER ?? ''}`.trim()
  const pageFilter = `${process.env.ONE_VIEWPORT_PAGES ?? ''}`.trim()
  if (sizeFilter) {
    sizes = sizes.filter(([width, height]) => sizeFilter.split(',').includes(`${width}x${height}`))
  }
  if (pageFilter) {
    const allowed = new Set(pageFilter.split(','))
    pages = pages.filter((page) => allowed.has(page.id))
  }
  if (screenshotDir) await mkdir(screenshotDir, { recursive: true })

  const appServer = await resolveBaseUrl()
  const baseUrl = `${appServer.url.replace(/\/$/, '')}/?devRole=owner`

  const chrome = await launchChrome()
  const version = await fetch(`http://127.0.0.1:${new URL(chrome.endpoint).port}/json/version`).then((response) => response.json())
  const browser = openSocket(version.webSocketDebuggerUrl)
  await browser.ready
  const failures = []
  const shots = []

  try {
    for (const page of pages) {
      const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
      const targets = await fetch(`http://127.0.0.1:${new URL(chrome.endpoint).port}/json/list`).then((response) => response.json())
      const target = targets.find((entry) => entry.id === targetId)
      const pageSocket = openSocket(target.webSocketDebuggerUrl)
      await pageSocket.ready
      const send = pageSocket.send.bind(pageSocket)
      await send('Page.enable')
      await send('Runtime.enable')
      await send('Page.addScriptToEvaluateOnNewDocument', { source: bootSource(page.navigation) })

      const navigate = async (width, height) => {
        await setViewport(send, width, height)
        const token = `${page.id}-${width}x${height}-${Date.now()}`
        await send('Page.navigate', { url: `${baseUrl}&viewportCase=${token}` })
        const started = Date.now()
        while (Date.now() - started < 12000) {
          const located = await send('Runtime.evaluate', {
            expression: `location.search.includes(${JSON.stringify(token)}) && document.querySelector('.app-shell') ? 'ready' : ''`,
            returnByValue: true,
          })
          if (located.result?.value === 'ready') break
          await new Promise((resolve) => setTimeout(resolve, 150))
        }
        await waitForApp(send)
        await new Promise((resolve) => setTimeout(resolve, 200))
      }

      const waitForFloorTables = async () => {
        const started = Date.now()
        while (Date.now() - started < 8000) {
          const result = await send('Runtime.evaluate', {
            expression: `(() => {
              const floor = document.querySelector('.floor-plan-viewport')
              const floorRect = floor ? floor.getBoundingClientRect() : null
              const width = window.innerWidth
              const height = window.innerHeight
              const visible = [...document.querySelectorAll('.floor-table-node')].filter((el) => {
                const rect = el.getBoundingClientRect()
                if (rect.width <= 1 || rect.height <= 1) return false
                const right = rect.left + rect.width
                const bottom = rect.top + rect.height
                return Math.min(right, width) - Math.max(rect.left, 0) > 8
                  && Math.min(bottom, height) - Math.max(rect.top, 0) > 8
              }).length
              return Boolean(floorRect && floorRect.width > 20 && floorRect.height > 40 && visible > 0)
            })()`,
            returnByValue: true,
          })
          if (result.result?.value === true) return
          await new Promise((resolve) => setTimeout(resolve, 200))
        }
      }

      for (const [portraitWidth, portraitHeight] of sizes) {
        const landscapeWidth = portraitHeight
        const landscapeHeight = portraitWidth

        await navigate(portraitWidth, portraitHeight)
        const portrait = await send('Runtime.evaluate', { expression: MEASURE_SOURCE, returnByValue: true })
        const portraitResult = portrait.result.value
        const portraitFailures = assertMeasurement(page, portraitWidth, portraitHeight, portraitResult)
        const portraitName = `${page.id}-${portraitWidth}x${portraitHeight}-portrait.png`
        if (screenshotDir) {
          const shot = await send('Page.captureScreenshot', { format: 'png' })
          await writeFile(join(screenshotDir, portraitName), Buffer.from(shot.data, 'base64'))
          shots.push(portraitName)
        }
        if (portraitFailures.length) {
          failures.push({ page: page.id, size: `${portraitWidth}x${portraitHeight}`, mode: 'portrait', failures: portraitFailures })
        }

        await navigate(landscapeWidth, landscapeHeight)
        if (page.requiresFloorInWorkspace && workspaceFloorExpected(landscapeWidth, landscapeHeight)) {
          await waitForFloorTables()
        }
        const landscape = await send('Runtime.evaluate', { expression: MEASURE_SOURCE, returnByValue: true })
        const landscapeResult = landscape.result.value
        if (process.env.ONE_VIEWPORT_DEBUG === '1') {
          console.log(page.id, `${landscapeWidth}x${landscapeHeight}`, 'landscape', JSON.stringify(landscapeResult))
        }
        const landscapeFailures = assertMeasurement(page, landscapeWidth, landscapeHeight, landscapeResult)
        const landscapeName = `${page.id}-${landscapeWidth}x${landscapeHeight}-landscape.png`
        if (screenshotDir) {
          const shot = await send('Page.captureScreenshot', { format: 'png' })
          await writeFile(join(screenshotDir, landscapeName), Buffer.from(shot.data, 'base64'))
          shots.push(landscapeName)
        }
        if (landscapeFailures.length) {
          failures.push({ page: page.id, size: `${landscapeWidth}x${landscapeHeight}`, mode: 'landscape', failures: landscapeFailures })
        }

        await navigate(portraitWidth, portraitHeight)
        await setViewport(send, landscapeWidth, landscapeHeight)
        await send('Runtime.evaluate', {
          expression: `window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('orientationchange'));`,
          returnByValue: true,
        })
        await new Promise((resolve) => setTimeout(resolve, 500))
        if (page.requiresFloorInWorkspace && workspaceFloorExpected(landscapeWidth, landscapeHeight)) {
          await waitForFloorTables()
        }
        const rotated = await send('Runtime.evaluate', { expression: MEASURE_SOURCE, returnByValue: true })
        const rotatedResult = rotated.result.value
        if (process.env.ONE_VIEWPORT_DEBUG === '1') {
          console.log(page.id, `${landscapeWidth}x${landscapeHeight}`, 'rotate', JSON.stringify(rotatedResult))
        }
        const rotatedFailures = assertMeasurement(page, landscapeWidth, landscapeHeight, rotatedResult)
        const rotatedName = `${page.id}-${landscapeWidth}x${landscapeHeight}-rotate.png`
        if (screenshotDir) {
          const shot = await send('Page.captureScreenshot', { format: 'png' })
          await writeFile(join(screenshotDir, rotatedName), Buffer.from(shot.data, 'base64'))
          shots.push(rotatedName)
        }
        if (rotatedFailures.length) {
          failures.push({ page: page.id, size: `${portraitWidth}x${portraitHeight} → ${landscapeWidth}x${landscapeHeight}`, mode: 'rotate', failures: rotatedFailures })
        }
      }

      pageSocket.ws.close()
      await browser.send('Target.closeTarget', { targetId }).catch(() => {})
    }
  } finally {
    browser.ws.close()
    await chrome.close()
    await appServer.close()
  }

  return { failures, shots }
}
