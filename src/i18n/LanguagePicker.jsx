import { LOCALES, ACTIVE_LOCALE_IDS, setLocale, useLocale } from './i18n'
import './languagePicker.css'

export function LanguagePicker({ className = '' }) {
  const locale = useLocale()
  const choices = LOCALES.filter((item) => ACTIVE_LOCALE_IDS.includes(item.id))

  return (
    <div className={`one-language-picker${className ? ` ${className}` : ''}`} role="group" aria-label="Language">
      {choices.map((item) => (
        <button
          key={item.id}
          type="button"
          className={locale === item.id ? 'is-selected' : ''}
          aria-pressed={locale === item.id}
          onClick={() => setLocale(item.id)}
        >
          {item.native}
        </button>
      ))}
    </div>
  )
}
