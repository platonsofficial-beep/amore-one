import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n/i18n'
import { useHelpModeEnabled } from '../help/HelpMode'
import { usePublishedFloorPlan } from '../lib/PublishedFloorPlanContext'
import {
  nextDateKey,
  nextWizardStep,
  readSetupProgress,
  readStaffTourProgress,
  readStockTourProgress,
  shouldShowSetupChecklist,
  shouldShowStaffTour,
  shouldShowStockTour,
  useSetupCoachStep,
  visibleSetupSteps,
  visibleStaffTourSteps,
  visibleStockTourSteps,
  wizardStepNumber,
  withSetupDone,
  writeSetupProgress,
  writeStaffTourProgress,
  writeStockTourProgress,
} from './setupGuide'
import {
  markScreenSeen,
  readTutorial,
  replayTutorial,
  screenGuide,
  setTutorialChoice,
} from './tutorial'
import './SetupGuide.css'

function storage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function bottomNavBox() {
  const nav = document.querySelector('.mobile-bottom-nav')
  if (!nav) return null
  const rect = nav.getBoundingClientRect()
  if (rect.width < 8 || rect.height < 8) return null
  return rect
}

function coachWidth() {
  const landscape = window.innerWidth > window.innerHeight
  const max = landscape ? 420 : 360
  return Math.min(max, window.innerWidth - 24)
}

function coachFloor() {
  const viewHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight
  const nav = bottomNavBox()
  const navTop = nav && nav.top > 0 && nav.top < viewHeight ? nav.top : viewHeight
  return Math.min(navTop, viewHeight) - 8
}

function overlapsBox(a, b) {
  const separatedX = a.right <= b.left || b.right <= a.left
  const separatedY = a.bottom <= b.top || b.bottom <= a.top
  return !separatedX && !separatedY
}

function placeCoach(rect) {
  const margin = 12
  const width = coachWidth()
  const landscape = window.innerWidth > window.innerHeight
  const liveCard = document.querySelector('.setup-guide-coach')
  const liveHeight = liveCard ? Math.ceil(Math.max(liveCard.getBoundingClientRect().height, liveCard.scrollHeight)) : 0
  const cardHeight = Math.max(liveHeight + 8, landscape ? 180 : 280)
  const floor = Math.min(coachFloor(), (window.visualViewport ? window.visualViewport.height : window.innerHeight) - 8)
  const target = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
  const spots = []
  const belowTop = rect.bottom + margin
  const aboveTop = rect.top - cardHeight - margin
  if (landscape) spots.push({ left: window.innerWidth - width - margin, top: Math.max(chromeBottom(), floor - cardHeight) })
  if (belowTop + cardHeight <= floor) spots.push({ left: margin, top: belowTop })
  if (aboveTop >= chromeBottom()) spots.push({ left: margin, top: aboveTop })
  for (let i = 0; i < spots.length; i += 1) {
    const spot = spots[i]
    const maxHeight = floor - spot.top
    if (maxHeight < cardHeight) continue
    const card = { left: spot.left, right: spot.left + width, top: spot.top, bottom: spot.top + cardHeight }
    if (card.bottom > floor) continue
    if (overlapsBox(card, target)) continue
    return { left: spot.left, top: spot.top, width, maxHeight }
  }
  const top = chromeBottom()
  return { left: margin, top, width, maxHeight: Math.max(floor - top, 0) }
}

function dockedCoach() {
  const width = coachWidth()
  const live = document.querySelector('.setup-guide-coach')
  const needed = live ? live.scrollHeight + 8 : 200
  const viewHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight
  const floor = Math.min(coachFloor(), viewHeight - 8)
  const top = Math.max(chromeBottom(), floor - needed)
  return {
    left: window.innerWidth > window.innerHeight ? Math.max(12, window.innerWidth - width - 12) : 12,
    top,
    width,
    maxHeight: floor - top,
  }
}

function clippedCoachFix() {
  const coach = document.querySelector('.setup-guide-coach')
  if (!coach || coach.scrollHeight <= coach.clientHeight + 1) return null
  const rect = coach.getBoundingClientRect()
  const viewHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight
  const floor = Math.min(coachFloor(), viewHeight - 8)
  const needed = coach.scrollHeight + 8
  const top = Math.max(chromeBottom(), floor - needed)
  const maxHeight = Math.min(needed, floor - top)
  if (Math.abs(rect.top - top) < 2 && coach.clientHeight + 1 >= maxHeight) return null
  return { top, maxHeight }
}

function usableCoachTarget(node) {
  if (!node || node.closest('.mobile-bottom-nav, .setup-guide-coach, .venue-wizard-bar')) return false
  const rect = node.getBoundingClientRect()
  if (rect.width < 24 || rect.height < 20) return false
  const nav = bottomNavBox()
  if (nav && overlapsBox(rect, nav)) return false
  const viewHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight
  if (rect.top < chromeBottom() - 2 || rect.bottom > viewHeight - 8) return false
  return true
}

function scrollParent(node) {
  let current = node.parentElement
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current)
    const canScroll = (style.overflowY === 'auto' || style.overflowY === 'scroll') && current.scrollHeight > current.clientHeight + 8
    if (canScroll) return current
    current = current.parentElement
  }
  return document.scrollingElement
}

function chromeBottom() {
  let bottom = 8
  const bar = document.querySelector('.venue-wizard-bar')
  if (bar) {
    const rect = bar.getBoundingClientRect()
    if (rect.bottom > bottom) bottom = rect.bottom
  }
  const nav = document.querySelector('.workspace-nav')
  if (nav) {
    const rect = nav.getBoundingClientRect()
    const horizontalStrip = rect.height > 0 && rect.height < 140 && rect.top < 240 && rect.width > 180
    if (horizontalStrip && rect.bottom > bottom) bottom = rect.bottom
  }
  return bottom + 8
}

function viewportBox(node) {
  const rect = node.getBoundingClientRect()
  const vv = window.visualViewport
  const offsetTop = vv ? vv.offsetTop : 0
  const offsetLeft = vv ? vv.offsetLeft : 0
  return {
    top: rect.top - offsetTop,
    left: rect.left - offsetLeft,
    width: rect.width,
    height: rect.height,
    right: rect.right - offsetLeft,
    bottom: rect.bottom - offsetTop,
  }
}

function revealCoachTarget(node) {
  const scroller = scrollParent(node)
  if (!scroller) return
  const rect = node.getBoundingClientRect()
  const landscape = window.innerWidth > window.innerHeight
  const desired = Math.max(chromeBottom(), landscape ? 8 : 300)
  const nav = bottomNavBox()
  const limit = (nav ? nav.top : (window.visualViewport ? window.visualViewport.height : window.innerHeight)) - 8
  const tooHigh = rect.top < desired - 2
  const tooLow = rect.bottom > limit
  if (!tooHigh && !tooLow) return
  const horizontal = node.closest('.workspace-nav-links')
  if (horizontal && horizontal.scrollWidth > horizontal.clientWidth + 8) {
    const parentRect = horizontal.getBoundingClientRect()
    horizontal.scrollLeft += rect.left - parentRect.left - 8
  }
  scroller.scrollTop += rect.top - desired
}

export function SetupGuideTodaySlot({
  role = '',
  userId = '',
  workspaceId = '',
  todayKey = '',
  profile = null,
  positions = [],
  seatings = [],
  employees = [],
  shifts = [],
  suppliers = [],
  stockItems = [],
  tasks = [],
  checklists = [],
  announcements = [],
  onOpenStep,
  tutorialOn = false,
}) {
  const floor = usePublishedFloorPlan()
  const [progress, setProgress] = useState(() => readSetupProgress(userId, workspaceId, storage()))
  const steps = withSetupDone(visibleSetupSteps(role), wizardFacts(profile, positions, seatings, floor, {
    employees, shifts, suppliers, stockItems, tasks, checklists, announcements,
  }))

  useEffect(() => {
    setProgress(readSetupProgress(userId, workspaceId, storage()))
  }, [userId, workspaceId])

  useEffect(() => {
    const refresh = () => setProgress(readSetupProgress(userId, workspaceId, storage()))
    window.addEventListener('one-setup-progress', refresh)
    return () => window.removeEventListener('one-setup-progress', refresh)
  }, [userId, workspaceId])

  if (!tutorialOn || !shouldShowSetupChecklist({ steps, progress, todayKey })) return null

  const doneCount = steps.filter((step) => step.done).length
  const save = (next) => {
    const stored = writeSetupProgress(userId, workspaceId, next, storage())
    setProgress(stored)
    window.dispatchEvent(new Event('one-setup-progress'))
  }

  return (
    <section className="setup-guide-card" aria-label={t('Set up your venue')}>
      <div className="setup-guide-card-heading">
        <div>
          <h2>{t('Set up your venue')}</h2>
          <p>{doneCount === steps.length
            ? t('You are ready. Finished steps stay ticked.')
            : t('Walk through the venue one page at a time.')}
          </p>
        </div>
        <strong className="setup-guide-count">{t('Setup progress {{done}} of {{total}}', { done: doneCount, total: steps.length })}</strong>
      </div>
      {steps.map((step) => (
        <button
          key={step.id}
          type="button"
          className={`setup-guide-step${step.done ? ' is-done' : ''}`}
          onClick={() => {
            window.dispatchEvent(new CustomEvent('one-setup-coach', { detail: step }))
            onOpenStep?.(step)
          }}
        >
          <span aria-hidden="true">{step.done ? '✓' : '○'}</span>
          <span>{t(step.titleKey)}</span>
        </button>
      ))}
      <div className="setup-guide-actions">
        <button
          type="button"
          onClick={() => {
            save({
              skipped: false,
              remindAfter: '',
              replay: false,
              walking: true,
              paused: false,
              skippedStepIds: progress.skippedStepIds || [],
            })
            const next = steps.find((step) => !step.done) || steps[0]
            if (!next) return
            window.dispatchEvent(new CustomEvent('one-setup-coach', { detail: next }))
            onOpenStep?.(next)
          }}
        >
          {t('Continue setup')}
        </button>
        <button
          type="button"
          onClick={() => save({
            skipped: false,
            remindAfter: '',
            replay: true,
            walking: true,
            paused: false,
            skippedStepIds: [],
          })}
        >
          {t('Replay setup')}
        </button>
        <button
          type="button"
          onClick={() => save({ skipped: true, remindAfter: '', replay: false, walking: false, paused: true })}
        >
          {t('Skip setup')}
        </button>
        <button
          type="button"
          onClick={() => save({
            skipped: false,
            remindAfter: nextDateKey(todayKey),
            replay: false,
            walking: false,
            paused: true,
          })}
        >
          {t('Remind me tomorrow')}
        </button>
      </div>
    </section>
  )
}

function wizardFacts(profile, positions, seatings, floor, extra) {
  return {
    profile,
    positions,
    seatings,
    employees: extra.employees,
    shifts: extra.shifts,
    suppliers: extra.suppliers,
    stockItems: extra.stockItems,
    tasks: extra.tasks,
    checklists: extra.checklists,
    announcements: extra.announcements,
    floor: {
      publishedAt: floor?.publishedAt,
      zones: floor?.layout?.zones,
      tables: floor?.layout?.tables,
    },
  }
}

function readWizardPin() {
  if (typeof window === 'undefined') return ''
  if (import.meta.env.VITE_AUTH_DISABLED !== 'true') return ''
  return `${new URLSearchParams(window.location.search).get('setupWizard') ?? ''}`.trim()
}

export function SetupGuideCoachHost({
  role = '',
  userId = '',
  workspaceId = '',
  profile = null,
  positions = [],
  seatings = [],
  employees = [],
  shifts = [],
  suppliers = [],
  stockItems = [],
  tasks = [],
  checklists = [],
  announcements = [],
  tutorialOn = false,
  nameReady = true,
  onOpenStep,
  onContinueLater,
}) {
  const floor = usePublishedFloorPlan()
  const [activeId, setActiveId] = useSetupCoachStep()
  const [progress, setProgress] = useState(() => readSetupProgress(userId, workspaceId, storage()))
  const steps = withSetupDone(visibleSetupSteps(role), wizardFacts(profile, positions, seatings, floor, {
    employees, shifts, suppliers, stockItems, tasks, checklists, announcements,
  }))
  const openRef = useRef(onOpenStep)
  openRef.current = onOpenStep
  const startedRef = useRef('')

  useEffect(() => {
    setProgress(readSetupProgress(userId, workspaceId, storage()))
  }, [userId, workspaceId])

  useEffect(() => {
    const refresh = () => setProgress(readSetupProgress(userId, workspaceId, storage()))
    window.addEventListener('one-setup-progress', refresh)
    return () => window.removeEventListener('one-setup-progress', refresh)
  }, [userId, workspaceId])

  const save = (next) => {
    const stored = writeSetupProgress(userId, workspaceId, { ...progress, ...next }, storage())
    setProgress(stored)
    window.dispatchEvent(new Event('one-setup-progress'))
    return stored
  }

  useEffect(() => {
    if (!tutorialOn || !nameReady || !steps.length) return undefined
    const pin = readWizardPin()
    if (pin) {
      const pinnedId = pin === 'hold' ? 'venue' : pin
      const pinned = steps.find((step) => step.id === pinnedId) || steps[0]
      if (pinned && startedRef.current !== `pin:${pinned.id}`) {
        startedRef.current = `pin:${pinned.id}`
        setActiveId(pinned.id)
        openRef.current?.(pinned)
      }
      return undefined
    }
    if (progress.skipped && !progress.replay) return undefined
    if (progress.remindAfter && !progress.replay && !progress.walking) return undefined
    if (progress.paused && !progress.replay && !progress.walking) return undefined
    const shouldWalk = progress.walking || progress.replay || (!progress.paused && !progress.skipped)
    if (!shouldWalk) return undefined
    if (startedRef.current === 'walk' && !progress.replay) return undefined
    const first = nextWizardStep(steps, '', progress.skippedStepIds)
    if (!first) return undefined
    startedRef.current = 'walk'
    if (!progress.walking || progress.replay) {
      save({
        skipped: false,
        paused: false,
        walking: true,
        replay: false,
        remindAfter: '',
        skippedStepIds: progress.replay ? [] : progress.skippedStepIds,
      })
    }
    setActiveId(first.id)
    openRef.current?.(first)
    return undefined
  }, [tutorialOn, nameReady, steps, progress, userId, workspaceId])

  useEffect(() => {
    const pin = readWizardPin()
    if (pin) return undefined
    if (!activeId) return undefined
    const current = steps.find((step) => step.id === activeId)
    if (!current?.done) return undefined
    const next = nextWizardStep(steps, activeId, progress.skippedStepIds)
    if (!next) {
      setActiveId('')
      save({ walking: false, paused: false, replay: false })
      return undefined
    }
    setActiveId(next.id)
    openRef.current?.(next)
    return undefined
  }, [activeId, steps, progress.skippedStepIds])

  const index = wizardStepNumber(steps, activeId)

  return (
    <>
      {activeId && index ? (
        <VenueWizardBar step={index} total={steps.length} />
      ) : null}
      <SetupCoachMount
        activeId={activeId}
        steps={steps}
        onActive={setActiveId}
        onOpenStep={onOpenStep}
        tourId="setup"
        dismissLabel="Skip"
        continueLabel="Continue later"
        onDismiss={() => {
          const skippedStepIds = [...new Set([...(progress.skippedStepIds || []), activeId].filter(Boolean))]
          const next = nextWizardStep(steps, activeId, skippedStepIds)
          save({ skippedStepIds, walking: Boolean(next), paused: !next, replay: false })
          if (!next) {
            setActiveId('')
            onContinueLater?.()
            return
          }
          setActiveId(next.id)
          onOpenStep?.(next)
        }}
        onFinish={() => {
          save({ walking: false, paused: true, replay: false })
          setActiveId('')
          onContinueLater?.()
        }}
      />
    </>
  )
}

function VenueWizardBar({ step, total }) {
  const [top, setTop] = useState(0)
  useEffect(() => {
    const banner = document.querySelector('.subscription-banner')
    const height = banner ? Math.round(banner.getBoundingClientRect().height) : 0
    setTop(height)
  }, [])
  return createPortal(
    <div className="venue-wizard-bar" role="status" style={{ top }}>
      <span>{t('Step {{step}} of {{total}}', { step, total })}</span>
      <span className="venue-wizard-track" aria-hidden="true">
        <span style={{ width: `${Math.round((step / total) * 100)}%` }} />
      </span>
    </div>,
    document.body,
  )
}

function coachTargets(step) {
  if (Array.isArray(step.targets) && step.targets.length) return step.targets
  return [step.target, step.fallbackTarget].filter(Boolean)
}

function SetupCoachMount({
  activeId,
  steps,
  onActive,
  onOpenStep,
  onDismiss,
  onFinish,
  dismissLabel = 'Skip this step',
  continueLabel = '',
  tourId = '',
}) {
  const helpOn = useHelpModeEnabled()
  const [box, setBox] = useState(null)
  const step = steps.find((entry) => entry.id === activeId) ?? null

  useEffect(() => {
    if (!step || helpOn) {
      setBox(null)
      return undefined
    }
    const stepId = step.id
    setBox(null)
    const names = coachTargets(step)
    function collect() {
      const nodes = []
      for (let i = 0; i < names.length; i += 1) {
        const found = document.querySelectorAll(`[data-help="${names[i]}"]`)
        for (let n = 0; n < found.length; n += 1) nodes.push(found[n])
      }
      return nodes
    }
    function measure() {
      const nodes = collect()
      const raw = nodes.find(function outsideNav(node) {
        return !node.closest('.mobile-bottom-nav')
      })
      if (!raw) {
        setBox({ stepId, missing: true, card: dockedCoach() })
        return
      }
      if (!usableCoachTarget(raw)) {
        revealCoachTarget(raw)
        setBox(function clearStale(current) {
          const card = current && current.stepId === stepId ? current.card : dockedCoach()
          return { stepId, missing: true, card: card || dockedCoach() }
        })
        return
      }
      const rect = viewportBox(raw)
      const nav = bottomNavBox()
      if (nav && overlapsBox(rect, nav)) {
        revealCoachTarget(raw)
        return
      }
      const card = placeCoach(rect)
      const fix = clippedCoachFix()
      if (fix) {
        card.top = fix.top
        card.maxHeight = fix.maxHeight
      }
      setBox({
        stepId,
        ring: { top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 },
        card,
      })
    }
    measure()
    const timer = window.setInterval(measure, 200)
    const stop = window.setTimeout(function stopLooking() {
      window.clearInterval(timer)
    }, 5000)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    window.visualViewport?.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('scroll', measure)
    return function cleanup() {
      window.clearInterval(timer)
      window.clearTimeout(stop)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
      window.visualViewport?.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('scroll', measure)
    }
  }, [step, helpOn, step?.id, step?.target, step?.fallbackTarget])

  useEffect(function markTour() {
    if (!tourId || typeof document === 'undefined') return undefined
    if (!step || helpOn) {
      if (document.body.dataset.oneActiveTour === tourId) {
        delete document.body.dataset.oneActiveTour
        window.dispatchEvent(new Event('one-tour-idle'))
      }
      return undefined
    }
    document.body.dataset.oneActiveTour = tourId
    window.dispatchEvent(new Event('one-tour-active'))
    return function cleanup() {
      if (document.body.dataset.oneActiveTour === tourId) delete document.body.dataset.oneActiveTour
      window.dispatchEvent(new Event('one-tour-idle'))
    }
  }, [step, helpOn, tourId])

  if (!step || helpOn || typeof document === 'undefined') return null

  const index = steps.findIndex((entry) => entry.id === step.id)
  const next = steps[index + 1] || null
  const live = box && box.stepId === step.id ? box : null
  const card = live?.card || dockedCoach()
  const cardStyle = {
    top: card.top,
    left: card.left,
    width: card.width,
    maxHeight: card.maxHeight,
  }
  function goNext() {
    if (!next) {
      if (onFinish) onFinish()
      else onActive('')
      return
    }
    onActive(next.id)
    window.dispatchEvent(new CustomEvent('one-setup-coach', { detail: next }))
    if (onOpenStep) onOpenStep(next)
  }

  return createPortal(
    <>
      {live?.ring ? <div className="setup-guide-coach-ring" style={live.ring} /> : null}
      <section className="setup-guide-coach" style={cardStyle} role="dialog" aria-label={t(step.titleKey)}>
        <h2>{t(step.titleKey)}</h2>
        <p>{t(step.bodyKey)}</p>
        <div className="setup-guide-coach-actions">
          <button
            type="button"
            className="ghost-btn"
            onClick={function skipStep() {
              if (onDismiss) onDismiss()
              else onActive('')
            }}
          >
            {t(dismissLabel)}
          </button>
          {continueLabel ? (
            <button
              type="button"
              className="ghost-btn"
              onClick={function later() {
                if (onFinish) onFinish()
                else onActive('')
              }}
            >
              {t(continueLabel)}
            </button>
          ) : null}
          {step.done || !continueLabel ? (
            <button type="button" className="primary-btn" onClick={goNext}>
              {t('Next')}
            </button>
          ) : null}
        </div>
      </section>
    </>,
    document.body,
  )
}

export function StaffTourHost({
  role = '',
  userId = '',
  workspaceId = '',
  mobile = false,
  onOpenStep,
}) {
  const steps = visibleStaffTourSteps(role, { mobile })
  const [progress, setProgress] = useState(function initialProgress() {
    return readStaffTourProgress(userId, workspaceId, storage())
  })
  if (progress.replay && typeof document !== 'undefined') {
    document.body.dataset.oneActiveTour = 'staff'
  }
  const [activeId, setActiveId] = useState('')
  const startedRef = useRef(false)
  const openRef = useRef(onOpenStep)
  openRef.current = onOpenStep

  useEffect(function loadProgress() {
    setProgress(readStaffTourProgress(userId, workspaceId, storage()))
  }, [userId, workspaceId])

  useEffect(function listenForReplay() {
    function refresh() {
      setProgress(readStaffTourProgress(userId, workspaceId, storage()))
    }
    window.addEventListener('one-staff-tour-progress', refresh)
    return function cleanup() {
      window.removeEventListener('one-staff-tour-progress', refresh)
    }
  }, [userId, workspaceId])

  useEffect(function autostart() {
    if (!progress.replay || !shouldShowStaffTour({ steps, progress })) return undefined
    if (startedRef.current && !progress.replay) return undefined
    startedRef.current = true
    const first = steps[0]
    if (!first) return undefined
    setActiveId(first.id)
    if (openRef.current) openRef.current(first)
    if (progress.replay) {
      setProgress(writeStaffTourProgress(userId, workspaceId, {
        skipped: false,
        replay: false,
        finished: false,
      }, storage()))
    }
    return undefined
  }, [steps, progress, userId, workspaceId])

  function persist(next) {
    const stored = writeStaffTourProgress(userId, workspaceId, next, storage())
    setProgress(stored)
    window.dispatchEvent(new Event('one-staff-tour-progress'))
  }

  return (
    <SetupCoachMount
      activeId={activeId}
      steps={steps}
      onActive={setActiveId}
      onOpenStep={onOpenStep}
      dismissLabel="Skip the tour"
      onDismiss={function skipTour() {
        startedRef.current = true
        persist({ skipped: true, replay: false, finished: false })
        setActiveId('')
      }}
      onFinish={function finishTour() {
        startedRef.current = true
        persist({ skipped: false, replay: false, finished: true })
        setActiveId('')
      }}
      tourId="staff"
    />
  )
}

export function StockTourHost({
  role = '',
  userId = '',
  workspaceId = '',
  activeView = '',
  onOpenStep,
}) {
  const steps = visibleStockTourSteps(role)
  const [progress, setProgress] = useState(function initialProgress() {
    return readStockTourProgress(userId, workspaceId, storage())
  })
  const [activeId, setActiveId] = useState('')
  const [idleTick, setIdleTick] = useState(0)
  const startedRef = useRef(false)
  const openRef = useRef(onOpenStep)
  openRef.current = onOpenStep
  if (progress.replay && typeof document !== 'undefined') {
    document.body.dataset.oneActiveTour = 'stock'
  }

  useEffect(function loadProgress() {
    setProgress(readStockTourProgress(userId, workspaceId, storage()))
  }, [userId, workspaceId])

  useEffect(function listenForReplay() {
    function refresh() {
      setProgress(readStockTourProgress(userId, workspaceId, storage()))
    }
    function bump() {
      setIdleTick((value) => value + 1)
    }
    window.addEventListener('one-stock-tour-progress', refresh)
    window.addEventListener('one-tour-idle', bump)
    return function cleanup() {
      window.removeEventListener('one-stock-tour-progress', refresh)
      window.removeEventListener('one-tour-idle', bump)
    }
  }, [userId, workspaceId])

  useEffect(function autostart() {
    const otherTour = typeof document !== 'undefined' && document.body.dataset.oneActiveTour && document.body.dataset.oneActiveTour !== 'stock'
    const onStock = activeView === 'stock' || progress.replay
    if (!progress.replay || !onStock || otherTour || !shouldShowStockTour({ steps, progress })) return undefined
    if (startedRef.current && !progress.replay) return undefined
    startedRef.current = true
    const first = steps[0]
    if (!first) return undefined
    setActiveId(first.id)
    if (openRef.current) openRef.current(first)
    if (progress.replay) {
      setProgress(writeStockTourProgress(userId, workspaceId, {
        skipped: false,
        replay: false,
        finished: false,
      }, storage()))
    }
    return undefined
  }, [steps, progress, userId, workspaceId, activeView, idleTick])

  function persist(next) {
    const stored = writeStockTourProgress(userId, workspaceId, next, storage())
    setProgress(stored)
    window.dispatchEvent(new Event('one-stock-tour-progress'))
  }

  return (
    <SetupCoachMount
      activeId={activeId}
      steps={steps}
      onActive={setActiveId}
      onOpenStep={onOpenStep}
      dismissLabel="Skip the tour"
      onDismiss={function skipTour() {
        startedRef.current = true
        persist({ skipped: true, replay: false, finished: false })
        setActiveId('')
      }}
      onFinish={function finishTour() {
        startedRef.current = true
        persist({ skipped: false, replay: false, finished: true })
        setActiveId('')
      }}
      tourId="stock"
    />
  )
}

export function replaySetupGuide() {
  window.dispatchEvent(new Event('one-setup-replay'))
}

export function replayStockTour() {
  window.dispatchEvent(new Event('one-stock-tour-replay'))
}

export function SetupGuideReplayButton() {
  return (
    <button type="button" className="setup-guide-replay" onClick={replaySetupGuide}>
      {t('Replay setup guide')}
    </button>
  )
}

function publishTutorial(userId, workspaceId, next) {
  window.dispatchEvent(new CustomEvent('one-tutorial-progress', { detail: next }))
  return next
}

export function TutorialOptIn({ userId = '', workspaceId = '' }) {
  const [progress, setProgress] = useState(function initial() {
    return readTutorial(userId, workspaceId, storage())
  })

  useEffect(function load() {
    setProgress(readTutorial(userId, workspaceId, storage()))
  }, [userId, workspaceId])

  useEffect(function listen() {
    function refresh() {
      setProgress(readTutorial(userId, workspaceId, storage()))
    }
    window.addEventListener('one-tutorial-progress', refresh)
    return function cleanup() {
      window.removeEventListener('one-tutorial-progress', refresh)
    }
  }, [userId, workspaceId])

  if (progress.choice || typeof document === 'undefined') return null

  function choose(choice) {
    const next = setTutorialChoice(userId, workspaceId, choice, storage())
    setProgress(next)
    publishTutorial(userId, workspaceId, next)
  }

  return createPortal(
    <div className="tutorial-optin-scrim">
      <section className="tutorial-optin" role="dialog" aria-modal="true" aria-labelledby="tutorial-optin-title">
        <h2 id="tutorial-optin-title">{t('Want a short guide?')}</h2>
        <p>{t('The first time you open a screen, ONE explains what it does and how to use it. You can change this later in Settings or from your name menu.')}</p>
        <div className="tutorial-optin-actions">
          <button type="button" className="ghost-btn" onClick={function no() { choose('no') }}>{t('No')}</button>
          <button type="button" className="primary-btn" onClick={function yes() { choose('yes') }}>{t('Yes')}</button>
        </div>
      </section>
    </div>,
    document.body,
  )
}

export function ScreenGuideHost({
  role = '',
  userId = '',
  workspaceId = '',
  screenId = '',
}) {
  const guide = screenGuide(role, screenId)
  const [progress, setProgress] = useState(function initial() {
    return readTutorial(userId, workspaceId, storage())
  })
  const [activeId, setActiveId] = useState('')

  useEffect(function load() {
    setProgress(readTutorial(userId, workspaceId, storage()))
  }, [userId, workspaceId])

  useEffect(function listen() {
    function refresh() {
      setProgress(readTutorial(userId, workspaceId, storage()))
    }
    window.addEventListener('one-tutorial-progress', refresh)
    return function cleanup() {
      window.removeEventListener('one-tutorial-progress', refresh)
    }
  }, [userId, workspaceId])

  const seen = Boolean(screenId && progress.seen[screenId])
  useEffect(function yieldToVenueWizard() {
    function sync() {
      const otherTour = document.body.dataset.oneActiveTour && document.body.dataset.oneActiveTour !== 'screen'
      if (otherTour) setActiveId('')
    }
    window.addEventListener('one-tour-active', sync)
    window.addEventListener('one-setup-coach', sync)
    return function cleanup() {
      window.removeEventListener('one-tour-active', sync)
      window.removeEventListener('one-setup-coach', sync)
    }
  }, [])

  useEffect(function openScreen() {
    const otherTour = typeof document !== 'undefined'
      && document.body.dataset.oneActiveTour
      && document.body.dataset.oneActiveTour !== 'screen'
    const nextGuide = screenGuide(role, screenId)
    if (progress.choice !== 'yes' || !nextGuide || seen || otherTour) {
      setActiveId('')
      return undefined
    }
    setActiveId(function keep(current) {
      if (current && nextGuide.steps.some(function match(entry) { return entry.id === current })) return current
      return nextGuide.steps[0]?.id || ''
    })
    return undefined
  }, [progress.choice, seen, screenId, role])

  function remember() {
    const next = markScreenSeen(userId, workspaceId, screenId, storage())
    setProgress(next)
    setActiveId('')
    publishTutorial(userId, workspaceId, next)
  }

  if (!guide) return null

  return (
    <SetupCoachMount
      activeId={activeId}
      steps={guide.steps}
      onActive={setActiveId}
      dismissLabel="Skip this screen"
      onDismiss={remember}
      onFinish={remember}
      tourId="screen"
    />
  )
}

export function TutorialSettings({ userId = '', workspaceId = '' }) {
  const [progress, setProgress] = useState(function initial() {
    return readTutorial(userId, workspaceId, storage())
  })

  useEffect(function load() {
    setProgress(readTutorial(userId, workspaceId, storage()))
  }, [userId, workspaceId])

  useEffect(function listen() {
    function refresh() {
      setProgress(readTutorial(userId, workspaceId, storage()))
    }
    window.addEventListener('one-tutorial-progress', refresh)
    return function cleanup() {
      window.removeEventListener('one-tutorial-progress', refresh)
    }
  }, [userId, workspaceId])

  function choose(choice) {
    const next = setTutorialChoice(userId, workspaceId, choice, storage())
    setProgress(next)
    publishTutorial(userId, workspaceId, next)
  }

  function replay() {
    const next = replayTutorial(userId, workspaceId, storage())
    setProgress(next)
    publishTutorial(userId, workspaceId, next)
  }

  return (
    <div className="tutorial-settings" data-help="tutorial.settings">
      <h3>{t('Tutorial')}</h3>
      <p>{t('Show a guide the first time you open each screen.')}</p>
      <div className="tutorial-optin-actions">
        <button type="button" className={progress.choice === 'yes' ? 'primary-btn' : 'ghost-btn'} aria-pressed={progress.choice === 'yes'} onClick={function yes() { choose('yes') }}>{t('Yes')}</button>
        <button type="button" className={progress.choice === 'no' ? 'primary-btn' : 'ghost-btn'} aria-pressed={progress.choice === 'no'} onClick={function no() { choose('no') }}>{t('No')}</button>
      </div>
      <button type="button" className="setup-guide-replay" onClick={replay}>{t('Replay guides')}</button>
    </div>
  )
}
