import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import { getLocale, t, useLocale } from '../i18n/i18n'
import { OneFullLogo } from '../components/brand/OneFullLogo'
import { LEGAL_BUNDLE, LEGAL_DOC_IDS, requiresDpa } from './provider'
import { legalDocTitle, legalDocument } from './documents'
import { renderLegalMarkdown } from './markdown'
import { buildAcceptanceRecord, loadAcceptance, saveAcceptance } from './acceptance'
import { supabase } from '../lib/supabaseClient'
import './legalGate.css'

function GateDocument({ docId, onBack }) {
  const locale = useLocale()
  const doc = legalDocument(docId, locale)
  return (
    <div className="legal-gate-doc">
      <button type="button" className="ghost-btn legal-gate-back" onClick={() => { onBack() }}>
        {t('Back to acceptance')}
      </button>
      <article className="legal-article" dangerouslySetInnerHTML={{ __html: renderLegalMarkdown(doc?.markdown || '') }} />
    </div>
  )
}

export function LegalAcceptanceGate({ children }) {
  const auth = useAuth()
  const locale = useLocale()
  const userId = auth?.user?.id || ''
  const workspaceId = auth?.workspace?.id || auth?.membership?.workspaceId || ''
  const email = auth?.user?.email || ''
  const role = auth?.role || auth?.membership?.role || ''
  const [phase, setPhase] = useState('checking')
  const [checked, setChecked] = useState(false)
  const [reading, setReading] = useState('')
  const [busy, setBusy] = useState(false)
  const needsDpa = requiresDpa(role)
  const docs = LEGAL_DOC_IDS.filter((id) => id !== 'dpa' || needsDpa)

  useEffect(() => {
    let cancel = false
    if (!userId) {
      setPhase('gate')
      return undefined
    }
    setPhase('checking')
    loadAcceptance({ userId, workspaceId, email, role, client: supabase }).then((result) => {
      if (!cancel) setPhase(result.accepted ? 'open' : 'gate')
    }).catch(() => {
      if (!cancel) setPhase('gate')
    })
    return () => { cancel = true }
  }, [userId, workspaceId, email, role, locale])

  const accept = async () => {
    if (!checked || busy) return
    setBusy(true)
    const record = buildAcceptanceRecord({
      userId,
      workspaceId,
      email,
      role,
      locale: getLocale(),
      userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    })
    try {
      await saveAcceptance(record, supabase)
    } catch {
      // The local record is written first. A missing table must not trap the user.
    }
    setPhase('open')
    setBusy(false)
  }

  if (phase === 'open') return children

  const checkbox = needsDpa
    ? t('I have read and accept the Terms of Service, the Privacy Policy, and the Data Processing Agreement')
    : t('I have read and accept the Terms of Service and Privacy Policy')

  const gate = (
    <div className="legal-gate" role="dialog" aria-modal="true" aria-labelledby="legal-gate-title">
      <div className="legal-gate-card">
        <OneFullLogo compact />
        {phase === 'checking' ? (
          <p className="legal-gate-wait">{t('Checking acceptance…')}</p>
        ) : reading ? (
          <GateDocument docId={reading} onBack={() => { setReading('') }} />
        ) : (
          <>
            <h1 id="legal-gate-title">{t('Before you continue')}</h1>
            <p className="legal-gate-lead">{t('ONE needs your acceptance of the current legal documents.')}</p>
            <p className="legal-gate-version">
              {t('Version {{version}}, effective {{date}}', { version: LEGAL_BUNDLE.id, date: LEGAL_BUNDLE.effectiveDate })}
            </p>
            <ul className="legal-gate-docs">
              {docs.map((id) => (
                <li key={id}>
                  <button type="button" onClick={() => setReading(id)}>
                    {legalDocTitle(id, locale)}
                  </button>
                </li>
              ))}
            </ul>
            <label className="legal-gate-check">
              <input
                type="checkbox"
                checked={checked}
                onChange={(event) => { setChecked(event.target.checked) }}
              />
              <span>{checkbox}</span>
            </label>
            <div className="legal-gate-actions">
              <button type="button" className="primary-btn" disabled={!checked || busy} onClick={accept}>
                {busy ? t('Please wait…') : t('Accept')}
              </button>
              <button type="button" className="ghost-btn" onClick={() => auth?.signOut?.()}>
                {t('Sign out')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )

  if (typeof document === 'undefined') return gate
  return createPortal(gate, document.body)
}
