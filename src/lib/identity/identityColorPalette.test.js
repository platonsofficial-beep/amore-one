// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  IDENTITY_COLOR_PALETTE,
  IDENTITY_NEUTRAL_COLOR,
  getIdentityColorById,
  isPaletteColorId,
} from './identityColorPalette'

const ORIGINAL_30_PALETTE = [
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

const NEW_18_IDS = [
  'honey',
  'apricot',
  'berry',
  'wine',
  'orchid',
  'lavender',
  'periwinkle',
  'sapphire',
  'glacier',
  'jade',
  'mint',
  'olive',
  'fern',
  'chestnut',
  'cocoa',
  'ash',
  'ember',
  'dusk',
]

const ID_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const COLOR_VALUE_FORMAT = /^(#[0-9a-f]{6}|rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(?:0(?:\.\d+)?|1(?:\.0+)?)\s*\))$/i
const SEMANTIC_NAME_PATTERN = /\b(success|warning|danger|available|unavailable|overtime|error)\b/i

function parseHexColor(value) {
  const match = `${value ?? ''}`.trim().match(/^#([0-9a-f]{6})$/i)
  if (!match) return null

  return {
    r: parseInt(match[1].slice(0, 2), 16),
    g: parseInt(match[1].slice(2, 4), 16),
    b: parseInt(match[1].slice(4, 6), 16),
  }
}

function relativeLuminance({ r, g, b }) {
  const channel = (value) => {
    const normalized = value / 255
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4
  }

  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(foreground, background)
  const darker = Math.min(foreground, background)
  return (lighter + 0.05) / (darker + 0.05)
}

function validateIdentityColorPalette(palette = IDENTITY_COLOR_PALETTE, neutral = IDENTITY_NEUTRAL_COLOR) {
  const errors = []

  if (palette.length !== 48) {
    errors.push(`Expected 48 selectable colors, received ${palette.length}.`)
  }

  const ids = palette.map((entry) => entry.id)
  const names = palette.map((entry) => entry.name)

  if (new Set(ids).size !== ids.length) {
    errors.push('Palette IDs must be unique.')
  }

  if (new Set(names).size !== names.length) {
    errors.push('Palette names must be unique.')
  }

  if (ids.includes(neutral.id)) {
    errors.push('Neutral fallback must not appear in selectable palette.')
  }

  if (!neutral.id || !neutral.background || !neutral.ring || !neutral.text) {
    errors.push('Neutral fallback must include id, background, ring, and text.')
  }

  ORIGINAL_30_PALETTE.forEach((expected, index) => {
    const current = palette[index]
    if (!current) {
      errors.push(`Missing original palette entry at index ${index}: ${expected.id}`)
      return
    }

    ;(['id', 'name', 'background', 'ring', 'text']).forEach((field) => {
      if (current[field] !== expected[field]) {
        errors.push(`Original entry "${expected.id}" field "${field}" changed.`)
      }
    })
  })

  palette.forEach((entry) => {
    ;(['id', 'name', 'background', 'ring', 'text']).forEach((field) => {
      if (!`${entry[field] ?? ''}`.trim()) {
        errors.push(`Palette entry "${entry.id}" is missing ${field}.`)
      }
    })

    if (!ID_FORMAT.test(entry.id)) {
      errors.push(`Palette entry "${entry.id}" has an invalid ID format.`)
    }

    if (SEMANTIC_NAME_PATTERN.test(entry.name) || SEMANTIC_NAME_PATTERN.test(entry.id)) {
      errors.push(`Palette entry "${entry.id}" uses semantic naming.`)
    }

    ;(['background', 'ring', 'text']).forEach((field) => {
      if (!COLOR_VALUE_FORMAT.test(entry[field])) {
        errors.push(`Palette entry "${entry.id}" field "${field}" has unsupported color format.`)
      }
    })

    if (entry.ring === entry.background) {
      errors.push(`Palette entry "${entry.id}" ring matches background.`)
    }

    if (entry.text === entry.background) {
      errors.push(`Palette entry "${entry.id}" text matches background.`)
    }

    if (`${entry.ring}`.includes('transparent')) {
      errors.push(`Palette entry "${entry.id}" ring must not be transparent.`)
    }

    const backgroundRgb = parseHexColor(entry.background)
    const ringRgb = parseHexColor(entry.ring)
    const textRgb = parseHexColor(entry.text)

    if (backgroundRgb && ringRgb) {
      const ringContrast = contrastRatio(relativeLuminance(ringRgb), relativeLuminance(backgroundRgb))
      if (ringContrast < 1.8) {
        errors.push(`Palette entry "${entry.id}" ring lacks contrast against background (${ringContrast.toFixed(2)}).`)
      }
    }

    if (backgroundRgb && textRgb) {
      const textContrast = contrastRatio(relativeLuminance(textRgb), relativeLuminance(backgroundRgb))
      if (textContrast < 3) {
        errors.push(`Palette entry "${entry.id}" text lacks contrast against background (${textContrast.toFixed(2)}).`)
      }
    }
  })

  return {
    valid: errors.length === 0,
    errors,
  }
}

describe('identityColorPalette integrity', () => {
  it('contains exactly 48 selectable colors with neutral kept separate', () => {
    expect(IDENTITY_COLOR_PALETTE).toHaveLength(48)
    expect(IDENTITY_NEUTRAL_COLOR.id).toBe('neutral')
    expect(IDENTITY_COLOR_PALETTE.some((entry) => entry.id === 'neutral')).toBe(false)
  })

  it('preserves the original 30 entries in order and unchanged', () => {
    ORIGINAL_30_PALETTE.forEach((expected, index) => {
      expect(IDENTITY_COLOR_PALETTE[index]).toEqual(expected)
    })
  })

  it('adds exactly 18 new stable palette IDs', () => {
    const paletteIds = IDENTITY_COLOR_PALETTE.map((entry) => entry.id)
    expect(NEW_18_IDS).toHaveLength(18)
    NEW_18_IDS.forEach((id, index) => {
      expect(paletteIds[30 + index]).toBe(id)
      expect(isPaletteColorId(id)).toBe(true)
    })
  })

  it('freezes the palette, entries, and neutral fallback', () => {
    expect(Object.isFrozen(IDENTITY_COLOR_PALETTE)).toBe(true)
    expect(Object.isFrozen(IDENTITY_COLOR_PALETTE[0])).toBe(true)
    expect(Object.isFrozen(IDENTITY_NEUTRAL_COLOR)).toBe(true)

    expect(() => {
      IDENTITY_COLOR_PALETTE.push({ id: 'blocked', name: 'Blocked', background: '#111111', ring: '#222222', text: '#333333' })
    }).toThrow()
  })

  it('passes structural and contrast validation', () => {
    const result = validateIdentityColorPalette()
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })

  it('looks up every palette entry by id', () => {
    IDENTITY_COLOR_PALETTE.forEach((entry) => {
      expect(getIdentityColorById(entry.id)).toEqual(entry)
    })
    expect(getIdentityColorById('neutral')).toBeNull()
  })
})

export { validateIdentityColorPalette }
