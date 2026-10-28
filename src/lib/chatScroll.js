export const CHAT_NEAR_BOTTOM_PX = 120

export function distanceFromBottom({ scrollHeight = 0, scrollTop = 0, clientHeight = 0 } = {}) {
  return Math.max(0, scrollHeight - scrollTop - clientHeight)
}

export function readChatScrollMetrics(node) {
  if (!node) return { scrollHeight: 0, scrollTop: 0, clientHeight: 0, distance: 0 }
  const scrollHeight = Number(node.scrollHeight) || 0
  const scrollTop = Number(node.scrollTop) || 0
  const clientHeight = Number(node.clientHeight) || 0
  return {
    scrollHeight,
    scrollTop,
    clientHeight,
    distance: distanceFromBottom({ scrollHeight, scrollTop, clientHeight }),
  }
}

export function isNearChatBottom(distance) {
  return distance <= CHAT_NEAR_BOTTOM_PX
}

export function shouldShowChatScrollButton({ distance = 0, clientHeight = 0, pendingCount = 0 } = {}) {
  if (isNearChatBottom(distance)) return false
  if (pendingCount > 0) return true
  return distance > Math.max(0, clientHeight)
}

export function countArrivedMessages(previousIds = [], nextIds = []) {
  const previous = new Set(previousIds)
  let count = 0
  for (const id of nextIds) {
    if (!previous.has(id)) count += 1
  }
  return count
}

export function isHistoryPrepend(previousIds = [], nextIds = []) {
  if (!previousIds.length || nextIds.length <= previousIds.length) return false
  if (nextIds[nextIds.length - 1] !== previousIds[previousIds.length - 1]) return false
  const next = new Set(nextIds)
  return previousIds.every((id) => next.has(id))
}

export function preservedScrollTop(previousHeight, previousTop, nextHeight) {
  return previousTop + Math.max(0, nextHeight - previousHeight)
}

export function firstUnreadMessageId(messages = [], { memberId = '', lastReadAt = '', inboxUnread = 0 } = {}) {
  const readAt = Date.parse(lastReadAt)
  const hasRead = Number.isFinite(readAt)
  if (!hasRead && !(Number(inboxUnread) > 0)) return ''
  const unread = messages.find((message) => {
    if (!message?.id || message.deleted_at) return false
    if (memberId && `${message.author_member_id ?? ''}` === `${memberId}`) return false
    if (!hasRead) return true
    const created = Date.parse(message.created_at)
    return Number.isFinite(created) && created > readAt
  })
  return unread?.id || ''
}

export function planChatScrollPosition({ distance = 0, clientHeight = 0, pendingCount = 0 } = {}) {
  const stick = isNearChatBottom(distance)
  const pending = stick ? 0 : pendingCount
  return {
    stick,
    pendingCount: pending,
    showButton: shouldShowChatScrollButton({ distance, clientHeight, pendingCount: pending }),
  }
}

export function planChatScrollUpdate({
  opening = false,
  forceBottom = false,
  stick = false,
  pendingCount = 0,
  previousIds = [],
  nextIds = [],
  distance = 0,
  clientHeight = 0,
  unreadId = '',
} = {}) {
  if (opening) {
    if (unreadId && !forceBottom) {
      return { action: 'unread', unreadId, stick: false, pendingCount: 0, showButton: false }
    }
    return { action: 'bottom-instant', stick: true, pendingCount: 0, showButton: false }
  }

  if (!forceBottom && isHistoryPrepend(previousIds, nextIds)) {
    return {
      action: 'preserve',
      stick: false,
      pendingCount,
      showButton: shouldShowChatScrollButton({ distance, clientHeight, pendingCount }),
    }
  }

  const arrived = countArrivedMessages(previousIds, nextIds)
  if (forceBottom || stick) {
    return {
      action: forceBottom || arrived === 0 ? 'bottom-instant' : 'bottom-smooth',
      stick: true,
      pendingCount: 0,
      showButton: false,
    }
  }

  const nextPending = pendingCount + arrived
  return {
    action: 'hold',
    stick: false,
    pendingCount: nextPending,
    showButton: shouldShowChatScrollButton({
      distance,
      clientHeight,
      pendingCount: nextPending,
    }),
  }
}

export function scrollChatToBottom(node, behavior = 'auto') {
  if (!node) return
  const top = Number(node.scrollHeight) || 0
  if (typeof node.scrollTo === 'function') node.scrollTo({ top, behavior })
  else node.scrollTop = top
}

export function scrollChatToMessage(node, messageId) {
  if (!node || !messageId) return
  const target = node.querySelector?.(`[id="chat-message-${messageId}"]`)
  target?.scrollIntoView?.({ block: 'start', behavior: 'auto' })
}
