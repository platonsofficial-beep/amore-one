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

function placeCoach(rect) {
  const margin = 12
  const cardHeight = 220
  const width = Math.min(360, window.innerWidth - margin * 2)
  const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin)
  const below = rect.bottom + margin
  const above = rect.top - cardHeight - margin
  let top = below
  if (below + cardHeight > window.innerHeight - margin && above >= margin) top = above
  if (window.innerHeight < 500) {
    top = rect.bottom + margin + cardHeight < window.innerHeight ? below : Math.max(margin, above)
  }
  return { left, top, width }
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
    if (pin === 'hold' || pin === 'roles') {
      const pinned = steps.find((step) => step.id === (pin === 'roles' ? 'roles' : 'venue')) || steps[0]
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
    if (pin === 'hold' || pin === 'roles') return undefined
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
    let frame = 0
    let tries = 0
    const names = coachTargets(step)
    function measure() {
      let target = null
      for (const name of names) {
        const candidate = document.querySelector(`[data-help="${name}"]`)
        if (!candidate) continue
        const rect = candidate.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1) continue
        target = candidate
        break
      }
      if (!target) {
        if (tries < 20) {
          tries += 1
          frame = window.requestAnimationFrame(measure)
        } else {
          setBox({ missing: true })
        }
        return
      }
      const rect = target.getBoundingClientRect()
      setBox({
        ring: { top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 },
        card: placeCoach(rect),
      })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return function cleanup() {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step, helpOn])

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
  const next = steps.slice(index + 1).find((entry) => !entry.done)
  const cardStyle = box?.card
    ? { top: box.card.top, left: box.card.left, width: box.card.width }
    : { left: 12, right: 12, bottom: 12 }

  return createPortal(
    <>
      {box?.ring ? <div className="setup-guide-coach-ring" style={box.ring} /> : null}
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
          <button
            type="button"
            className="primary-btn"
            onClick={function advance() {
              if (continueLabel) {
                if (onFinish) onFinish()
                else onActive('')
                return
              }
              if (!next) {
                if (onFinish) onFinish()
                else onActive('')
                return
              }
              onActive(next.id)
              window.dispatchEvent(new CustomEvent('one-setup-coach', { detail: next }))
              if (onOpenStep) onOpenStep(next)
            }}
          >
            {t(continueLabel || 'Next')}
          </button>
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
