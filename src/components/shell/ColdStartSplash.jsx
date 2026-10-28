import { useEffect, useState } from 'react'
import './coldStartSplash.css'

const PLAY_MS = 1100
let playedThisLoad = false

export function resetColdStartSplashForTests() {
  playedThisLoad = false
}

function motionReduced() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function ColdStartSplash() {
  const [phase, setPhase] = useState(() => {
    if (playedThisLoad || motionReduced()) return 'gone'
    return 'play'
  })

  useEffect(() => {
    if (phase !== 'play') return undefined
    const timer = window.setTimeout(() => {
      playedThisLoad = true
      setPhase('gone')
    }, PLAY_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  if (phase === 'gone') return null

  const skip = () => {
    playedThisLoad = true
    setPhase('gone')
  }

  return (
    <button
      type="button"
      className="cold-start-splash"
      aria-label="Skip intro"
      data-testid="cold-start-splash"
      onClick={skip}
    >
      <img src="/brand/one-full-logo.svg" alt="" />
    </button>
  )
}
