import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { enableViewportAuthBypass } from './viewportAuthBypass.mjs'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForHttp(url, timeoutMs = 60000) {
  const started = Date.now()
  let lastError = 'no response'
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
      if (response.status < 500) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${url} (${lastError})`)
}

async function resolveBaseUrl() {
  const preferred = `${process.env.ONE_VIEWPORT_BASE_URL ?? ''}`.trim()
  if (preferred) {
    await waitForHttp(preferred)
    return { url: preferred, close: async () => {} }
  }

  // CI has no .env and no dev server. Bake the same local auth bypass into a
  // production preview and wait until that port is actually serving.
  // An empty env dir keeps a developer .env from being required.
  enableViewportAuthBypass()
  const envDir = await mkdtemp(join(tmpdir(), 'one-viewport-env-'))
  const { build, preview } = await import('vite')
  await build({ logLevel: 'warn', mode: 'production', envDir })
  const server = await preview({
    logLevel: 'error',
    envDir,
    preview: {
      host: '127.0.0.1',
      port: 4173,
      strictPort: false,
    },
  })
  const address = server.httpServer?.address?.()
  const port = address && typeof address === 'object' ? address.port : 4173
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
  [360, 740],
  [440, 956],
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
    id: 'chat',
    navigation: {
      activeView: 'chat',
      settingsSection: 'profile',
      teamSection: 'today',
      stockSection: 'dashboard',
      operationsSection: 'dashboard',
    },
    ready: 'chat',
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

const VIEWPORT_SEATINGS = [
  ['preview-brunch', 'Brunch', '10:00', 0],
  ['preview-lunch', 'Lunch', '12:30', 1],
  ['preview-dinner-1', 'Dinner 1', '18:00', 2],
  ['preview-dinner-2', 'Dinner 2', '21:00', 3],
].map(([id, name, start_time, sort_order]) => ({
  id,
  name,
  start_time,
  duration_minutes: 120,
  days_of_week: [0, 1, 2, 3, 4, 5, 6],
  sort_order,
  is_active: true,
}))

function bootSource(navigation) {
  const layout = JSON.stringify(FLOOR_LAYOUT)
  const nav = JSON.stringify(navigation)
  const seatings = JSON.stringify(VIEWPORT_SEATINGS)
  return `
    try {
      localStorage.setItem('one.navigation.v2', ${JSON.stringify(nav)});
      localStorage.removeItem('one.navigation.v1');
      localStorage.setItem('amore-floor-plan-published-v1--dev-workspace-id', ${JSON.stringify(layout)});
      localStorage.setItem('amore-floor-plan-published-v1', ${JSON.stringify(layout)});
      localStorage.setItem('amore-viewport-seatings-v1', ${JSON.stringify(seatings)});
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
    const label = el.querySelector('.floor-table-number')
    const labelClipped = Boolean(
      label
      && label.clientWidth > 0
      && label.scrollWidth > label.clientWidth + 1,
    )
    return [{
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      labelClipped,
      label: label ? label.textContent.trim() : '',
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
  const safeLeft = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--one-safe-area-left')) || 0
  const edgeLeft = (selector) => {
    const el = document.querySelector(selector)
    if (!el) return null
    const rect = el.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return null
    return Math.round(rect.left)
  }
  const search = document.querySelector('.mobile-host-reservations-search input')
  const areaSelect = document.querySelector('.floor-plan-area-select-input')
  const seatingCount = document.querySelector('.floor-seating-selector-chip-count')
  const seatingChip = seatingCount ? seatingCount.closest('.floor-seating-selector-chip') : null
  const seatingCountRect = seatingCount ? seatingCount.getBoundingClientRect() : null
  const seatingChipRect = seatingChip ? seatingChip.getBoundingClientRect() : null
  const title = document.querySelector('.floor-plan-canvas-area-title')
  const titleRect = title ? title.getBoundingClientRect() : null
  const seatingNames = [...document.querySelectorAll('.floor-seating-selector-chip-name')].map((el) => ({
    text: el.textContent.trim(),
    clipped: el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1,
  }))
  const nextArea = document.querySelector('.floor-plan-area-nav-btn[aria-label="Next area"]')
  const nextAreaRect = nextArea ? nextArea.getBoundingClientRect() : null
  const titleOverlapsTable = Boolean(titleRect && titleRect.width > 1 && sizedTables.some((table) => {
    const overlapW = Math.min(table.left + table.width, titleRect.right) - Math.max(table.left, titleRect.left)
    const overlapH = Math.min(table.top + table.height, titleRect.bottom) - Math.max(table.top, titleRect.top)
    return overlapW > 2 && overlapH > 2
  }))
  const tablesOverlap = sizedTables.some((table, index) => sizedTables.slice(index + 1).some((other) => {
    const overlapW = Math.min(table.left + table.width, other.left + other.width) - Math.max(table.left, other.left)
    const overlapH = Math.min(table.top + table.height, other.top + other.height) - Math.max(table.top, other.top)
    return overlapW > 4 && overlapH > 4
  }))
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
    safeLeft,
    overlayProbe: (() => {
      const measureVar = (name) => {
        const probe = document.createElement('div')
        probe.setAttribute('data-overlay-probe', 'true')
        probe.style.cssText = 'position:absolute;visibility:hidden;height:1px;width:var(' + name + ');'
        document.body.appendChild(probe)
        const width = probe.getBoundingClientRect().width
        probe.remove()
        return width
      }
      const safe = measureVar('--safe-l')
      const safeR = measureVar('--safe-r')
      const make = (className, parent) => {
        const el = document.createElement('div')
        el.className = className
        el.setAttribute('data-overlay-probe', 'true')
        el.textContent = 'Overlay'
        parent.appendChild(el)
        return el
      }
      const sheet = make('stock-item-more-menu-panel is-sheet is-visible', document.body)
      const backdrop = make('mobile-sheet-backdrop', document.body)
      const mobileSheet = make('mobile-sheet', backdrop)
      const drawer = make('notification-drawer', document.body)
      const box = (el) => {
        const rect = el.getBoundingClientRect()
        return { left: Math.round(rect.left), right: Math.round(rect.right) }
      }
      const result = { safe, safeR, sheet: box(sheet), mobile: box(mobileSheet), drawer: box(drawer) }
      document.querySelectorAll('[data-overlay-probe]').forEach((node) => node.remove())
      return result
    })(),
    reservationsHeader: (() => {
      const visible = (selector) => [...document.querySelectorAll(selector)].find((el) => {
        const rect = el.getBoundingClientRect()
        const style = getComputedStyle(el)
        return rect.width > 8 && rect.height > 8 && style.display !== 'none' && style.visibility !== 'hidden'
      })
      const box = (el) => {
        if (!el) return null
        return {
          text: el.textContent.trim(),
          clipped: el.scrollWidth > el.clientWidth + 2,
        }
      }
      return {
        title: box(visible('.mobile-host-sticky-title, .reservations-host-header-main h2')),
        date: box(visible('[data-testid="mobile-host-date-label"], .host-workspace-date-nav-label')),
      }
    })(),
    headerLeft: edgeLeft('.mobile-host-sticky-bar'),
    searchLeft: edgeLeft('.mobile-host-reservations-search input'),
    areaFilterLeft: edgeLeft('.host-queue-toolbar-btn'),
    searchPlaceholder: search ? search.getAttribute('placeholder') : '',
    chatScreen: Boolean(document.querySelector('.chat-screen')),
    chatList: Boolean(document.querySelector('.chat-list')),
    chatSearch: Boolean(document.querySelector('[data-testid="chat-search"]')),
    chatSplit: Boolean(document.querySelector('.chat-screen.is-split')),
    searchPlaceholderClipped: (() => {
      if (!search) return false
      const style = getComputedStyle(search)
      const probe = document.createElement('span')
      probe.textContent = search.getAttribute('placeholder') || ''
      probe.style.font = style.font
      probe.style.position = 'absolute'
      probe.style.visibility = 'hidden'
      probe.style.whiteSpace = 'nowrap'
      document.body.appendChild(probe)
      const pad = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
      const clipped = probe.offsetWidth > search.clientWidth - pad + 1
      probe.remove()
      return clipped
    })(),
    sortVisibleLabel: (() => {
      const button = [...document.querySelectorAll('.host-queue-toolbar-btn')].find((el) => (
        (el.getAttribute('aria-label') || '').startsWith('Sort')
      ))
      if (!button) return ''
      const visible = [...button.querySelectorAll('.host-queue-toolbar-label, .host-queue-toolbar-label-short')]
        .find((el) => getComputedStyle(el).display !== 'none')
      return visible ? visible.textContent.trim() : ''
    })(),
    sortButtonClipped: (() => {
      const button = [...document.querySelectorAll('.host-queue-toolbar-btn')].find((el) => (
        (el.getAttribute('aria-label') || '').startsWith('Sort')
      ))
      return Boolean(button && button.clientWidth > 0 && button.scrollWidth > button.clientWidth + 2)
    })(),
    areaSelectClipped: Boolean(areaSelect && areaSelect.offsetWidth > 0 && areaSelect.scrollWidth > areaSelect.clientWidth + 2),
    seatingCountClipped: Boolean(
      seatingCountRect
      && seatingChipRect
      && seatingCountRect.height > 1
      && (
        seatingCountRect.bottom > seatingChipRect.bottom + 1
        || seatingCountRect.right > seatingChipRect.right + 1
        || seatingCountRect.top < seatingChipRect.top - 1
      ),
    ),
    titleOverlapsTable,
    seatingNames,
    tableTooSmall: sizedTables.some((table) => table.width < 36 || table.height < 36),
    tableLabelClipped: sizedTables.some((table) => table.labelClipped),
    tablesOverlap,
    sidebar: (() => {
      const el = document.querySelector('.sidebar')
      if (!el) return null
      const style = getComputedStyle(el)
      if (style.display === 'none' || el.getClientRects().length === 0) return null
      const rect = el.getBoundingClientRect()
      const links = [...el.querySelectorAll('.nav-link')].map((link) => {
        const linkRect = link.getBoundingClientRect()
        return {
          top: linkRect.top,
          bottom: linkRect.bottom,
          left: linkRect.left,
          width: linkRect.width,
          height: linkRect.height,
        }
      })
      return {
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        linkCount: links.length,
        linksInside: links.every((link) => (
          link.top >= rect.top - 1
          && link.bottom <= rect.bottom + 1
          && link.left >= rect.left - 1
          && link.width > 8
          && link.height > 8
        )),
      }
    })(),
    reservationsNavLabel: (() => {
      const el = [...document.querySelectorAll('.mobile-bottom-nav-label')]
        .find((node) => node.textContent.trim() === 'Reservations')
      if (!el || el.clientWidth < 1) return null
      return {
        text: el.textContent.trim(),
        clipped: el.scrollWidth > el.clientWidth + 1,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        fontSize: getComputedStyle(el).fontSize,
      }
    })(),
    stockChromePosition: (() => {
      const chrome = document.querySelector('.main-panel-stock > .stock-focus-chrome')
      if (!chrome) return ''
      return getComputedStyle(chrome).position
    })(),
    stockChromeHeight: (() => {
      const chrome = document.querySelector('.main-panel-stock > .stock-focus-chrome')
      if (!chrome) return 0
      return Math.round(chrome.getBoundingClientRect().height)
    })(),
    scheduleDayName: (() => {
      const el = document.querySelector('.blend-grid-header-day-name')
      return el ? el.textContent.trim() : ''
    })(),
    dateLabel: (() => {
      const el = document.querySelector('[data-testid="mobile-host-date-label"]')
      if (!el || el.clientWidth < 1) return null
      return {
        text: el.textContent.trim(),
        clipped: el.scrollWidth > el.clientWidth + 2,
      }
    })(),
    toolbarSignature: (() => {
      const toolbar = document.querySelector('.floor-plan-toolbar')
      if (!toolbar) return ''
      return [...toolbar.querySelectorAll('button, summary, select')].flatMap((el) => {
        const style = getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden') return []
        const rect = el.getBoundingClientRect()
        if (rect.width < 2 || rect.height < 2) return []
        const name = el.getAttribute('aria-label') || el.tagName
        return [name]
      }).join('|')
    })(),
    toolbarOverlaps: (() => {
      const toolbar = document.querySelector('.floor-plan-toolbar')
      if (!toolbar) return false
      const rects = [...toolbar.querySelectorAll('button, summary, select')].flatMap((el) => {
        const style = getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden') return []
        const rect = el.getBoundingClientRect()
        if (rect.width < 2 || rect.height < 2) return []
        return [rect]
      })
      return rects.some((rect, index) => rects.slice(index + 1).some((other) => {
        const overlapW = Math.min(rect.right, other.right) - Math.max(rect.left, other.left)
        const overlapH = Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top)
        return overlapW > 4 && overlapH > 4
      }))
    })(),
    nextArea: nextAreaRect && nextAreaRect.width > 1 ? {
      left: Math.round(nextAreaRect.left),
      right: Math.round(nextAreaRect.right),
      width: Math.round(nextAreaRect.width),
      height: Math.round(nextAreaRect.height),
    } : null,
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
  if (height > width && measurement.overlayProbe && measurement.overlayProbe.safe > 1) {
    failures.push(`portrait side inset is ${measurement.overlayProbe.safe}px`)
  }
  if (width > height && height <= 520 && (measurement.safeLeft || 0) >= 59) {
    const overlay = measurement.overlayProbe
    if (!overlay) failures.push('overlay inset probe missing')
    else {
      const safe = measurement.safeLeft
      if (overlay.safe < safe - 1) failures.push(`--safe-l used value is ${overlay.safe}px`)
      if (Math.abs(overlay.safe - overlay.safeR) > 0.5) failures.push('landscape insets are not symmetric')
      const edges = [
        ['stock sheet', overlay.sheet],
        ['mobile sheet', overlay.mobile],
        ['notification drawer', overlay.drawer],
      ]
      for (const [name, box] of edges) {
        if (!box) {
          failures.push(`${name} probe missing`)
          continue
        }
        if (box.left < safe - 1) {
          failures.push(`${name} starts at ${box.left}px inside the ${safe}px inset`)
        }
        if (box.right > width - safe + 1) {
          failures.push(`${name} ends at ${box.right}px inside the right inset`)
        }
      }
    }
  }
  if ((measurement.safeLeft || 0) >= 59) {
    const edges = [
      ['header', measurement.headerLeft],
      ['search', measurement.searchLeft],
      ['area filter', measurement.areaFilterLeft],
    ]
    for (const [name, left] of edges) {
      if (left == null) continue
      if (left < measurement.safeLeft - 1) {
        failures.push(`${name} starts at ${left}px under the ${measurement.safeLeft}px left safe area`)
      }
    }
  }
  if (measurement.areaSelectClipped) failures.push('area selector text is truncated')
  if (measurement.seatingCountClipped) failures.push('seating availability line is clipped')
  if (measurement.titleOverlapsTable) failures.push('floor area label covers a table')
  if (page.id === 'reservations' && measurement.searchPlaceholder && measurement.searchPlaceholder !== 'Search guest') {
    failures.push(`search placeholder is "${measurement.searchPlaceholder}"`)
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
    if (measurement.tableTooSmall) failures.push('floor table is smaller than 36px')
    if (measurement.tableLabelClipped) failures.push('floor table label is clipped')
    if (measurement.tablesOverlap) failures.push('floor tables overlap')
    const floorBox = measurement.floor
    const rowInView = (measurement.tables || []).some((table) => {
      const center = table.top + table.height / 2
      return center >= floorBox.top && center <= floorBox.top + floorBox.height
    })
    if (floorBox && !rowInView) failures.push('floor tables sit outside the visible plan')
    const seatingNames = measurement.seatingNames || []
    for (const name of ['Brunch', 'Lunch', 'Dinner 1', 'Dinner 2']) {
      if (!seatingNames.some((entry) => entry.text === name)) {
        failures.push(`seating chip missing full name ${name}`)
      }
    }
    if (seatingNames.some((entry) => entry.clipped)) failures.push('seating name is clipped')
    if (!measurement.nextArea || measurement.nextArea.width < 36 || measurement.nextArea.right > width - 6) {
      failures.push('next area arrow is missing, clipped, or touching the right edge')
    }
    if (height <= 520) {
      if (measurement.toolbarOverlaps) failures.push('floor toolbar controls overlap')
      if (!measurement.dateLabel?.text) failures.push('header date is missing')
      else if (measurement.dateLabel.clipped) failures.push(`header date is truncated (${measurement.dateLabel.text})`)
      const header = measurement.reservationsHeader
      if (header?.title?.clipped) failures.push(`header title is truncated (${header.title.text})`)
      if (header?.date?.text && /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/.test(header.date.text)) {
        failures.push(`header date is long (${header.date.text})`)
      }
      if (measurement.searchPlaceholderClipped) failures.push('search placeholder is clipped')
      if (measurement.sortVisibleLabel !== 'Sort') {
        failures.push(`sort control shows "${measurement.sortVisibleLabel}"`)
      }
      if (measurement.sortButtonClipped) failures.push('sort control is clipped')
    }
  } else if (floorVisible && visibleTableCount < 1) {
    failures.push('floor plan is visible but its tables are outside the viewport')
  }
  const shortPhoneLandscape = width > height && height <= 460 && width <= 1024
  if (page.id === 'shell' && shortPhoneLandscape && measurement.sidebar) {
    const sidebar = measurement.sidebar
    if (sidebar.width > 110) failures.push(`sidebar is ${sidebar.width}px wide`)
    if (sidebar.scrollHeight > sidebar.clientHeight + 2) failures.push('sidebar items scroll')
    if (!sidebar.linksInside || sidebar.linkCount < 1) failures.push('sidebar items are clipped')
    if ((measurement.safeLeft || 0) >= 59 && sidebar.left < measurement.safeLeft - 1) {
      failures.push(`sidebar starts at ${sidebar.left}px under the left safe area`)
    }
  }
  if (page.id === 'shell' && height > width && width <= 430 && measurement.reservationsNavLabel?.clipped) {
    const label = measurement.reservationsNavLabel
    failures.push(`Reservations bottom nav label is truncated (${label.clientWidth}px holds ${label.scrollWidth}px at ${label.fontSize})`)
  }
  if (page.id === 'stock' && width > height && height <= 520 && measurement.stockChromePosition && measurement.stockChromePosition !== 'sticky') {
    failures.push(`stock tabs are ${measurement.stockChromePosition}`)
  }
  if (page.id === 'stock' && width > height && height <= 520 && measurement.stockChromeHeight > Math.round(height * 0.22)) {
    failures.push(`stock tab header is ${measurement.stockChromeHeight}px of ${height}px`)
  }
  if (page.id === 'chat') {
    if (!measurement.chatScreen) failures.push('chat screen did not render')
    if (!measurement.chatList) failures.push('chat list did not render')
    if (!measurement.chatSearch) failures.push('chat search did not render')
    const split = Boolean(measurement.chatSplit)
    if (width > height && width >= 700 && !split) failures.push('chat landscape is not split')
    if (height > width && split) failures.push('chat portrait is split')
  }
  if (page.id === 'schedule' && width > height && height <= 460 && width <= 1100 && measurement.scheduleDayName) {
    if (measurement.scheduleDayName.length > 3) {
      failures.push(`schedule day name is "${measurement.scheduleDayName}"`)
    }
  }
  return failures
}

async function applySimulatedSafeArea(send) {
  await send('Runtime.evaluate', {
    expression: `(() => {
      const landscape = window.innerWidth > window.innerHeight
      const root = document.documentElement
      root.style.setProperty('--one-safe-area-left', landscape ? '59px' : '0px')
      root.style.setProperty('--one-safe-area-right', '0px')
      root.style.setProperty('--one-safe-area-top', landscape ? '0px' : '47px')
      root.style.setProperty('--one-safe-area-bottom', landscape ? '21px' : '34px')
      window.dispatchEvent(new Event('resize'))
    })()`,
    returnByValue: true,
  })
  await sleep(120)
}

async function waitForApp(send) {
  const started = Date.now()
  while (Date.now() - started < 45000) {
    const result = await send('Runtime.evaluate', {
      expression: `document.querySelector('.app-shell') ? 'ready' : ''`,
      returnByValue: true,
    })
    if (result.result?.value === 'ready') return
    await sleep(200)
  }
  const diag = await send('Runtime.evaluate', {
    expression: `JSON.stringify({ href: location.href, title: document.title, text: (document.body && document.body.innerText || '').slice(0, 400) })`,
    returnByValue: true,
  }).catch(() => null)
  throw new Error(`App shell did not render ${diag?.result?.value || ''}`.trim())
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
        while (Date.now() - started < 45000) {
          const located = await send('Runtime.evaluate', {
            expression: `location.search.includes(${JSON.stringify(token)}) && document.querySelector('.app-shell') ? 'ready' : ''`,
            returnByValue: true,
          })
          if (located.result?.value === 'ready') break
          await new Promise((resolve) => setTimeout(resolve, 150))
        }
        await waitForApp(send)
        await applySimulatedSafeArea(send)
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

      const layoutSignatures = new Map()
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
        if (page.id === 'reservations' && workspaceFloorExpected(landscapeWidth, landscapeHeight)) {
          const signatureKey = `${landscapeWidth}x${landscapeHeight}`
          if (['667x375', '844x390', '852x393', '932x430', '956x440'].includes(signatureKey)) {
            layoutSignatures.set(signatureKey, landscapeResult.toolbarSignature || '')
          }
          const locked = await send('Runtime.evaluate', {
            expression: `(async () => {
              const button = document.querySelector('[data-testid="host-floor-interaction-lock"]')
              const viewport = document.querySelector('.floor-plan-viewport.is-host-viewport')
              if (!button || !viewport) return { skipped: true }
              const wasLocked = button.getAttribute('aria-pressed') === 'true'
              if (!wasLocked) button.click()
              await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
              const style = getComputedStyle(viewport)
              const blocked = style.overflow === 'hidden' && !String(style.touchAction).includes('pan')
              if (!wasLocked) button.click()
              return { blocked, overflow: style.overflow, touchAction: style.touchAction }
            })()`,
            awaitPromise: true,
            returnByValue: true,
          })
          if (!locked.result?.value?.skipped && !locked.result?.value?.blocked) {
            landscapeFailures.push(`lock does not freeze the map (${locked.result?.value?.overflow} ${locked.result?.value?.touchAction})`)
          }
          const followUp = await send('Runtime.evaluate', {
            expression: `(async () => {
              const failures = []
              const lock = document.querySelector('[data-testid="host-floor-interaction-lock"]')
              const viewport = document.querySelector('.floor-plan-viewport.is-host-viewport')
              if (lock) {
                const lockRect = lock.getBoundingClientRect()
                if (lockRect.right > window.innerWidth - 6) failures.push('lock touches the right edge')
                const wasLocked = lock.getAttribute('aria-pressed') === 'true'
                if (!wasLocked) lock.click()
                await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
                const toast = document.querySelector('.floor-plan-lock-toast')
                if (!toast) failures.push('lock toast did not render')
                else {
                  const toastStyle = getComputedStyle(toast)
                  const toastRect = toast.getBoundingClientRect()
                  if (toastStyle.position !== 'fixed') failures.push('lock toast is not fixed')
                  if (Number.parseInt(toastStyle.zIndex, 10) < 1000) failures.push('lock toast sits under the page')
                  if (toastRect.top < 0 || toastRect.bottom > window.innerHeight || toastRect.left < 0 || toastRect.right > window.innerWidth) {
                    failures.push('lock toast is outside the viewport')
                  }
                  const chips = document.querySelector('.floor-seating-selector-shell')
                  if (chips) {
                    const chipRect = chips.getBoundingClientRect()
                    const overlaps = toastRect.bottom > chipRect.top + 2 && toastRect.top < chipRect.bottom - 2
                      && toastRect.right > chipRect.left && toastRect.left < chipRect.right
                    if (overlaps && toastRect.top >= chipRect.top) failures.push('lock toast is hidden behind the seating chips')
                  }
                }
                const zoomIn = document.querySelector('.floor-plan-zoom-btn[aria-label="Zoom in"]')
                if (zoomIn && !zoomIn.disabled) failures.push('zoom stays enabled while the map is locked')
                if (!wasLocked) lock.click()
              }
              const more = document.querySelector('.floor-plan-toolbar-more-summary')
              if (more) {
                more.click()
                await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
                const item = [...document.querySelectorAll('.floor-plan-toolbar-more-menu button')]
                  .find((button) => button.textContent.includes('Edit layout'))
                if (!item) failures.push('Edit layout is missing from More')
                else {
                  const rect = item.getBoundingClientRect()
                  const menuStyle = getComputedStyle(item.closest('.floor-plan-toolbar-more-menu'))
                  if (menuStyle.position !== 'fixed' || Number.parseInt(menuStyle.zIndex, 10) < 1000) {
                    failures.push('More menu is not on the top layer')
                  }
                  if (rect.top < 0 || rect.left < 0 || rect.bottom > window.innerHeight + 1 || rect.right > window.innerWidth + 1 || rect.height < 8) {
                    failures.push('Edit layout is not fully visible')
                  }
                }
                more.click()
              }
              const fit = document.querySelector('.floor-plan-zoom-btn[aria-label="Fit to view"]')
              if (fit && viewport && !fit.disabled) {
                fit.click()
                await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
                const viewRect = viewport.getBoundingClientRect()
                const tables = [...viewport.querySelectorAll('.floor-table-node')]
                const outside = tables.filter((node) => {
                  const rect = node.getBoundingClientRect()
                  if (rect.width < 2 || rect.height < 2) return false
                  return rect.left < viewRect.left - 2
                    || rect.top < viewRect.top - 2
                    || rect.right > viewRect.right + 2
                    || rect.bottom > viewRect.bottom + 2
                })
                if (tables.length > 0 && outside.length > 0) {
                  failures.push('Fit leaves ' + outside.length + ' tables outside the plan')
                }
                if (viewport.scrollWidth > viewport.clientWidth + 2 || viewport.scrollHeight > viewport.clientHeight + 2) {
                  failures.push('Fit still shows plan scrollbars')
                }
              }
              const sheetActions = document.querySelector('.mobile-host-reservation-form-actions, .reservation-smart-modal .modal-actions')
              if (sheetActions) {
                const style = getComputedStyle(sheetActions)
                if (style.position !== 'sticky' && style.position !== 'fixed') {
                  failures.push('reservation sheet actions are not sticky')
                }
              }
              return failures
            })()`,
            awaitPromise: true,
            returnByValue: true,
          })
          const followUpFailures = followUp.result?.value
          if (Array.isArray(followUpFailures)) landscapeFailures.push(...followUpFailures)
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
        await applySimulatedSafeArea(send)
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

      const referenceSignature = layoutSignatures.get('852x393')
      if (referenceSignature) {
        for (const [size, signature] of layoutSignatures) {
          if (size === '852x393' || signature === referenceSignature) continue
          failures.push({
            page: page.id,
            size,
            mode: 'landscape',
            failures: [`toolbar structure differs from 852×393 (${signature || 'empty'} vs ${referenceSignature})`],
          })
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

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (invokedDirectly) {
  const report = await runPhoneViewportMatrix({
    screenshotDir: `${process.env.ONE_VIEWPORT_SCREENSHOTS ?? ''}`.trim(),
  })
  if (report.failures.length) {
    for (const failure of report.failures) {
      console.error(`${failure.page} ${failure.size} ${failure.mode}: ${failure.failures.join(', ')}`)
    }
    console.error(`phone viewport matrix failed (${report.failures.length})`)
    process.exit(1)
  }
  console.log('phone viewport matrix passed')
}
