export const RESERVATION_LOAD_TIMEOUT_MS = 8000

export function withTimeout(promise, ms = RESERVATION_LOAD_TIMEOUT_MS, message = "Couldn't load") {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
