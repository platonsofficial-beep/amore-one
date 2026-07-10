export function HostTableTapDirectMarker({
  lastTableTap = 'none',
  openedTable = 'none',
  lastDismissSource = 'none',
  openDurationMs = null,
}) {
  const durationLabel = openDurationMs == null ? '—' : `${openDurationMs}ms`

  return (
    <div className="host-table-tap-direct-marker" data-testid="host-table-tap-direct-marker">
      <div>TABLE TAP DIRECT v2</div>
      <div>Last direct tap: {lastTableTap || 'none'}</div>
      <div>Opened table: {openedTable || 'none'}</div>
      <div>Last dismiss: {lastDismissSource || 'none'}</div>
      <div>Duration: {durationLabel}</div>
    </div>
  )
}
