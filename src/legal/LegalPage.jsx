import { useMemo } from 'react'
import privacyEl from './privacy-policy-el.md?raw'
import privacyEn from './privacy-policy-en.md?raw'
import termsEl from './terms-el.md?raw'
import termsEn from './terms-en.md?raw'
import deleteEl from './delete-account-el.md?raw'
import deleteEn from './delete-account-en.md?raw'
import { renderLegalMarkdown } from './markdown'
import './legal.css'

export const LEGAL_ROUTES = {
  '/privacy': { el: privacyEl, en: privacyEn },
  '/terms': { el: termsEl, en: termsEn },
  '/delete-account': { el: deleteEl, en: deleteEn },
}

export function resolveLegalRoute(pathname = '') {
  const path = `${pathname}`.replace(/\/+$/, '') || '/'
  return LEGAL_ROUTES[path] ? path : null
}

export function LegalPage({ path, lang = 'el', done = false }) {
  const doc = LEGAL_ROUTES[path] ?? LEGAL_ROUTES['/privacy']
  const language = lang === 'en' ? 'en' : 'el'
  const html = useMemo(() => renderLegalMarkdown(doc[language]), [doc, language])
  const other = language === 'el' ? 'en' : 'el'

  return (
    <main className="legal-page" lang={language}>
      <nav className="legal-nav">
        <a href="/">← ONE</a>
        <span className="legal-nav-links">
          <a href={`/privacy?lang=${language}`}>{language === 'el' ? 'Απόρρητο' : 'Privacy'}</a>
          <a href={`/terms?lang=${language}`}>{language === 'el' ? 'Όροι' : 'Terms'}</a>
          <a href={`/delete-account?lang=${language}`}>{language === 'el' ? 'Διαγραφή' : 'Deletion'}</a>
          <a href={`${path}?lang=${other}`}>{other === 'en' ? 'English' : 'Ελληνικά'}</a>
        </span>
      </nav>
      {done ? (
        <p className="legal-done" role="status">
          {language === 'el' ? 'Ο λογαριασμός σου διαγράφηκε.' : 'Your account has been deleted.'}
        </p>
      ) : null}
      <article className="legal-article" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  )
}
