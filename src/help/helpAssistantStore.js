let open = false
const listeners = new Set()

function emit() {
  listeners.forEach((listener) => listener())
}

export function isHelpAssistantOpen() {
  return open
}

export function subscribeHelpAssistant(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function openHelpAssistant() {
  if (open) return
  open = true
  emit()
}

export function closeHelpAssistant() {
  if (!open) return
  open = false
  emit()
}
