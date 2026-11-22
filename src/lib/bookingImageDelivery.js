export function isStandaloneApp() {
  if (typeof navigator !== 'undefined' && navigator.standalone) return true
  try {
    return Boolean(window.matchMedia?.('(display-mode: standalone)').matches)
  } catch {
    return false
  }
}

export async function fileFromDataUrl(dataUrl, filename) {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return new File([blob], filename, { type: blob.type || 'image/png' })
}

/**
 * Must run inside the tap. Share is started immediately when the browser
 * accepts files. AbortError is the user closing the sheet.
 */
export function deliverImageFile({
  file,
  title = '',
  standalone = false,
  canShare,
  share,
  download,
  onOverlay,
  onShareError,
} = {}) {
  const payload = { files: [file], title: title || file?.name || '' }
  let allowed = false
  try {
    allowed = typeof canShare === 'function' && canShare(payload) === true
  } catch {
    allowed = false
  }
  if (allowed && typeof share === 'function') {
    try {
      Promise.resolve(share(payload)).catch((error) => {
        if (error?.name === 'AbortError') return
        onShareError?.(error)
      })
    } catch (error) {
      if (error?.name !== 'AbortError') onShareError?.(error)
    }
    return 'shared'
  }
  if (standalone) {
    onOverlay?.(file)
    return 'overlay'
  }
  download?.(file, file?.name || 'image.png')
  return 'downloaded'
}
