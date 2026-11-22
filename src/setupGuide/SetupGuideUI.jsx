import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { t } from '../i18n/i18n'
import { useHelpModeEnabled } from '../help/HelpMode'
import { usePublishedFloorPlan } from '../lib/PublishedFloorPlanContext'
import {
  nextDateKey,
  readSetupProgress,
  shouldShowSetupChecklist,
  useSetupCoachStep,
  visibleSetupSteps,
  withSetupDone,
  writeSetupProgress,
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

function SetupCoachMount({ activeId, steps, onActive, onOpenStep }) {
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
    const measure = () => {
      const target = document.querySelector(`[data-help="${step.target}"]`)
        || document.querySelector(`[data-help="${step.fallbackTarget || ''}"]`)
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
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step, helpOn])

  if (!step || helpOn || typeof document === 'undefined') return null

  const next = steps.find((entry) => entry.id !== step.id && !entry.done)
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
          <button type="button" className="ghost-btn" onClick={() => onActive('')}>{t('Skip this step')}</button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              if (!next) {
                onActive('')
                return
              }
              onActive(next.id)
              window.dispatchEvent(new CustomEvent('one-setup-coach', { detail: next }))
              onOpenStep?.(next)
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
