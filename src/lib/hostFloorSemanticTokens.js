/** Shared semantic color tokens for Host Station floor tables and legend. */
export const HOST_FLOOR_SEMANTIC_TOKENS = {
  available: {
    border: 'var(--host-floor-available-border)',
    fill: 'var(--host-floor-available-fill)',
    text: 'var(--host-floor-available-text)',
    dot: 'var(--host-floor-available-dot)',
  },
  reserved: {
    border: 'var(--host-floor-reserved-border)',
    fill: 'var(--host-floor-reserved-fill)',
    text: 'var(--host-floor-reserved-text)',
    dot: 'var(--host-floor-reserved-dot)',
    glow: 'var(--host-floor-reserved-glow)',
  },
  seated: {
    border: 'var(--host-floor-seated-border)',
    fill: 'var(--host-floor-seated-fill)',
    text: 'var(--host-floor-seated-text)',
    dot: 'var(--host-floor-seated-dot)',
    glow: 'var(--host-floor-seated-glow)',
  },
  problem: {
    border: 'var(--host-floor-problem-border)',
    fill: 'var(--host-floor-problem-fill)',
    text: 'var(--host-floor-problem-text)',
    dot: 'var(--host-floor-problem-dot)',
  },
  combined: {
    accent: 'var(--host-floor-combined-accent)',
    dot: 'var(--host-floor-combined-dot)',
  },
}

export const HOST_FLOOR_SEMANTIC_CSS_VARS = {
  '--host-floor-available-border': 'rgba(127, 154, 134, 0.55)',
  '--host-floor-available-fill': 'rgba(8, 8, 9, 0.94)',
  '--host-floor-available-text': 'rgba(196, 224, 202, 0.82)',
  '--host-floor-available-dot': 'rgba(127, 154, 134, 0.72)',

  '--host-floor-reserved-border': 'rgba(255, 224, 150, 0.78)',
  '--host-floor-reserved-fill': 'linear-gradient(180deg, rgba(48, 38, 18, 0.98), rgba(14, 12, 10, 0.98))',
  '--host-floor-reserved-text': 'rgba(240, 215, 138, 0.82)',
  '--host-floor-reserved-dot': 'rgba(255, 214, 120, 0.92)',
  '--host-floor-reserved-glow': 'rgba(212, 175, 55, 0.28)',

  '--host-floor-seated-border': 'rgba(72, 196, 214, 0.92)',
  '--host-floor-seated-fill': 'linear-gradient(180deg, rgba(10, 42, 54, 0.94), rgba(6, 22, 30, 0.98))',
  '--host-floor-seated-text': 'rgba(236, 248, 252, 0.94)',
  '--host-floor-seated-dot': 'rgba(72, 196, 214, 0.92)',
  '--host-floor-seated-glow': 'rgba(56, 164, 186, 0.28)',

  '--host-floor-problem-border': 'rgba(224, 120, 108, 0.88)',
  '--host-floor-problem-fill': 'linear-gradient(180deg, rgba(44, 16, 14, 0.98), rgba(12, 8, 8, 0.98))',
  '--host-floor-problem-text': 'rgba(255, 232, 226, 0.94)',
  '--host-floor-problem-dot': 'rgba(214, 96, 84, 0.92)',

  '--host-floor-combined-accent': 'rgba(167, 139, 212, 0.72)',
  '--host-floor-combined-dot': 'rgba(167, 139, 212, 0.88)',
}

export function resolveHostFloorLegendToneToken(tone) {
  switch (tone) {
    case 'host-available':
      return HOST_FLOOR_SEMANTIC_TOKENS.available.dot
    case 'host-reserved':
      return HOST_FLOOR_SEMANTIC_TOKENS.reserved.dot
    case 'host-seated':
      return HOST_FLOOR_SEMANTIC_TOKENS.seated.dot
    case 'host-problem':
      return HOST_FLOOR_SEMANTIC_TOKENS.problem.dot
    case 'host-combined':
      return HOST_FLOOR_SEMANTIC_TOKENS.combined.dot
    default:
      return null
  }
}
