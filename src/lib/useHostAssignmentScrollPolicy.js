import { useEffect, useRef, useState } from 'react'

export function useHostAssignmentScrollPolicy(dependencies = []) {
  const scrollRef = useRef(null)
  const [needsScroll, setNeedsScroll] = useState(false)

  useEffect(() => {
    const node = scrollRef.current
    if (!node) return undefined

    const measure = () => {
      const drawer = node.closest('.host-seating-drawer')
      if (!drawer) {
        setNeedsScroll(false)
        return
      }

      const header = drawer.querySelector('.host-seating-drawer-header')
      const actions = drawer.querySelector('.host-seating-drawer-actions')
      const headerHeight = header?.offsetHeight ?? 0
      const actionsHeight = actions?.offsetHeight ?? 0
      const drawerHeight = drawer.clientHeight
      if (!drawerHeight) {
        setNeedsScroll(false)
        return
      }
      const availableBodyHeight = Math.max(0, drawerHeight - headerHeight - actionsHeight)

      setNeedsScroll(node.scrollHeight > availableBodyHeight + 1)
    }

    measure()

    const observer = new ResizeObserver(measure)
    observer.observe(node)
    observer.observe(node.parentElement ?? node)

    const drawer = node.closest('.host-seating-drawer')
    if (drawer) observer.observe(drawer)

    return () => observer.disconnect()
  }, dependencies)

  return { scrollRef, needsScroll }
}
