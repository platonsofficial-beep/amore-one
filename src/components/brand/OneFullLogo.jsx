export const ONE_TAGLINE = 'HOSPITALITY OPERATING SYSTEM'

export function OneFullLogo({ compact = false }) {
  return (
    <div className={`one-full-logo${compact ? ' is-compact' : ''}`}>
      <div className="one-full-logo-art">
        <img src="/brand/one-full-logo.svg" alt="ONE" />
      </div>
      <p className="one-full-logo-tagline">{ONE_TAGLINE}</p>
    </div>
  )
}
