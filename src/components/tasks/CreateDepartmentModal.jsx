import { useEffect, useState } from 'react'
import {
  CUSTOM_DEPARTMENT_EMOJI_PRESETS,
  CUSTOM_DEPARTMENT_ICON,
  normalizeDepartmentIcon,
} from '../../lib/taskDepartments'
import { t } from '../../i18n/i18n'

export default function CreateDepartmentModal({
  isOpen,
  onClose,
  onSubmit,
  existingNames = [],
}) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState(CUSTOM_DEPARTMENT_ICON)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (!isOpen) return
    setName('')
    setIcon(CUSTOM_DEPARTMENT_ICON)
    setErrorMessage('')
  }, [isOpen])

  if (!isOpen) return null

  const handleSubmit = (event) => {
    event.preventDefault()

    const trimmed = `${name ?? ''}`.trim()
    if (!trimmed) {
      setErrorMessage('Department name is required.')
      return
    }

    const normalizedExisting = existingNames.map((value) => `${value ?? ''}`.trim().toLowerCase())
    if (normalizedExisting.includes(trimmed.toLowerCase())) {
      setErrorMessage('This department already exists.')
      return
    }

    onSubmit?.({
      name: trimmed,
      icon: normalizeDepartmentIcon(icon),
    })
  }

  return (
    <div className="employee-modal-backdrop task-modal-backdrop" onClick={onClose}>
      <div
        className="employee-modal task-form-modal is-responsive-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-department-title"
      >
        <div className="drawer-header">
          <div>
            <p className="eyebrow">{t("Department")}</p>
            <h3 id="create-department-title">{t("Create department")}</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t("Close create department form")}>
            ✕
          </button>
        </div>

        {errorMessage ? <div className="staff-status-banner">{errorMessage}</div> : null}

        <form className="employee-form task-form" onSubmit={handleSubmit}>
          <label className="form-field task-form-field-full">
            <span>{t("Department name")}</span>
            <input
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value)
                setErrorMessage('')
              }}
              placeholder={t("Kitchen, Λάντζα, Cleaning, Delivery…")}
              required
              autoFocus
            />
          </label>

          <div className="task-department-icon-field task-form-field-full">
            <span className="task-department-icon-label">{t("Emoji / Icon")}</span>

            <div className="task-department-icon-preview" aria-hidden="true">
              {normalizeDepartmentIcon(icon)}
            </div>

            <div className="task-department-icon-grid" role="group" aria-label={t("Quick emoji choices")}>
              {CUSTOM_DEPARTMENT_EMOJI_PRESETS.map((preset) => (
                <button
                  key={`${preset.emoji}-${preset.label}`}
                  type="button"
                  className={`task-department-icon-choice${icon === preset.emoji ? ' is-selected' : ''}`}
                  onClick={() => setIcon(preset.emoji)}
                  aria-label={preset.label}
                  aria-pressed={icon === preset.emoji}
                >
                  <span className="task-department-icon-choice-emoji" aria-hidden="true">{preset.emoji}</span>
                  <span className="task-department-icon-choice-label">{preset.label}</span>
                </button>
              ))}
            </div>

            <label className="form-field task-department-icon-input">
              <span>{t("Or type / paste emoji")}</span>
              <input
                type="text"
                value={icon}
                onChange={(event) => setIcon(event.target.value)}
                placeholder={CUSTOM_DEPARTMENT_ICON}
                maxLength={8}
              />
            </label>
          </div>

          <div className="modal-actions">
            <button type="button" className="ghost-btn" onClick={onClose}>
              {t("Cancel")}
            </button>
            <button type="submit" className="primary-btn">
              {t("Create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
