import { HOST_QUEUE_DEFAULT_SORT, HOST_QUEUE_SORT_OPTIONS } from './hostQueuePipeline'

export const HOST_QUEUE_SORT_STORAGE_KEY = 'one.host-queue.sort.v1'

export function readHostQueueSortPreference() {
  if (typeof window === 'undefined') return HOST_QUEUE_DEFAULT_SORT

  try {
    const raw = window.localStorage.getItem(HOST_QUEUE_SORT_STORAGE_KEY)
    if (HOST_QUEUE_SORT_OPTIONS.some((entry) => entry.id === raw)) {
      return raw
    }
  } catch {
    // ignore storage failures
  }

  return HOST_QUEUE_DEFAULT_SORT
}

export function writeHostQueueSortPreference(sortId) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(HOST_QUEUE_SORT_STORAGE_KEY, sortId)
  } catch {
    // ignore storage failures
  }
}
