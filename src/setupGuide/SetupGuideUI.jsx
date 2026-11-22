import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n/i18n'
import { useHelpModeEnabled } from '../help/HelpMode'
import { usePublishedFloorPlan } from '../lib/PublishedFloorPlanContext'
import {
  nextDateKey,
  readSetupProgress,
  readStaffTourProgress,
  shouldShowSetupChecklist,
  shouldShowStaffTour,
  useSetupCoachStep,
  visibleSetupSteps,
  visibleStaffTourSteps,
  withSetupDone,
  writeSetupProgress,
  writeStaffTourProgress,
} from './setupGuide'
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
  onOpenStep,
}) {
  const floor = usePublishedFloorPlan()
  const [progress, setProgress] = useState(() => readSetupProgress(userId, workspaceId, storage()))
  const steps = withSetupDone(visibleSetupSteps(role), {
    profile,
    positions,
    seatings,
    floor: {
      publishedAt: floor?.publishedAt,
      zones: floor?.layout?.zones,
      tables: floor?.layout?.tables,
    },
  })

  useEffect(() => {
    setProgress(readSetupProgress(userId, workspaceId, storage()))
  }, [userId, workspaceId])

  useEffect(() => {
    const refresh = () => setProgress(readSetupProgress(userId, workspaceId, storage()))
    window.addEventListener('one-setup-progress', refresh)
    return () => window.removeEventListener('one-setup-progress', refresh)
  }, [userId, workspaceId])

  if (!shouldShowSetupChecklist({ steps, progress, todayKey })) return null

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
          onClick={() => save({ skipped: true, remindAfter: '', replay: false })}
        >
          {t('Skip setup')}
        </button>
        <button
          type="button"
          onClick={() => save({ skipped: false, remindAfter: nextDateKey(todayKey), replay: false })}
        >
          {t('Remind me tomorrow')}
        </button>
      </div>
    </section>
  )
}

export function SetupGuideCoachHost({
  role = '',
  profile = null,
  positions = [],
  seatings = [],
  onOpenStep,
}) {
  const floor = usePublishedFloorPlan()
  const [activeId, setActiveId] = useSetupCoachStep()
  const steps = withSetupDone(visibleSetupSteps(role), {
    profile,
    positions,
    seatings,
    floor: {
      publishedAt: floor?.publishedAt,
      zones: floor?.layout?.zones,
      tables: floor?.layout?.tables,
    },
  })

  return (
    <SetupCoachMount activeId={activeId} steps={steps} onActive={setActiveId} onOpenStep={onOpenStep} />
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
            {t('Next')}
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
    if (!shouldShowStaffTour({ steps, progress })) return undefined
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
    />
  )
}

export function replaySetupGuide() {
  window.dispatchEvent(new Event('one-setup-replay'))
}

export function SetupGuideReplayButton() {
  return (
    <button type="button" className="setup-guide-replay" onClick={replaySetupGuide}>
      {t('Replay setup guide')}
    </button>
  )
}
