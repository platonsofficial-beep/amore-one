import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import './coldStartSplash.css'

const PLAY_MS = 1500
const REDUCED_MS = 200
const SKIP_FADE_MS = 150
let playedThisLoad = false

export function resetColdStartSplashForTests() {
  playedThisLoad = false
}

function motionReduced() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function blurUnsupported() {
  if (typeof window === 'undefined' || typeof CSS === 'undefined' || !CSS.supports) return false
  return !CSS.supports('filter', 'blur(1px)')
}

function lowPowerDevice() {
  const cores = typeof navigator === 'undefined' ? 8 : Number(navigator.hardwareConcurrency) || 8
  return cores <= 4
}

export function ColdStartSplash() {
  const { isBootstrapping, isLoading, isAuthDisabled } = useAuth()
  const ready = Boolean(isAuthDisabled) || (!isBootstrapping && !isLoading)
  const reduced = motionReduced()
  const [phase, setPhase] = useState(() => {
    if (playedThisLoad) return 'gone'
    if (reduced && ready) return 'gone'
    return 'play'
  })

  useEffect(() => {
    if (phase === 'gone') playedThisLoad = true
  }, [phase])

  useEffect(() => {
    if (phase !== 'play') return undefined
    const cap = reduced ? REDUCED_MS : PLAY_MS
    const started = performance.now()
    let frame = 0
    const tick = () => {
      const elapsed = performance.now() - started
      const animationDone = elapsed >= cap
      if (elapsed >= cap || (animationDone && ready)) {
        setPhase('gone')
        return
      }
      frame = window.requestAnimationFrame(tick)
    }
    const capTimer = window.setTimeout(() => setPhase('gone'), cap)
    frame = window.requestAnimationFrame(tick)
    return () => {
      window.clearTimeout(capTimer)
      window.cancelAnimationFrame(frame)
    }
  }, [phase, ready, reduced])

  useEffect(() => {
    if (phase === 'gone') return undefined
    const skip = () => setPhase('fading')
    window.addEventListener('pointerdown', skip)
    window.addEventListener('keydown', skip)
    return () => {
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('keydown', skip)
    }
  }, [phase])

  useEffect(() => {
    if (phase !== 'fading') return undefined
    const timer = window.setTimeout(() => setPhase('gone'), SKIP_FADE_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  if (phase === 'gone') return null

  const noBlur = blurUnsupported() || lowPowerDevice()

  return (
    <div
      className={`cold-start-splash${reduced ? ' is-reduced' : ''}${noBlur ? ' is-no-blur' : ''}${phase === 'fading' ? ' is-fading' : ''}`}
      role="button"
      tabIndex={0}
      aria-label="Skip intro"
      data-testid="cold-start-splash"
    >
      <div className="cold-start-stage">
        <svg className="cold-start-layer" viewBox="-30 0 660 800" aria-hidden="true">
          <defs>
            <linearGradient id="splash-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#F3D27A" />
              <stop offset=".55" stopColor="#D4AF37" />
              <stop offset="1" stopColor="#A9832A" />
            </linearGradient>
            <linearGradient id="splash-b" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#A9C0D6" />
              <stop offset=".6" stopColor="#6E8DAA" />
              <stop offset="1" stopColor="#46617C" />
            </linearGradient>
            <linearGradient id="splash-z" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#D2BFA4" />
              <stop offset=".6" stopColor="#A68E73" />
              <stop offset="1" stopColor="#7E6A55" />
            </linearGradient>
          </defs>
          <g className="cold-start-tri is-gold">
            <path fill="url(#splash-g)" d="M217.2,222.0 L300.0,104.4 L382.8,222.0 L416.0,222.0 L300.0,20.0 L184.0,222.0 Z" />
          </g>
          <g className="cold-start-tri is-blue">
            <path fill="url(#splash-b)" d="M277.0,490.0 L277.0,271.0 L182.7,271.0 L204.5,240.0 L173.6,240.0 L30.0,490.0 Z" />
          </g>
          <g className="cold-start-tri is-taupe">
            <path fill="url(#splash-z)" d="M426.4,240.0 L395.5,240.0 L417.3,271.0 L323.0,271.0 L323.0,490.0 L570.0,490.0 Z" />
          </g>
        </svg>
        <svg className="cold-start-layer cold-start-word" viewBox="-30 0 660 800" aria-hidden="true">
          <g transform="translate(-25,0)">
            <g fill="none" stroke="#FFFFFF" strokeWidth="16">
              <circle cx="150" cy="640" r="62" />
              <polyline points="268,702 268,578 378,702 378,578" strokeLinejoin="miter" />
            </g>
            <g fill="#FFFFFF">
              <rect x="438" y="578" width="124" height="16" />
              <rect x="452" y="632" width="110" height="16" />
              <rect x="438" y="686" width="124" height="16" />
            </g>
          </g>
        </svg>
        <svg className="cold-start-layer cold-start-tagline" viewBox="-30 0 660 800" aria-hidden="true">
          <text x="300" y="770" textAnchor="middle" fontFamily="Montserrat, Poppins, sans-serif" fontWeight="500" fontSize="24" letterSpacing="6" fill="#D4AF37">
            HOSPITALITY OPERATING SYSTEM
          </text>
        </svg>
        <svg className="cold-start-layer cold-start-shimmer" viewBox="-30 0 660 800" aria-hidden="true">
          <defs>
            <mask id="splash-shimmer-mask">
              <rect x="-30" y="0" width="660" height="800" fill="black" />
              <path fill="white" d="M217.2,222.0 L300.0,104.4 L382.8,222.0 L416.0,222.0 L300.0,20.0 L184.0,222.0 Z" />
              <path fill="white" d="M277.0,490.0 L277.0,271.0 L182.7,271.0 L204.5,240.0 L173.6,240.0 L30.0,490.0 Z" />
              <path fill="white" d="M426.4,240.0 L395.5,240.0 L417.3,271.0 L323.0,271.0 L323.0,490.0 L570.0,490.0 Z" />
              <g transform="translate(-25,0)">
                <circle cx="150" cy="640" r="62" fill="white" />
                <polyline points="268,702 268,578 378,702 378,578" fill="none" stroke="white" strokeWidth="16" />
                <rect x="438" y="578" width="124" height="16" fill="white" />
                <rect x="452" y="632" width="110" height="16" fill="white" />
                <rect x="438" y="686" width="124" height="16" fill="white" />
              </g>
              <text x="300" y="770" textAnchor="middle" fontFamily="Montserrat, Poppins, sans-serif" fontWeight="500" fontSize="24" letterSpacing="6" fill="white">
                HOSPITALITY OPERATING SYSTEM
              </text>
            </mask>
            <linearGradient id="splash-shine" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
              <stop offset="0.5" stopColor="#F3D27A" stopOpacity="0.85" />
              <stop offset="0.65" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect className="cold-start-shimmer-band" x="-180" y="0" width="220" height="800" fill="url(#splash-shine)" mask="url(#splash-shimmer-mask)" />
        </svg>
      </div>
    </div>
  )
}
