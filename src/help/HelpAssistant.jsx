import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { helpAiEnabled, helpArticlesForModel } from './helpAi'
import { helpText } from './helpKnowledge'
import {
  closeHelpAssistant,
  isHelpAssistantOpen,
  subscribeHelpAssistant,
} from './helpAssistantStore'
import { helpSectionsForRole, searchHelp, supportMailto } from './searchHelp'
import './helpAssistant.css'

function useHelpOpen() {
  return useSyncExternalStore(subscribeHelpAssistant, isHelpAssistantOpen, () => false)
}

function localeFromNavigator() {
  if (typeof navigator === 'undefined') return 'en'
  return `${navigator.language ?? ''}`.toLowerCase().startsWith('el') ? 'el' : 'en'
}

export function HelpAssistant({
  open,
  onClose,
  role = 'staff',
  venueName = '',
  screenLabel = '',
  onNavigate,
  aiEnabled = false,
  ask,
}) {
  const [locale, setLocale] = useState(localeFromNavigator)
  const [query, setQuery] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [articleId, setArticleId] = useState('')
  const [supportOpen, setSupportOpen] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)
  const [aiAnswer, setAiAnswer] = useState('')
  const [aiError, setAiError] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const copy = locale === 'el'
    ? {
      title: 'Πώς μπορώ να βοηθήσω;',
      placeholder: 'Πώς κάνω κάτι στο ONE;',
      still: 'Χρειάζομαι κι άλλη βοήθεια',
      empty: 'Δεν βρήκαμε βήματα για αυτό.',
      emailLead: 'Στείλε email στο info@onehospitality.app και η ομάδα θα επικοινωνήσει μαζί σου.',
      email: 'Email στην υποστήριξη',
      back: 'Πίσω',
      close: 'Κλείσιμο',
      open: 'Άνοιγμα οθόνης',
      ask: 'Ρώτα',
      managers: 'Τα πλάνα και η χρέωση είναι για ιδιοκτήτη ή manager.',
    }
    : {
      title: 'How can we help?',
      placeholder: 'How do I do something in ONE?',
      still: 'Still need help',
      empty: 'We couldn’t find steps for that.',
      emailLead: 'Email info@onehospitality.app and the team will contact you.',
      email: 'Email support',
      back: 'Back',
      close: 'Close',
      open: 'Open screen',
      ask: 'Ask',
      managers: 'Plans and billing are for an owner or manager.',
    }

  const result = useMemo(
    () => searchHelp(query, { role, locale }),
    [query, role, locale],
  )
  const sections = useMemo(
    () => helpSectionsForRole(role, locale),
    [role, locale],
  )
  const sectionArticles = sections.find((section) => section.id === sectionId)?.articles ?? []
  const article = result.matches.find((item) => item.article.id === articleId)?.article
    || null
  const mailto = supportMailto({
    venueName,
    role,
    screen: screenLabel,
    question: query,
  })

  useEffect(() => {
    if (!open) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('is-help-assistant-open')
    return () => {
      document.body.style.overflow = previous
      document.body.classList.remove('is-help-assistant-open')
    }
  }, [open])

  useEffect(() => {
    if (!open || typeof window === 'undefined' || !window.visualViewport) return undefined
    const viewport = window.visualViewport
    const sync = () => {
      const inset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      setKeyboardInset(inset)
    }
    sync()
    viewport.addEventListener('resize', sync)
    viewport.addEventListener('scroll', sync)
    return () => {
      viewport.removeEventListener('resize', sync)
      viewport.removeEventListener('scroll', sync)
    }
  }, [open])

  if (!open) return null

  const showSupport = supportOpen || (query.trim() && result.matches.length === 0)
  const staffBilling = !article && result.matches.length === 1 && result.matches[0].article.id === 'billing-staff'

  async function submitAi(event) {
    event.preventDefault()
    if (!ask || !query.trim()) return
    setAiBusy(true)
    setAiError('')
    setAiAnswer('')
    try {
      const articles = helpArticlesForModel(result.matches.map((item) => item.article), locale)
      const answer = await ask({ question: query.trim(), articles })
      if (!answer) setSupportOpen(true)
      else setAiAnswer(answer)
    } catch {
      setAiError(copy.empty)
      setSupportOpen(true)
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="help-assistant-root" data-help-chrome="">
      <button type="button" className="help-assistant-backdrop" aria-label={copy.close} onClick={onClose} />
      <section
        className="help-assistant-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-assistant-title"
        data-testid="help-assistant"
      >
        <header className="help-assistant-header">
          <div className="help-assistant-heading">
            {article ? (
              <button type="button" className="mobile-sheet-close-btn" aria-label={copy.back} onClick={() => setArticleId('')}>‹</button>
            ) : null}
            <div>
              <p className="mobile-screen-eyebrow">Help</p>
              <h2 id="help-assistant-title" className="mobile-screen-title">
                {article ? helpText(article.title, locale) : copy.title}
              </h2>
            </div>
          </div>
          <div className="help-assistant-header-actions">
            <div className="help-assistant-lang" role="group" aria-label="Language">
              <button type="button" className={locale === 'en' ? 'is-selected' : ''} aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button>
              <button type="button" className={locale === 'el' ? 'is-selected' : ''} aria-pressed={locale === 'el'} onClick={() => setLocale('el')}>EL</button>
            </div>
            <button type="button" className="mobile-sheet-close-btn" aria-label={copy.close} onClick={onClose}>✕</button>
          </div>
        </header>
        <form className="help-assistant-search" onSubmit={aiEnabled ? submitAi : (event) => event.preventDefault()}>
          <input
            data-testid="help-assistant-query"
            value={query}
            placeholder={copy.placeholder}
            aria-label={copy.placeholder}
            onChange={(event) => {
              setQuery(event.target.value)
              setArticleId('')
              setSectionId('')
              setSupportOpen(false)
              setAiAnswer('')
            }}
          />
          {aiEnabled ? (
            <button type="submit" className="help-assistant-ask" disabled={aiBusy}>{copy.ask}</button>
          ) : null}
        </form>
        <div
          className="help-assistant-body"
          style={{ paddingBottom: `calc(24px + env(safe-area-inset-bottom, 0px) + ${keyboardInset}px)` }}
        >
          {article ? (
            <article className="help-assistant-article" data-testid="help-assistant-article">
              <p>{helpText(article.summary, locale)}</p>
              <ol>
                {(article.steps?.[locale] || article.steps?.en || []).map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {article.screen && onNavigate ? (
                <button
                  type="button"
                  className="help-assistant-go"
                  onClick={() => {
                    onNavigate(article.screen)
                    onClose()
                  }}
                >
                  {copy.open}
                </button>
              ) : null}
            </article>
          ) : null}
          {!article && query.trim() && result.matches.length > 0 ? (
            <ul className="help-assistant-results" data-testid="help-assistant-results">
              {result.matches.map(({ article: item }) => (
                <li key={item.id}>
                  <button type="button" onClick={() => { setArticleId(item.id); setSupportOpen(false) }}>
                    <strong>{helpText(item.title, locale)}</strong>
                    <span>{helpText(item.summary, locale)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {!article && !query.trim() ? (
            <>
              <div className="help-assistant-topics" role="group" aria-label={locale === 'el' ? 'Θέματα' : 'Topics'}>
                {sections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    className={sectionId === section.id ? 'is-selected' : ''}
                    aria-pressed={sectionId === section.id}
                    onClick={() => setSectionId((current) => (current === section.id ? '' : section.id))}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
              <ul className="help-assistant-suggestions">
                {sectionId
                  ? sectionArticles.map((item) => (
                    <li key={item.id}>
                      <button type="button" onClick={() => setArticleId(item.id)}>
                        <strong>{helpText(item.title, locale)}</strong>
                        <span>{helpText(item.summary, locale)}</span>
                      </button>
                    </li>
                  ))
                  : result.suggestions.map((item) => (
                    <li key={item.articleId}>
                      <button type="button" onClick={() => { setQuery(item.question); setArticleId(item.articleId) }}>
                        {item.question}
                      </button>
                    </li>
                  ))}
              </ul>
            </>
          ) : null}
          {staffBilling && !showSupport ? <p className="help-assistant-note">{copy.managers}</p> : null}
          {aiAnswer ? <p className="help-assistant-ai" data-testid="help-assistant-ai">{aiAnswer}</p> : null}
          {showSupport ? (
            <div className="help-assistant-support" data-testid="help-assistant-support">
              <p>{copy.empty}</p>
              <p>{copy.emailLead}</p>
              <a className="help-assistant-mail" href={mailto}>{copy.email}</a>
            </div>
          ) : null}
          {aiError ? <p className="help-assistant-note">{aiError}</p> : null}
          {showSupport ? null : (
            <button type="button" className="help-assistant-still" onClick={() => setSupportOpen(true)}>
              {copy.still}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

export function HelpAssistantRoot(props) {
  const open = useHelpOpen()
  return (
    <HelpAssistant
      {...props}
      open={open}
      aiEnabled={props.aiEnabled ?? helpAiEnabled()}
      onClose={closeHelpAssistant}
    />
  )
}
