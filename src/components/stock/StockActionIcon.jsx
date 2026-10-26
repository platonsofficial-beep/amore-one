export function StockActionIcon({ name = 'more' }) {
  const common = {
    className: 'stock-action-icon',
    viewBox: '0 0 16 16',
    'aria-hidden': 'true',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.6',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  }

  if (name === 'plus') {
    return (
      <svg {...common}>
        <path d="M8 3.2v9.6M3.2 8h9.6" />
      </svg>
    )
  }

  if (name === 'bag') {
    return (
      <svg {...common}>
        <path d="M4.2 6.2h7.6l-.7 6.6H4.9z" />
        <path d="M6.1 6.2V4.7a1.9 1.9 0 0 1 3.8 0v1.5" />
      </svg>
    )
  }

  if (name === 'box') {
    return (
      <svg {...common}>
        <path d="M2.6 5.3 8 2.8l5.4 2.5v5.4L8 13.2 2.6 10.7z" />
        <path d="M2.6 5.3 8 7.8l5.4-2.5M8 7.8v5.4" />
      </svg>
    )
  }

  if (name === 'clipboard') {
    return (
      <svg {...common}>
        <rect x="4" y="3.2" width="8" height="10" rx="1.4" />
        <path d="M6.2 3.2h3.6V2.6H6.2zM6.2 7.2h3.6M6.2 9.6h2.4" />
      </svg>
    )
  }

  if (name === 'more') {
    return (
      <svg {...common}>
        <circle cx="3.4" cy="8" r="0.8" fill="currentColor" stroke="none" />
        <circle cx="8" cy="8" r="0.8" fill="currentColor" stroke="none" />
        <circle cx="12.6" cy="8" r="0.8" fill="currentColor" stroke="none" />
      </svg>
    )
  }

  return (
    <svg {...common}>
      <path d="M3 12.5V8.2M8 12.5V3.5M13 12.5V6.2" />
    </svg>
  )
}
