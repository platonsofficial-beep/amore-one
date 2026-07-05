import { useEffect, useState } from 'react'
import {
  CUSTOM_DEPARTMENT_NEW_OPTION,
  CUSTOM_DEPARTMENT_TYPE,
  TASK_PRESET_DEPARTMENTS,
  buildCustomDepartmentOptionValue,
  getCustomDepartmentIcon,
  parseCustomDepartmentOptionValue,
  resolveDepartmentFormSelectValue,
} from '../../lib/taskDepartments'

export default function TaskDepartmentFields({
  department,
  departmentCustom,
  customDepartments = [],
  customDepartmentIcons = {},
  onChange,
}) {
  const [selectValue, setSelectValue] = useState(() => (
    resolveDepartmentFormSelectValue(department, departmentCustom)
  ))

  useEffect(() => {
    setSelectValue(resolveDepartmentFormSelectValue(department, departmentCustom))
  }, [department, departmentCustom])

  const showCustomNameInput = department === CUSTOM_DEPARTMENT_TYPE && (
    selectValue === CUSTOM_DEPARTMENT_NEW_OPTION
    || !customDepartments.includes(`${departmentCustom ?? ''}`.trim())
  )

  const handleDepartmentChange = (event) => {
    const nextValue = event.target.value
    setSelectValue(nextValue)

    if (nextValue === CUSTOM_DEPARTMENT_NEW_OPTION) {
      onChange?.({
        department: CUSTOM_DEPARTMENT_TYPE,
        departmentCustom: '',
      })
      return
    }

    const customName = parseCustomDepartmentOptionValue(nextValue)
    if (customName) {
      onChange?.({
        department: CUSTOM_DEPARTMENT_TYPE,
        departmentCustom: customName,
      })
      return
    }

    onChange?.({
      department: nextValue,
      departmentCustom: '',
    })
  }

  return (
    <>
      <label className="form-field">
        <span>Department</span>
        <select value={selectValue} onChange={handleDepartmentChange}>
          {TASK_PRESET_DEPARTMENTS.map((preset) => (
            <option key={preset.key} value={preset.key}>
              {preset.label}
            </option>
          ))}

          {customDepartments.length > 0 ? (
            <optgroup label="Custom departments">
              {customDepartments.map((name) => (
                <option key={name} value={buildCustomDepartmentOptionValue(name)}>
                  {`${getCustomDepartmentIcon(name, customDepartmentIcons)} ${name}`}
                </option>
              ))}
            </optgroup>
          ) : null}

          <option value={CUSTOM_DEPARTMENT_NEW_OPTION}>+ Custom department</option>
        </select>
      </label>

      {showCustomNameInput ? (
        <label className="form-field">
          <span>Custom department name</span>
          <input
            type="text"
            value={departmentCustom}
            onChange={(event) => onChange?.({
              department: CUSTOM_DEPARTMENT_TYPE,
              departmentCustom: event.target.value,
            })}
            placeholder="Kitchen, Cleaning, Delivery…"
            required
          />
        </label>
      ) : null}
    </>
  )
}
