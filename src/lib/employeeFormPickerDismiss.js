import { useEffect, useRef } from 'react'

/**
 * Opening one employee-form picker closes the others. This used to send a
 * synthetic Escape key press, which the dialog Escape handler also caught and
 * closed the whole employee form. A dedicated event keeps the two apart.
 */
export const EMPLOYEE_FORM_DISMISS_PICKERS_EVENT = 'one:employee-form-dismiss-pickers'

export function dismissEmployeeFormOverlayPickers() {
  if (typeof document === 'undefined') return
  document.dispatchEvent(new CustomEvent(EMPLOYEE_FORM_DISMISS_PICKERS_EVENT))
}

export function useEmployeeFormPickerDismiss(onDismiss, { enabled = true } = {}) {
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined
    const handle = () => onDismissRef.current?.()
    document.addEventListener(EMPLOYEE_FORM_DISMISS_PICKERS_EVENT, handle)
    return () => document.removeEventListener(EMPLOYEE_FORM_DISMISS_PICKERS_EVENT, handle)
  }, [enabled])
}
