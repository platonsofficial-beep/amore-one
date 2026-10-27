export function ShiftReminderCard({
  mode = 'opt-in',
  busy = false,
  message = '',
  onTurnOn,
  onNotNow,
  onDismissForever,
}) {
  const isGuide = mode === 'ios-guide'

  return (
    <section className="shift-reminder-card" aria-label="Shift reminders">
      <div className="shift-reminder-card-copy">
        <p className="shift-reminder-card-kicker">
          <span aria-hidden="true">{isGuide ? '📲' : '🔔'}</span>
          {isGuide ? 'Home Screen' : 'Reminders'}
        </p>
        <h2>{isGuide ? 'Add ONE to your Home Screen to get reminders' : 'Get shift reminders'}</h2>
        {isGuide ? (
          <ol className="shift-reminder-steps">
            <li>Open ONE in Safari</li>
            <li>Tap Share</li>
            <li>Tap Add to Home Screen</li>
          </ol>
        ) : (
          <p>We'll remind you if you haven't clocked in, and tell you when the new schedule is out.</p>
        )}
        {isGuide ? (
          <p className="shift-reminder-note">This works on iPhone with iOS 16.4 or newer. The bell still shows reminders either way.</p>
        ) : null}
        {message ? <p className="shift-reminder-message" role="status">{message}</p> : null}
      </div>
      <div className="shift-reminder-actions">
        {isGuide ? null : (
          <button type="button" className="primary-btn shift-reminder-btn" onClick={onTurnOn} disabled={busy}>
            {busy ? 'Turning on…' : 'Turn on'}
          </button>
        )}
        <button type="button" className="shift-reminder-btn shift-reminder-btn-quiet" onClick={onNotNow} disabled={busy}>
          Not now
        </button>
        <button type="button" className="shift-reminder-dismiss" onClick={onDismissForever} disabled={busy}>
          Don't ask again
        </button>
      </div>
    </section>
  )
}
