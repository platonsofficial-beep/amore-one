export function FloorPlanLegend({
  items = [],
  variant = 'default',
  className = '',
  ariaLabel = 'Table status legend',
}) {
  if (!items.length) return null

  const isCompact = variant === 'compact'

  return (
    <div
      className={`floor-plan-legend${isCompact ? ' is-compact' : ''}${className ? ` ${className}` : ''}`}
      aria-label={ariaLabel}
      role="list"
    >
      {items.map((item) => (
        <span
          key={item.id}
          className={`${isCompact ? 'floor-plan-legend-chip' : 'floor-plan-legend-item'} tone-${item.tone}`}
          role="listitem"
        >
          <span
            className={isCompact ? 'floor-plan-legend-dot' : 'floor-plan-legend-swatch'}
            aria-hidden="true"
          />
          <span className="floor-plan-legend-label">{item.label}</span>
        </span>
      ))}
    </div>
  )
}
