import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  BOOKING_SOCIAL_FOOTER,
  BOOKING_SOCIAL_FORMATS,
  BOOKING_SOCIAL_HEADLINE,
  fitTextBlock,
  shortBookingLabel,
  wrapTextLines,
} from './bookingSocialImage'

const measure = (line, fontSize) => line.length * fontSize * 0.5

describe('booking social image', () => {
  it('uses the post and story sizes and keeps the English poster copy', () => {
    expect(BOOKING_SOCIAL_FORMATS.square).toEqual({ width: 1080, height: 1080 })
    expect(BOOKING_SOCIAL_FORMATS.story).toEqual({ width: 1080, height: 1920 })
    expect(BOOKING_SOCIAL_HEADLINE).toBe('Scan here to make your reservation now')
    expect(BOOKING_SOCIAL_FOOTER).toBe('Powered by ONE Hospitality App')
    expect(shortBookingLabel('https://app.onehospitality.app/book/amore')).toBe('app.onehospitality.app/book/amore')
  })

  it('keeps a short venue name on one line', () => {
    const block = fitTextBlock('AMORE', 900, { maxFont: 72, minFont: 32, maxLines: 3, measure })
    expect(block.lines).toEqual(['AMORE'])
    expect(block.fontSize).toBe(72)
  })

  it('wraps and shrinks a long venue name so no line is wider than the frame', () => {
    const name = 'The Grand Mediterranean Rooftop Restaurant and Wine Bar of Thessaloniki'
    const maxWidth = 420
    const block = fitTextBlock(name, maxWidth, { maxFont: 72, minFont: 32, maxLines: 3, measure })
    expect(block.lines.length).toBeGreaterThan(1)
    expect(block.fontSize).toBeLessThan(72)
    block.lines.forEach((line) => {
      expect(measure(line, block.fontSize)).toBeLessThanOrEqual(maxWidth)
    })
    expect(block.lines.join(' ').replace(/\s+/g, ' ')).toContain('Thessaloniki')
  })

  it('splits a single word that would otherwise clip', () => {
    const lines = wrapTextLines('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 40, 80, measure)
    expect(lines.length).toBeGreaterThan(1)
    lines.forEach((line) => expect(measure(line, 40)).toBeLessThanOrEqual(80))
  })

  it('waits for loaded fonts and offers both downloads in settings', () => {
    const source = readFileSync('src/lib/bookingSocialImage.js', 'utf8')
    expect(source).toContain('document.fonts.ready')
    const section = readFileSync('src/components/workspace/OnlineReservationsSection.jsx', 'utf8')
    expect(section).toContain('t("Social media image")')
    expect(section).toContain('t("Square post")')
    expect(section).toContain('t("Story")')
    expect(section).toContain('renderBookingSocialImage')
  })
})
