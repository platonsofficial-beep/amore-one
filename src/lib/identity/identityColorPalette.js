/** @typedef {{ id: string, name: string, background: string, ring: string, text: string }} IdentityColor */

export const IDENTITY_NEUTRAL_COLOR = Object.freeze({
  id: 'neutral',
  name: 'Neutral',
  background: 'rgba(255, 255, 255, 0.07)',
  ring: 'rgba(255, 255, 255, 0.16)',
  text: '#c4bcb0',
})

const RAW_IDENTITY_COLOR_PALETTE = [
  { id: 'champagne', name: 'Champagne', background: '#2a2418', ring: '#c9a24d', text: '#f0ddb0' },
  { id: 'rose-gold', name: 'Rose Gold', background: '#2a1f1e', ring: '#c9877a', text: '#f0cfc7' },
  { id: 'amber', name: 'Amber', background: '#2a2214', ring: '#d4a043', text: '#f2ddb0' },
  { id: 'coral', name: 'Coral', background: '#2a1a18', ring: '#d97866', text: '#f5ccc3' },
  { id: 'terracotta', name: 'Terracotta', background: '#291916', ring: '#c86f52', text: '#efc9b8' },
  { id: 'rust', name: 'Rust', background: '#281714', ring: '#b86145', text: '#ebc0ad' },
  { id: 'sage', name: 'Sage', background: '#1c221c', ring: '#7f9a7a', text: '#d2e0ce' },
  { id: 'moss', name: 'Moss', background: '#1a2118', ring: '#6f8f62', text: '#c8dbbf' },
  { id: 'forest', name: 'Forest', background: '#152018', ring: '#4f8060', text: '#b8d4c2' },
  { id: 'emerald', name: 'Emerald', background: '#12201a', ring: '#4a9470', text: '#b8e0cb' },
  { id: 'teal', name: 'Teal', background: '#122022', ring: '#4a9490', text: '#b8dedc' },
  { id: 'cyan', name: 'Cyan', background: '#121f24', ring: '#4f96ab', text: '#b8dce8' },
  { id: 'ocean', name: 'Ocean', background: '#141e28', ring: '#5a8fb8', text: '#c0d9ef' },
  { id: 'slate-blue', name: 'Slate Blue', background: '#181e28', ring: '#7089b0', text: '#ccd8ea' },
  { id: 'indigo', name: 'Indigo', background: '#1a1828', ring: '#7a74b8', text: '#d0cce8' },
  { id: 'violet', name: 'Violet', background: '#1f1828', ring: '#9270b8', text: '#dac8ea' },
  { id: 'plum', name: 'Plum', background: '#241822', ring: '#9a6898', text: '#e0c4de' },
  { id: 'magenta', name: 'Magenta', background: '#281820', ring: '#b06698', text: '#eac4da' },
  { id: 'ruby', name: 'Ruby', background: '#281418', ring: '#b85a72', text: '#eac0ca' },
  { id: 'crimson', name: 'Crimson', background: '#281418', ring: '#a84a5a', text: '#e8b8c0' },
  { id: 'copper', name: 'Copper', background: '#261c14', ring: '#b87848', text: '#ecd0b4' },
  { id: 'bronze', name: 'Bronze', background: '#241c14', ring: '#a87840', text: '#e8ccb0' },
  { id: 'sand', name: 'Sand', background: '#242018', ring: '#b8a070', text: '#ece0c8' },
  { id: 'stone', name: 'Stone', background: '#22201e', ring: '#9a9080', text: '#ddd4c6' },
  { id: 'pearl', name: 'Pearl', background: '#222220', ring: '#b0aaa0', text: '#e8e2d8' },
  { id: 'silver', name: 'Silver', background: '#202022', ring: '#9898a0', text: '#dcdce0' },
  { id: 'pewter', name: 'Pewter', background: '#1e2022', ring: '#808890', text: '#d0d4d8' },
  { id: 'graphite', name: 'Graphite', background: '#1c1e20', ring: '#707880', text: '#c8ccd0' },
  { id: 'midnight', name: 'Midnight', background: '#181a22', ring: '#606880', text: '#c0c6d4' },
  { id: 'obsidian', name: 'Obsidian', background: '#161618', ring: '#585860', text: '#b8b8c0' },
]

/** @type {readonly IdentityColor[]} */
export const IDENTITY_COLOR_PALETTE = Object.freeze(
  RAW_IDENTITY_COLOR_PALETTE.map((entry) => Object.freeze({ ...entry })),
)

const PALETTE_BY_ID = Object.freeze(
  Object.fromEntries(IDENTITY_COLOR_PALETTE.map((entry) => [entry.id, entry])),
)

export function isPaletteColorId(colorId) {
  const normalized = `${colorId ?? ''}`.trim()
  return Boolean(normalized && Object.prototype.hasOwnProperty.call(PALETTE_BY_ID, normalized))
}

/** @returns {IdentityColor | null} */
export function getIdentityColorById(colorId) {
  const normalized = `${colorId ?? ''}`.trim()
  return PALETTE_BY_ID[normalized] ?? null
}
