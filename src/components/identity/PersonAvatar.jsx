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
  if (photo?.url) {
    const src = resolveEmployeePhotoUrl({
      photoUrl: photo.url,
      avatarVersion: photo.updatedAt,
    })
    return <img src={src} alt={alt} />
  }
  return fallback || getProfileInitials(name)
}
