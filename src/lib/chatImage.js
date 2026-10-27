export const CHAT_IMAGE_MAX_EDGE = 1600
export const CHAT_IMAGE_QUALITY = 0.8
export const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024

export function isHeicFile(file) {
  const type = `${file?.type ?? ''}`.toLowerCase()
  const name = `${file?.name ?? ''}`.toLowerCase()
  return type.includes('heic') || type.includes('heif') || name.endsWith('.heic') || name.endsWith('.heif')
}

export function fitChatImageSize(width, height, maxEdge = CHAT_IMAGE_MAX_EDGE) {
  const safeWidth = Math.max(1, Number(width) || 1)
  const safeHeight = Math.max(1, Number(height) || 1)
  const scale = Math.min(1, maxEdge / Math.max(safeWidth, safeHeight))
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
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

async function canvasJpeg(source) {
  const image = await loadImageSource(source)
  const width = image.width || image.naturalWidth
  const height = image.height || image.naturalHeight
  const fitted = fitChatImageSize(width, height)
  const canvas = document.createElement('canvas')
  canvas.width = fitted.width
  canvas.height = fitted.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not prepare that photo.')
  context.drawImage(image, 0, 0, fitted.width, fitted.height)
  if (typeof image.close === 'function') image.close()
  const blob = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/jpeg', CHAT_IMAGE_QUALITY)
  })
  if (!blob) throw new Error('Could not prepare that photo.')
  if (blob.size > CHAT_IMAGE_MAX_BYTES) {
    throw new Error('That photo is still too large. Try another one.')
  }
  return {
    blob,
    width: fitted.width,
    height: fitted.height,
    mime: 'image/jpeg',
    size: blob.size,
  }
}

export async function prepareChatImage(file) {
  if (!file) throw new Error('Choose a photo first.')
  let source = file
  if (isHeicFile(file)) {
    const heic2any = (await import('heic2any')).default
    const converted = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: CHAT_IMAGE_QUALITY,
    })
    source = Array.isArray(converted) ? converted[0] : converted
  }
  return canvasJpeg(source)
}
