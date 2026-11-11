/** While Assign employees is open, a gesture may scroll the employee list only. */

export function assignCardScrollDelta(event, lastY = 0) {
  if (event?.type === 'wheel') return event.deltaY || 0
  const y = event?.touches?.[0]?.clientY
  if (event?.type === 'touchmove' && typeof y === 'number') return lastY - y
  return 0
}

function elementFromEvent(event) {
  const target = event?.target
  if (target instanceof Element) return target
  return target?.parentElement instanceof Element ? target.parentElement : null
}

function canScroll(element) {
  return Boolean(element) && element.scrollHeight - element.clientHeight > 1
}

export function shouldBlockAssignCardBackgroundScroll(event, delta = 0) {
  const target = elementFromEvent(event)
  const modal = target?.closest?.('.schedule-assignment-modal')
  if (!modal) return true
  const list = target.closest('.assignment-employee-list')
  const body = target.closest('.assignment-card-body')
  const scroller = [list, body].find((element) => canScroll(element))
  if (!scroller) return true
  const max = scroller.scrollHeight - scroller.clientHeight
  if (delta > 0 && scroller.scrollTop >= max - 1) return true
  if (delta < 0 && scroller.scrollTop <= 0) return true
  return false
}
