import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LegalPage } from './legal/LegalPage.jsx'

export function mountLegalPage(path) {
  const params = new URLSearchParams(window.location.search)
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <LegalPage path={path} lang={params.get('lang') || 'el'} done={params.get('done') === '1'} />
    </StrictMode>,
  )
}
