import { useEffect, useState } from 'react'

const INITIAL_LAYOUT = {
  toolbarHeight: 48,
  sidebarWidth: 200,
}

export function useBuilderEditorLayout(editorRef, toolbarRef, sidebarRef) {
  const [layout, setLayout] = useState(INITIAL_LAYOUT)

  useEffect(() => {
    const editorEl = editorRef.current
    if (!editorEl || typeof ResizeObserver === 'undefined') return undefined

    const measure = () => {
      const toolbarHeight = toolbarRef.current?.offsetHeight ?? 0
      const sidebarWidth = sidebarRef.current?.offsetWidth ?? 0

      setLayout({
        toolbarHeight,
        sidebarWidth,
      })
    }

    const observer = new ResizeObserver(measure)
    observer.observe(editorEl)

    ;[toolbarRef, sidebarRef].forEach((ref) => {
      if (ref.current) observer.observe(ref.current)
    })

    measure()
    return () => observer.disconnect()
  }, [editorRef, sidebarRef, toolbarRef])

  return layout
}
