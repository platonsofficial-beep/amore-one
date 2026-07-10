import { isHostFloorTapGesture } from './hostFloorPointerInteraction'

export function createHostFloorTableTapRegistry() {
  return {
    nextSessionId: 1,
    sessionsByPointerId: new Map(),
    consumedTap: null,
  }
}

export function beginHostFloorDirectTableTap(registry, { pointerId, tableId, clientX, clientY }) {
  if (!registry) return null

  registry.consumedTap = null
  const sessionId = registry.nextSessionId++
  const session = {
    sessionId,
    pointerId,
    tableId: String(tableId),
    startX: clientX,
    startY: clientY,
  }
  registry.sessionsByPointerId.set(pointerId, session)
  return session
}

export function cancelHostFloorDirectTableTap(registry, pointerId) {
  if (!registry) return
  registry.sessionsByPointerId.delete(pointerId)
}

export function completeHostFloorDirectTableTap(registry, { pointerId, clientX, clientY }) {
  if (!registry) {
    return { activated: false, session: null, tableId: null }
  }

  const session = registry.sessionsByPointerId.get(pointerId)
  if (!session) {
    return { activated: false, session: null, tableId: null }
  }

  registry.sessionsByPointerId.delete(pointerId)

  const isTap = isHostFloorTapGesture(
    { pointerId: session.pointerId, clientX: session.startX, clientY: session.startY },
    { pointerId, clientX, clientY },
  )

  if (!isTap) {
    return { activated: false, session, tableId: session.tableId }
  }

  if (
    registry.consumedTap
    && String(registry.consumedTap.tableId) === String(session.tableId)
  ) {
    return { activated: false, session, tableId: session.tableId, reason: 'consumed' }
  }

  registry.consumedTap = {
    sessionId: session.sessionId,
    pointerId,
    tableId: session.tableId,
  }

  return { activated: true, session, tableId: session.tableId }
}

export function isHostFloorTableTapConsumedForTable(registry, tableId) {
  if (!registry?.consumedTap || tableId == null) return false
  return String(registry.consumedTap.tableId) === String(tableId)
}

export function shouldSkipViewportTableTap(registry, tableTap) {
  if (!registry?.consumedTap || !tableTap?.tableId) return false
  return String(registry.consumedTap.tableId) === String(tableTap.tableId)
}

export function clearHostFloorTableTapConsumed(registry) {
  if (!registry) return
  registry.consumedTap = null
}
