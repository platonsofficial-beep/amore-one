import { useEffect, useState } from 'react'
import {
  getHostFloorDebugTrace,
  isHostFloorDebugEnabled,
  subscribeHostFloorDebugTrace,
} from '../../lib/hostFloorDebugTrace'

export function HostFloorDebugOverlay() {
  const [trace, setTrace] = useState(() => getHostFloorDebugTrace())

  useEffect(() => {
    if (!isHostFloorDebugEnabled()) return undefined
    return subscribeHostFloorDebugTrace(setTrace)
  }, [])

  if (!isHostFloorDebugEnabled()) return null

  return (
    <div className="host-floor-debug-overlay" aria-live="polite" data-testid="host-floor-debug-overlay">
      <strong>Host Debug</strong>
      <div>DOWN: {trace.down ? '✓' : '✗'}</div>
      <div>TARGET: {trace.targetElement}</div>
      <div>TABLE NODE: {trace.tableNodeFound}</div>
      <div>TABLE ID: {trace.tableId}</div>
      <div>MODE: {trace.mode}</div>
      <div>UP: {trace.up ? '✓' : '✗'}</div>
      <div>DISTANCE: {trace.distance}</div>
      <div>IS TAP: {trace.isTap ? 'true' : 'false'}</div>
      <div>RESOLVED: {trace.resolved ? 'true' : 'false'}</div>
      <div>CALLBACK: {trace.callbackFired ? 'fired' : '—'}</div>
      <div>DIALOG: {trace.dayViewState}</div>
      <div>LAST: {trace.lastEvent}</div>
    </div>
  )
}
