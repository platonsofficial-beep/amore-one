import { getModuleLabel } from '../../lib/appNavigation'
import { getWorkspaceRoleLabel } from '../../lib/membershipRoles'
import { t } from '../../i18n/i18n'

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
      <h3>{t("Access restricted")}</h3>
      <p>
        {moduleLabel} is not available for your role
        {resolvedRoleLabel ? ` (${resolvedRoleLabel})` : ''}.
      </p>
      <button type="button" className="primary-btn" onClick={onGoDashboard}>
        {t("Go to Today")}
      </button>
    </section>
  )
}
