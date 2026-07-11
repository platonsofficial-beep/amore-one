import {
  HostTableInspectorContent,
  useHostTableInspectorEscape,
} from './HostTableInspectorContent'

export function HostTableInspector({
  isOpen = false,
  assignmentContext = null,
  ...contentProps
}) {
  useHostTableInspectorEscape(contentProps.onClose, isOpen)

  if (!isOpen) return null

  return (
    <aside
      className={`host-table-inspector${assignmentContext ? ' is-assignment-mode' : ''}`}
      role="complementary"
      aria-labelledby="host-table-inspector-title"
      data-testid="host-table-inspector"
      data-assignment-mode={assignmentContext ? 'true' : 'false'}
    >
      <HostTableInspectorContent
        {...contentProps}
        assignmentContext={assignmentContext}
        variant="drawer"
        titleId="host-table-inspector-title"
        animateEntrance
      />
    </aside>
  )
}
