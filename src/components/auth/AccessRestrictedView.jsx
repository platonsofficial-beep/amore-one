import { getModuleLabel } from '../../lib/appNavigation'
import { getWorkspaceRoleLabel } from '../../lib/membershipRoles'

export function AccessRestrictedView({
  moduleId = '',
  role = '',
  roleLabel = '',
  onGoDashboard,
}) {
  const moduleLabel = getModuleLabel(moduleId)
  const resolvedRoleLabel = roleLabel || getWorkspaceRoleLabel(role)

  return (
    <section className="access-restricted-view panel staff-panel" aria-live="polite">
      <div className="access-restricted-icon" aria-hidden="true">🔒</div>
      <h3>Access restricted</h3>
      <p>
        {moduleLabel} is not available for your role
        {resolvedRoleLabel ? ` (${resolvedRoleLabel})` : ''}.
      </p>
      <button type="button" className="primary-btn" onClick={onGoDashboard}>
        Go to Today
      </button>
    </section>
  )
}
