import { isHeicFile } from './chatImage'

export const AVATAR_EDGE = 512
export const AVATAR_QUALITY = 0.85
export const AVATAR_MAX_BYTES = 500 * 1024

export function squareCropRect(width, height) {
  const safeWidth = Math.max(1, Number(width) || 1)
  const safeHeight = Math.max(1, Number(height) || 1)
  const size = Math.min(safeWidth, safeHeight)
  return {
    sx: Math.floor((safeWidth - size) / 2),
    sy: Math.floor((safeHeight - size) / 2),
    size,
  }
}

function loadImageSource(source) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(source)
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that photo.'))
    }
    image.src = url
  })
}

function canvasJpegBlob(canvas, quality) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', quality)
  })
}

async function encodeSquareJpeg(image) {
  const width = image.width || image.naturalWidth
  const height = image.height || image.naturalHeight
  const crop = squareCropRect(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_EDGE
  canvas.height = AVATAR_EDGE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not prepare that photo.')
  context.drawImage(image, crop.sx, crop.sy, crop.size, crop.size, 0, 0, AVATAR_EDGE, AVATAR_EDGE)
  if (typeof image.close === 'function') image.close()

  let quality = AVATAR_QUALITY
  let blob = null
  while (quality >= 0.4) {
    blob = await canvasJpegBlob(canvas, quality)
    if (blob && blob.size <= AVATAR_MAX_BYTES) return blob
    quality = Math.round((quality - 0.08) * 100) / 100
  }
  throw new Error('That photo is still too large. Try another one.')
}

export async function prepareAvatarImage(file) {
  if (!file) throw new Error('Choose a photo first.')
  let source = file
  if (isHeicFile(file)) {
    const heic2any = (await import('heic2any')).default
    const converted = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: AVATAR_QUALITY,
    })
    source = Array.isArray(converted) ? converted[0] : converted
  }
  const image = await loadImageSource(source)
  const blob = await encodeSquareJpeg(image)
  const previewUrl = URL.createObjectURL(blob)
  return {
    blob,
    previewUrl,
    width: AVATAR_EDGE,
    height: AVATAR_EDGE,
    mime: 'image/jpeg',
    size: blob.size,
  }
}
