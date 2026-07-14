import {
  EMPLOYEE_IDENTITY_MODES,
  resolveEmployeeIdentityPresentation,
} from '../../lib/identity/employeeIdentityResolve'
import { resolveEmployeeIdentitySize } from '../../lib/identity/employeeIdentitySize'

/**
 * @param {{
 *   employee?: object | null,
 *   size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl',
 *   showName?: boolean,
 *   showRole?: boolean,
 * }} props
 */
export function EmployeeIdentity({
  employee = null,
  size = 'md',
  showName = false,
  showRole = false,
}) {
  const presentation = resolveEmployeeIdentityPresentation(employee)
  const sizeConfig = resolveEmployeeIdentitySize(size)
  const normalizedSize = `${size ?? 'md'}`.trim().toLowerCase()

  const style = {
    '--identity-size': `${sizeConfig.sizePx}px`,
    '--identity-ring-width': `${sizeConfig.ringWidthPx}px`,
    '--identity-ring-color': presentation.color.ring,
    '--identity-background': presentation.color.background,
    '--identity-text-color': presentation.color.text,
    '--identity-font-size': `${sizeConfig.fontSizeRem}rem`,
  }

  return (
    <div
      className={`employee-identity employee-identity-size-${normalizedSize}${showName || showRole ? ' has-meta' : ''}`}
      style={style}
    >
      <div
        className="employee-identity-avatar"
        role="img"
        aria-label={presentation.ariaLabel}
      >
        <span className="employee-identity-ring" aria-hidden="true">
          <span className="employee-identity-core">
            {presentation.mode === EMPLOYEE_IDENTITY_MODES.PHOTO ? (
              <img
                className="employee-identity-photo"
                src={presentation.photoUrl}
                alt={presentation.name ? `${presentation.name} profile photo` : 'Employee profile photo'}
              />
            ) : null}

            {presentation.mode === EMPLOYEE_IDENTITY_MODES.INITIALS ? (
              <span className="employee-identity-initials" aria-hidden="true">
                {presentation.initials}
              </span>
            ) : null}

            {presentation.mode === EMPLOYEE_IDENTITY_MODES.UNKNOWN ? (
              <span className="employee-identity-unknown" aria-hidden="true">
                ?
              </span>
            ) : null}
          </span>
        </span>
      </div>

      {showName || showRole ? (
        <div className="employee-identity-meta">
          {showName && presentation.name ? (
            <span className="employee-identity-name">{presentation.name}</span>
          ) : null}
          {showRole && presentation.role ? (
            <span className="employee-identity-role">{presentation.role}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
