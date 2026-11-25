export function saveNoticeIsError(message = '') {
  const text = `${message ?? ''}`.trim()
  if (!text) return false
  if (/unable|couldn't|could not|error|fail|required|not ready|permission|δεν |αποτυχ|απαιτ/i.test(text)) return true
  if (/saved|updated|success|applied|added|deleted|activated|deactivated|downloaded|open again|αποθηκεύ|ενημερ|προστέθ|διαγρά|ενεργοποι/i.test(text)) return false
  return true
}

/** Confirmation or error that belongs with the button that was just pressed. */
export function WorkspaceSaveNotice({ message = '' }) {
  const text = `${message ?? ''}`.trim()
  if (!text) return null
  const isError = saveNoticeIsError(text)
  return (
    <div
      className={`staff-status-banner workspace-save-notice${isError ? ' auth-banner-error' : ' auth-banner-success'}`}
      role={isError ? 'alert' : 'status'}
    >
      {text}
    </div>
  )
}
