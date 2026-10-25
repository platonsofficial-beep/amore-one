/** Keep an idempotency key for retries of the same reviewed payload. */
export function getMutationRequestId(holder, payload) {
  const signature = JSON.stringify(payload)
  if (holder.current?.signature !== signature) {
    holder.current = { signature, id: crypto.randomUUID() }
  }
  return holder.current.id
}
