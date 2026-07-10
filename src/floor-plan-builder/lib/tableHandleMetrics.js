/** Sizes are workspace units — they scale with the canvas stage transform. */
export const TABLE_HANDLE_MIN_SIZE = 18
export const TABLE_HANDLE_MAX_SIZE = 44
export const TABLE_HANDLE_SIZE_RATIO = 0.26

export function getTableHandleSize(minDimension) {
  const dimension = Math.max(1, Number(minDimension) || 1)
  return Math.min(
    TABLE_HANDLE_MAX_SIZE,
    Math.max(TABLE_HANDLE_MIN_SIZE, Math.round(dimension * TABLE_HANDLE_SIZE_RATIO)),
  )
}

export function getTableHandleMetrics(minDimension) {
  const handleSize = getTableHandleSize(minDimension)
  const chromeInset = Math.round(handleSize * 0.55 + 6)

  return {
    handleSize,
    chromeInset,
  }
}
