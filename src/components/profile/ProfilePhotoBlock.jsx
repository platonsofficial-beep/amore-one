import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useAvatarDirectory } from '../../context/AvatarDirectoryContext'
import { prepareAvatarImage } from '../../lib/avatarImage'
import { resolveEmployeePhotoUrl } from '../../lib/identity/employeeIdentityResolve'
import { getProfileInitials } from '../../lib/workspaceProfileUtils'
import { removeMyAvatar, uploadMyAvatar } from '../../services/avatarService'

const ACCEPT_LIBRARY = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif'

export function ProfilePhotoBlock({ displayName = '' }) {
  const { user, membership, refreshMembership } = useAuth()
  const directory = useAvatarDirectory()
  const takeRef = useRef(null)
  const chooseRef = useRef(null)
  const [chooserOpen, setChooserOpen] = useState(false)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [phase, setPhase] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const authUserId = `${user?.id ?? membership?.authUserId ?? ''}`.trim()
  const saved = directory.lookup({
    authUserId,
    memberId: membership?.id,
    employeeId: membership?.employeeId,
  })
  const hasPhoto = Boolean(saved?.url)
  const initials = getProfileInitials(displayName || membership?.displayName || user?.email || '')
  const circleUrl = draft?.previewUrl
    || (saved?.url ? resolveEmployeePhotoUrl({ photoUrl: saved.url, avatarVersion: saved.updatedAt }) : '')

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  function releaseDraft(nextDraft) {
    if (nextDraft?.previewUrl) URL.revokeObjectURL(nextDraft.previewUrl)
  }

  async function onFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setPhase('preparing')
    setError('')
    setNotice('')
    try {
      const prepared = await prepareAvatarImage(file)
      setDraft((current) => {
        releaseDraft(current)
        return prepared
      })
      setChooserOpen(false)
    } catch (prepareError) {
      setError(prepareError?.message || 'Could not prepare that photo.')
    } finally {
      setBusy(false)
      setPhase('')
    }
  }

  function cancelDraft() {
    setDraft((current) => {
      releaseDraft(current)
      return null
    })
    setError('')
  }

  async function savePhoto() {
    if (!draft?.blob || busy) return
    if (!authUserId) {
      setError('Sign in to update your photo.')
      return
    }
    const previewUrl = draft.previewUrl
    const updatedAt = new Date().toISOString()
    setBusy(true)
    setPhase('saving')
    setError('')
    directory.setOptimistic(authUserId, {
      url: previewUrl,
      path: 'pending',
      updatedAt,
    })
    try {
      const result = await uploadMyAvatar({
        authUserId,
        blob: draft.blob,
        previousPath: membership?.avatarPath || saved?.path || '',
      })
      directory.setOptimistic(authUserId, {
        url: previewUrl,
        path: result.path,
        updatedAt: result.updatedAt || updatedAt,
      })
      setDraft(null)
      setNotice('Photo updated')
    } catch (saveError) {
      directory.setOptimistic(authUserId, null)
      setError(saveError?.message || 'Could not update your photo. Try again.')
      return
    } finally {
      setBusy(false)
      setPhase('')
    }
    await refreshMembership?.().catch(() => {})
    await directory.refresh?.().catch(() => {})
  }

  async function removePhoto() {
    if (busy) return
    if (!authUserId) {
      setError('Sign in to update your photo.')
      return
    }
    setBusy(true)
    setError('')
    setChooserOpen(false)
    directory.setOptimistic(authUserId, { removed: true })
    try {
      await removeMyAvatar({
        authUserId,
        previousPath: membership?.avatarPath || saved?.path || '',
      })
      setNotice('Photo removed')
    } catch (removeError) {
      directory.setOptimistic(authUserId, null)
      setError(removeError?.message || 'Could not update your photo. Try again.')
      return
    } finally {
      setBusy(false)
    }
    await refreshMembership?.().catch(() => {})
    await directory.refresh?.().catch(() => {})
  }

  return (
    <section className="mobile-card profile-photo-block" aria-label="Profile photo">
      <p className="mobile-card-label">Profile photo</p>
      <div className="profile-photo-circle" role="img" aria-label={hasPhoto || draft ? 'Profile photo' : 'Profile initials'}>
        {circleUrl ? <img src={circleUrl} alt="" /> : <span>{initials}</span>}
      </div>
      {draft ? <p className="profile-photo-caption">This is how your photo will look.</p> : null}

      {draft ? (
        <div className="profile-photo-actions">
          <button type="button" className="mobile-primary-btn" onClick={savePhoto} disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="mobile-secondary-btn" onClick={cancelDraft} disabled={busy}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="profile-photo-actions">
          {hasPhoto ? (
            <button type="button" className="mobile-primary-btn" onClick={() => setChooserOpen((open) => !open)} disabled={busy}>
              Change photo
            </button>
          ) : (
            <button type="button" className="mobile-primary-btn" onClick={() => setChooserOpen((open) => !open)} disabled={busy}>
              Add photo
            </button>
          )}
          {hasPhoto ? (
            <button type="button" className="mobile-secondary-btn" onClick={removePhoto} disabled={busy}>
              Remove photo
            </button>
          ) : null}
        </div>
      )}

      {chooserOpen && !draft ? (
        <div className="profile-photo-picker">
          <button type="button" className="mobile-secondary-btn" onClick={() => takeRef.current?.click()} disabled={busy}>
            Take photo
          </button>
          <button type="button" className="mobile-secondary-btn" onClick={() => chooseRef.current?.click()} disabled={busy}>
            Choose photo
          </button>
        </div>
      ) : null}

      <input
        ref={takeRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={onFile}
      />
      <input
        ref={chooseRef}
        type="file"
        accept={ACCEPT_LIBRARY}
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={onFile}
      />

      {phase === 'preparing' ? <p className="profile-photo-caption">Preparing photo…</p> : null}
      {error ? <p className="mobile-profile-error" role="alert">{error}</p> : null}
      {notice ? <p className="profile-photo-toast" role="status">{notice}</p> : null}
    </section>
  )
}
