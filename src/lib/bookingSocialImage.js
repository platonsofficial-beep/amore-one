import QRCode from 'qrcode'

export const BOOKING_SOCIAL_FORMATS = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
}

export const BOOKING_SOCIAL_HEADLINE = 'Scan here to make your reservation now'
export const BOOKING_SOCIAL_FOOTER = 'Powered by ONE Hospitality App'

const LOGO_URL = '/brand/one-mark.svg'

export function shortBookingLabel(url) {
  return `${url ?? ''}`.trim().replace(/^https?:\/\//, '')
}

export function wrapTextLines(text, fontSize, maxWidth, measure) {
  const words = `${text ?? ''}`.trim().split(/\s+/).filter(Boolean)
  if (!words.length || maxWidth <= 0) return []
  const lines = []
  let current = ''
  const pushWord = (word) => {
    if (measure(word, fontSize) <= maxWidth) {
      current = word
      return
    }
    let chunk = ''
    for (const char of word) {
      const trial = `${chunk}${char}`
      if (chunk && measure(trial, fontSize) > maxWidth) {
        lines.push(chunk)
        chunk = char
      } else {
        chunk = trial
      }
    }
    current = chunk
  }
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word
    if (current && measure(next, fontSize) <= maxWidth) {
      current = next
      return
    }
    if (current) lines.push(current)
    pushWord(word)
  })
  if (current) lines.push(current)
  return lines
}

export function fitTextBlock(text, maxWidth, {
  maxFont = 72,
  minFont = 28,
  maxLines = 3,
  maxHeight = 0,
  lineHeightRatio = 1.15,
  measure,
} = {}) {
  const clean = `${text ?? ''}`.trim()
  const heightLimit = maxHeight > 0 ? maxHeight : Math.round(maxLines * maxFont * lineHeightRatio)
  if (!clean) return { fontSize: maxFont, lines: [], lineHeight: Math.round(maxFont * lineHeightRatio) }
  const fitsAt = (size) => {
    const lines = wrapTextLines(clean, size, maxWidth, measure)
    const lineHeight = Math.round(size * lineHeightRatio)
    const wide = lines.some((line) => measure(line, size) > maxWidth)
    return {
      fontSize: size,
      lines,
      lineHeight,
      fits: lines.length > 0 && !wide && lines.length * lineHeight <= heightLimit,
    }
  }
  let size = Math.max(maxFont, minFont)
  while (size > 8) {
    const block = fitsAt(size)
    if (block.fits) return block
    size -= 2
  }
  return fitsAt(8)
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image failed to load.'))
    image.src = src
  })
}

function readToken(name) {
  const probe = document.createElement('span')
  probe.style.color = `var(${name})`
  document.body.appendChild(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}

function colorForQr(color) {
  const match = `${color}`.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) return color
  const hex = (channel) => Number(channel).toString(16).padStart(2, '0')
  return `#${hex(match[1])}${hex(match[2])}${hex(match[3])}`
}

async function readyFonts() {
  if (!document.fonts?.ready) return
  await document.fonts.ready
  await Promise.all([
    document.fonts.load('700 72px Inter'),
    document.fonts.load('500 36px Inter'),
    document.fonts.load('400 28px Inter'),
  ]).catch(() => {})
}

function drawLines(ctx, lines, fontSize, weight, color, centerX, y, lineHeight) {
  ctx.fillStyle = color
  ctx.font = `${weight} ${fontSize}px Inter`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  lines.forEach((line, index) => {
    ctx.fillText(line, centerX, y + index * lineHeight)
  })
}

export async function renderBookingSocialImage({
  venueName = '',
  url = '',
  format = 'square',
  logoUrl = LOGO_URL,
} = {}) {
  await readyFonts()
  const size = BOOKING_SOCIAL_FORMATS[format] || BOOKING_SOCIAL_FORMATS.square
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  const colors = {
    navy: readToken('--one-navy-900'),
    gold: readToken('--one-gold'),
    goldLight: readToken('--one-gold-light'),
    paper: readToken('--one-text'),
    ink: readToken('--one-gold-ink'),
    muted: readToken('--one-text-muted'),
  }
  const measure = (line, fontSize) => {
    ctx.font = `700 ${fontSize}px Inter`
    return ctx.measureText(line).width
  }

  ctx.fillStyle = colors.navy
  ctx.fillRect(0, 0, size.width, size.height)
  ctx.strokeStyle = colors.gold
  ctx.lineWidth = 6
  roundRect(ctx, 28, 28, size.width - 56, size.height - 56, 36)
  ctx.stroke()

  const pad = 72
  const centerX = size.width / 2
  const maxText = size.width - pad * 2
  const footerHeight = 88
  const footerTop = size.height - pad - footerHeight

  let logo = null
  try {
    logo = await loadImage(logoUrl)
  } catch {
    logo = null
  }

  const logoHeight = 84
  const logoWidth = logo ? (logo.naturalWidth / logo.naturalHeight) * logoHeight : 96
  if (logo) {
    ctx.drawImage(logo, centerX - logoWidth / 2, pad, logoWidth, logoHeight)
  }

  let y = pad + logoHeight + 28
  const venueMax = format === 'story' ? 84 : 68
  const venue = fitTextBlock(venueName || 'ONE', maxText, {
    maxFont: venueMax,
    minFont: 32,
    maxHeight: format === 'story' ? 280 : 200,
    measure,
  })
  drawLines(ctx, venue.lines, venue.fontSize, 700, colors.paper, centerX, y, venue.lineHeight)
  y += venue.lines.length * venue.lineHeight + 18

  const headline = fitTextBlock(BOOKING_SOCIAL_HEADLINE, maxText, {
    maxFont: format === 'story' ? 40 : 34,
    minFont: 24,
    maxHeight: format === 'story' ? 120 : 96,
    measure,
  })
  drawLines(ctx, headline.lines, headline.fontSize, 500, colors.goldLight, centerX, y, headline.lineHeight)
  y += headline.lines.length * headline.lineHeight + 28

  const label = shortBookingLabel(url)
  const urlBlock = fitTextBlock(label, maxText, {
    maxFont: 26,
    minFont: 16,
    maxHeight: 70,
    measure,
  })
  const urlHeight = Math.max(urlBlock.lines.length, 1) * urlBlock.lineHeight
  const available = footerTop - 20 - y - urlHeight - 16
  const cardMax = format === 'story' ? 760 : 560
  const card = Math.max(240, Math.min(cardMax, available))
  const cardX = centerX - card / 2
  const cardY = y + Math.max(0, (available - card) / 2)

  ctx.fillStyle = colors.paper
  roundRect(ctx, cardX, cardY, card, card, 36)
  ctx.fill()
  ctx.lineWidth = 8
  ctx.strokeStyle = colors.gold
  roundRect(ctx, cardX, cardY, card, card, 36)
  ctx.stroke()

  const qrUrl = await QRCode.toDataURL(url, {
    margin: 1,
    width: 900,
    errorCorrectionLevel: 'H',
    color: { dark: colorForQr(colors.ink), light: colorForQr(colors.paper) },
  })
  const qr = await loadImage(qrUrl)
  const inset = 36
  ctx.drawImage(qr, cardX + inset, cardY + inset, card - inset * 2, card - inset * 2)

  const urlY = cardY + card + 18
  drawLines(ctx, urlBlock.lines, urlBlock.fontSize, 400, colors.muted, centerX, urlY, urlBlock.lineHeight)

  const footerLogo = 48
  const footerTextSize = 26
  ctx.font = `500 ${footerTextSize}px Inter`
  const footerTextWidth = ctx.measureText(BOOKING_SOCIAL_FOOTER).width
  const footerRow = footerLogo + 16 + footerTextWidth
  const footerX = centerX - footerRow / 2
  const footerY = size.height - pad - footerLogo
  if (logo) ctx.drawImage(logo, footerX, footerY, footerLogo * (logoWidth / logoHeight), footerLogo)
  ctx.fillStyle = colors.paper
  ctx.font = `500 ${footerTextSize}px Inter`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(BOOKING_SOCIAL_FOOTER, footerX + footerLogo + 16, footerY + footerLogo / 2)

  return canvas.toDataURL('image/png')
}
