import { useMemo } from 'react'
import deleteEl from './delete-account-el.md?raw'
import deleteEn from './delete-account-en.md?raw'
import { legalDocTitle, legalDocument } from './documents'
import { renderLegalMarkdown } from './markdown'
import { detectLocale, t } from '../i18n/i18n'
import './legal.css'

const PATHS = {
  '/privacy': 'privacy',
  '/terms': 'terms',
  '/dpa': 'dpa',
  '/cookies': 'cookies',
}

export const LEGAL_ROUTES = {
  '/privacy': true,
  '/terms': true,
  '/dpa': true,
  '/cookies': true,
  '/delete-account': true,
}

export function resolveLegalRoute(pathname = '') {
  const path = `${pathname}`.replace(/\/+$/, '') || '/'
  return LEGAL_ROUTES[path] ? path : null
}

export function LegalPage({ path, lang, done = false }) {
  const language = (lang || detectLocale()) === 'en' ? 'en' : 'el'
  const docId = PATHS[path]
  const markdown = useMemo(() => {
    if (path === '/delete-account') return language === 'el' ? deleteEl : deleteEn
    return legalDocument(docId, language)?.markdown || ''
  }, [path, docId, language])
  const html = useMemo(() => renderLegalMarkdown(markdown), [markdown])
  const other = language === 'el' ? 'en' : 'el'

  return (
    <main className="legal-page" lang={language}>
      <nav className="legal-nav">
        <a href="/">← ONE</a>
        <span className="legal-nav-links">
          <a href={`/privacy?lang=${language}`}>{legalDocTitle('privacy', language)}</a>
          <a href={`/terms?lang=${language}`}>{legalDocTitle('terms', language)}</a>
          <a href={`/dpa?lang=${language}`}>{legalDocTitle('dpa', language)}</a>
          <a href={`/cookies?lang=${language}`}>{legalDocTitle('cookies', language)}</a>
          <a href={`/delete-account?lang=${language}`}>{language === 'el' ? 'Διαγραφή' : t('Deletion')}</a>
          <a href={`${path}?lang=${other}`}>{other === 'en' ? 'English' : 'Ελληνικά'}</a>
        </span>
      </nav>
      {done ? (
        <p className="legal-done" role="status">
          {language === 'el' ? 'Ο λογαριασμός σου διαγράφηκε.' : t('Your account has been deleted.')}
        </p>
      ) : null}
      <article className="legal-article" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  )
}
