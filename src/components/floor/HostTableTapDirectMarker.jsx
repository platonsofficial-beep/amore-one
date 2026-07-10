export function HostTableTapDirectMarker({ lastTableTap = 'none' }) {
  return (
    <div className="host-table-tap-direct-marker" data-testid="host-table-tap-direct-marker">
      <div>TABLE TAP DIRECT v1</div>
      <div>Last table tap: {lastTableTap || 'none'}</div>
    </div>
  )
}
