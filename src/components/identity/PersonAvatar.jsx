import { useState } from 'react'
import { resolveEmployeePhotoUrl } from '../../lib/identity/employeeIdentityResolve'
import { getProfileInitials } from '../../lib/workspaceProfileUtils'
import { useAvatarDirectory } from '../../context/AvatarDirectoryContext'

export function PersonAvatar({
  employeeId = '',
  memberId = '',
  authUserId = '',
  name = '',
  fallback = '',
  alt = '',
}) {
  const directory = useAvatarDirectory()
  const photo = directory.lookup({ employeeId, memberId, authUserId })
  const src = photo?.url
    ? resolveEmployeePhotoUrl({
      photoUrl: photo.url,
      avatarVersion: photo.updatedAt,
    })
    : ''
  const [failedSrc, setFailedSrc] = useState('')
  const initials = fallback || getProfileInitials(name)
  if (src && failedSrc !== src) {
    return <img src={src} alt={alt} onError={() => setFailedSrc(src)} />
  }
  return initials
}
