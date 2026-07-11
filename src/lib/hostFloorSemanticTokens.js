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
    glow: 'var(--host-floor-problem-glow)',
  },
  combined: {
    accent: 'var(--host-floor-combined-accent)',
    dot: 'var(--host-floor-combined-dot)',
  },
}

export const HOST_FLOOR_SEMANTIC_CSS_VARS = {
  '--host-floor-available-border': 'rgba(108, 138, 116, 0.42)',
  '--host-floor-available-fill': 'rgba(8, 8, 9, 0.96)',
  '--host-floor-available-text': 'rgba(188, 210, 192, 0.88)',
  '--host-floor-available-dot': 'rgba(108, 138, 116, 0.72)',

  '--host-floor-reserved-border': 'rgba(232, 196, 110, 0.92)',
  '--host-floor-reserved-fill': 'linear-gradient(180deg, rgba(42, 34, 16, 0.98), rgba(12, 10, 8, 0.98))',
  '--host-floor-reserved-text': 'rgba(244, 224, 168, 0.9)',
  '--host-floor-reserved-dot': 'rgba(232, 196, 110, 0.94)',
  '--host-floor-reserved-glow': 'rgba(212, 175, 55, 0.27)',

  '--host-floor-seated-border': 'rgba(48, 168, 196, 0.88)',
  '--host-floor-seated-fill': 'linear-gradient(180deg, rgba(10, 38, 50, 0.96), rgba(6, 20, 28, 0.98))',
  '--host-floor-seated-text': 'rgba(224, 244, 252, 0.94)',
  '--host-floor-seated-dot': 'rgba(48, 168, 196, 0.92)',
  '--host-floor-seated-glow': 'rgba(42, 156, 182, 0.18)',

  '--host-floor-problem-border': 'rgba(214, 96, 84, 0.92)',
  '--host-floor-problem-fill': 'linear-gradient(180deg, rgba(40, 14, 12, 0.98), rgba(10, 6, 6, 0.98))',
  '--host-floor-problem-text': 'rgba(255, 228, 222, 0.94)',
  '--host-floor-problem-dot': 'rgba(214, 96, 84, 0.92)',
  '--host-floor-problem-glow': 'rgba(176, 74, 52, 0.16)',

  '--host-floor-combined-accent': 'rgba(148, 124, 196, 0.38)',
  '--host-floor-combined-dot': 'rgba(148, 124, 196, 0.62)',
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
