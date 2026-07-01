import { useEffect, useState } from 'react'

const INITIAL_LAYOUT = {
  workspaceX: 220,
  workspaceY: 48,
  workspaceWidth: 0,
  workspaceHeight: 0,
  toolbarHeight: 48,
  sidebarWidth: 220,
  inspectorWidth: 280,
  statusHeight: 32,
}

export function useBuilderEditorLayout(
  editorRef,
  toolbarRef,
  sidebarRef,
  inspectorRef,
  statusRef,
) {
  const [layout, setLayout] = useState(INITIAL_LAYOUT)

  useEffect(() => {
    const editorEl = editorRef.current
    if (!editorEl || typeof ResizeObserver === 'undefined') return undefined

    const measure = () => {
      const editorWidth = editorEl.clientWidth
      const editorHeight = editorEl.clientHeight
      const toolbarHeight = toolbarRef.current?.offsetHeight ?? 0
      const sidebarWidth = sidebarRef.current?.offsetWidth ?? 0
      const inspectorWidth = inspectorRef.current?.offsetWidth ?? 0
      const statusHeight = statusRef.current?.offsetHeight ?? 0

      const workspaceX = sidebarWidth
      const workspaceY = toolbarHeight
      const workspaceWidth = Math.max(0, editorWidth - sidebarWidth - inspectorWidth)
      const workspaceHeight = Math.max(0, editorHeight - toolbarHeight - statusHeight)

      setLayout({
        workspaceX,
        workspaceY,
        workspaceWidth,
        workspaceHeight,
        toolbarHeight,
        sidebarWidth,
        inspectorWidth,
        statusHeight,
      })
    }

    const observer = new ResizeObserver(measure)
    observer.observe(editorEl)

    const chromeRefs = [toolbarRef, sidebarRef, inspectorRef, statusRef]
    chromeRefs.forEach((ref) => {
      if (ref.current) observer.observe(ref.current)
    })

    measure()
    return () => observer.disconnect()
  }, [editorRef, toolbarRef, sidebarRef, inspectorRef, statusRef])

  return layout
}
